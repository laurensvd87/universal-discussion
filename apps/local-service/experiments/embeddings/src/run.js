// No implicit download: guard installed before loading any third-party runtime.
import "../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { experimentRoot, cacheRoot, modelAssets, verifyFile, safePath, treeBytes,
  INSTALLED_CAP, withAcquisitionLock } from "./acquire.js";
import { createLexicalVectors, evaluateVectors } from "./evaluate.js";
import { assertFrozenCorpus, EXPECTED_CORPUS_DIGEST, validateDescriptor, validateTokenIds,
  meanPoolHidden, buildE5ModelId, summarizeTimings } from "./experiment-core.js";
import { parseSafetensors, quantizeTable, serializeQuantizedTable, parseQuantizedTable,
  encodeTokenIds, getVectorMetadata } from "./static-encoder.js";

const requireRuntime = createRequire(path.join(experimentRoot, "runtime/package.json"));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const staticAsset = modelAssets.find(asset => asset.file.endsWith(".safetensors"));
const tokenizerAsset = modelAssets.find(asset => asset.target === "assets/static/0_StaticEmbedding/tokenizer.json");
const modes = ["lexical", "build", "static-f32-1024", "static-f32-256", "static-f32-128", "static-int8-256", "static-int8-128", "e5"];
const readJson = async (filename, maxBytes = 20 * 1024 * 1024) => {
  const info = await lstat(filename);
  if (!info.isFile() || info.size > maxBytes) throw new Error("Invalid local JSON file size/type");
  return JSON.parse(await readFile(filename, "utf8"));
};

async function verifyLicenses() {
  for (const [target, label] of [["assets/static/README.md", "apache-2.0"], ["licenses/e5-upstream-README.md", "mit"]]) {
    const spec = modelAssets.find(item => item.target === target);
    const file = await asset(spec);
    const card = await readFile(file.filename, "utf8");
    if (!card.split("---")[1]?.includes(`license: ${label}`)) throw new Error("Pinned model license evidence missing");
  }
}

async function asset(spec) {
  const filename = path.join(cacheRoot, spec.target);
  const verified = await verifyFile(filename, spec);
  return { filename, ...verified };
}
async function footprint(extra = 0) {
  const bytes = await treeBytes(experimentRoot);
  if (bytes + extra > INSTALLED_CAP) throw new Error("Approved installed cap would be exceeded");
  return bytes;
}
async function runtime() {
  for (const [name, version] of [["@huggingface/transformers", "4.3.0"], ["@huggingface/tokenizers", "0.2.0"], ["onnxruntime-node", "1.30.0"]]) {
    const pkg = await readJson(path.join(experimentRoot, "runtime/node_modules", name, "package.json"));
    if (pkg.version !== version) throw new Error("Unapproved runtime version");
  }
  const imported = await import(pathToFileURL(requireRuntime.resolve("@huggingface/tokenizers")).href);
  return imported.Tokenizer ?? imported.default?.Tokenizer;
}
function metadata(tokenizerSha256) {
  return { modelId: staticAsset.repo, revision: staticAsset.revision,
    sourceSha256: staticAsset.hash, tokenizerSha256 };
}
async function build() {
  const tokenFile = await asset(tokenizerAsset);
  const source = await asset(staticAsset);
  const table = parseSafetensors(await readFile(source.filename), { metadata: metadata(tokenFile.sha256) });
  const directory = await safePath(path.join(cacheRoot, "derived"));
  await mkdir(directory, { recursive: true });
  const manifest = { source: metadata(tokenFile.sha256), packs: [] };
  for (const dimensions of [128, 256]) {
    const tableBytes = serializeQuantizedTable(quantizeTable(table, dimensions));
    await footprint(tableBytes.length + 8192);
    const filename = `static-int8-${dimensions}.bin`;
    await safePath(path.join(directory, filename));
    await writeFile(path.join(directory, filename), tableBytes, { flag: "wx" });
    manifest.packs.push({ filename, dimensions, bytes: tableBytes.length, sha256: sha(tableBytes),
      withTokenizerBytes: tableBytes.length + tokenFile.bytes });
  }
  await writeFile(path.join(directory, "manifest.json"), JSON.stringify(manifest, null, 2), { flag: "wx" });
  return manifest;
}
async function staticEncoder(mode, Tokenizer) {
  const dimensions = Number(mode.split("-").at(-1));
  const tokenFile = await asset(tokenizerAsset);
  const tokenizerJson = await readJson(tokenFile.filename);
  if (tokenizerJson.truncation !== null || tokenizerJson.padding !== null) throw new Error("Unexpected static tokenizer truncation/padding");
  const tokenizer = new Tokenizer(tokenizerJson, {});
  if (tokenizer.get_vocab().size !== 105879) throw new Error("Unexpected static vocabulary size");
  const identity = metadata(tokenFile.sha256);
  let table, modelBytes;
  if (mode.includes("int8")) {
    const manifestFile = await safePath(path.join(cacheRoot, "derived/manifest.json"), { allowMissing: false });
    const manifest = await readJson(manifestFile, 8192);
    const pack = manifest.packs.find(item => item.dimensions === dimensions);
    if (!pack || pack.filename !== `static-int8-${dimensions}.bin` || pack.bytes > 32 * 1024 * 1024) throw new Error("Invalid derived manifest");
    const filename = path.join(cacheRoot, "derived", pack.filename);
    await verifyFile(filename, { size: pack.bytes, kind: "sha256", hash: pack.sha256 });
    table = parseQuantizedTable(await readFile(filename), { expectedDimensions: dimensions, expectedMetadata: identity });
    modelBytes = pack.bytes;
  } else {
    const source = await asset(staticAsset);
    table = parseSafetensors(await readFile(source.filename), { metadata: identity });
    modelBytes = source.bytes;
  }
  const numeric = getVectorMetadata(table, { dimensions });
  const modelId = `static-js-uncertified:${sha(JSON.stringify({ numeric, tokenization: "@huggingface/tokenizers@0.2.0/no-special-tokens/no-prefix/v1" }))}`;
  return { modelId, dimensions, modelBytes, tokenizerBytes: tokenFile.bytes,
    implementation: { numeric, tokenization: "no special tokens; no prefix; no truncation; parity with other runtimes NOT certified" },
    encode(text) {
      const ids = validateTokenIds(tokenizer.encode(validateDescriptor(text), { add_special_tokens: false }).ids, { rows: table.rows });
      const result = encodeTokenIds(table, ids, { dimensions });
      if (result.status !== "ok") throw new Error("Static encoder abstained on frozen corpus");
      return { values: Array.from(result.vector), tokens: ids.length };
    },
  };
}
async function e5Encoder(Tokenizer) {
  const verified = {};
  for (const spec of modelAssets.filter(item => item.target.startsWith("assets/e5/"))) verified[spec.file] = await asset(spec);
  const tokenJson = await readJson(verified["tokenizer.json"].filename);
  const tokenConfig = await readJson(verified["tokenizer_config.json"].filename);
  const config = await readJson(verified["config.json"].filename);
  if (config.hidden_size !== 384 || config.model_type !== "bert" || tokenJson.truncation !== null || tokenJson.padding !== null) throw new Error("Unexpected E5 configuration");
  const tokenizer = new Tokenizer(tokenJson, tokenConfig);
  const ort = requireRuntime("onnxruntime-node");
  ort.env.logLevel = "error";
  const session = await ort.InferenceSession.create(verified["onnx/model_quantized.onnx"].filename, {
    executionProviders: ["cpu"], intraOpNumThreads: 1, interOpNumThreads: 1,
    executionMode: "sequential", graphOptimizationLevel: "all", logSeverityLevel: 3,
  });
  if (JSON.stringify([...session.inputNames].sort()) !== JSON.stringify(["attention_mask", "input_ids", "token_type_ids"]) ||
      !session.outputNames.includes("last_hidden_state")) {
    await session.release(); throw new Error("Unexpected E5 graph inputs/outputs");
  }
  const modelId = buildE5ModelId({ sourceSha256: verified["onnx/model_quantized.onnx"].sha256,
    tokenizerSha256: verified["tokenizer.json"].sha256, configSha256: verified["config.json"].sha256,
    tokenizerConfigSha256: verified["tokenizer_config.json"].sha256,
    specialTokensSha256: verified["special_tokens_map.json"].sha256,
    revision: modelAssets.find(item => item.target.startsWith("assets/e5/")).revision });
  return { modelId, dimensions: 384, modelBytes: verified["onnx/model_quantized.onnx"].bytes,
    tokenizerBytes: verified["tokenizer.json"].bytes,
    implementation: { inputNames: session.inputNames, outputNames: session.outputNames, prefix: "query: ",
      pooling: "masked mean of unpooled hidden states including special tokens, then L2", cpuThreads: 1 },
    dispose: () => session.release(),
    async encode(text) {
      const encoded = tokenizer.encode(`query: ${validateDescriptor(text)}`, { add_special_tokens: true, return_token_type_ids: true });
      const ids = validateTokenIds(encoded.ids, { rows: config.vocab_size });
      const feeds = {};
      for (const name of session.inputNames) {
        const values = name === "input_ids" ? ids : encoded[name];
        if (!values || values.length !== ids.length) throw new Error("Unexpected E5 token inputs");
        feeds[name] = new ort.Tensor("int64", BigInt64Array.from(values, BigInt), [1, ids.length]);
      }
      const output = await session.run(feeds);
      const hidden = output.last_hidden_state;
      const values = meanPoolHidden({ data: hidden.data, dims: [...hidden.dims] }, encoded.attention_mask);
      return { values: [...values], tokens: ids.length };
    },
  };
}

async function run(mode) {
  const started = performance.now();
  const corpus = assertFrozenCorpus(await readJson(path.join(experimentRoot, "fixtures/corpus.json")));
  await footprint();
  if (mode !== "lexical") await verifyLicenses();
  if (mode === "build") return { mode, derived: await build(), elapsedMs: performance.now() - started };
  let collection, measurements;
  if (mode === "lexical") {
    collection = createLexicalVectors(corpus);
    measurements = { elapsedMs: performance.now() - started };
  } else {
    const Tokenizer = await runtime();
    const encoder = mode === "e5" ? await e5Encoder(Tokenizer) : await staticEncoder(mode, Tokenizer);
    const loadMs = performance.now() - started;
    const firstPass = [], warmPass = [], tokens = [];
    const vectors = [];
    try {
      for (const item of corpus.descriptors) {
        const start = performance.now();
        const result = await encoder.encode(item.text);
        firstPass.push(performance.now() - start); tokens.push(result.tokens);
        vectors.push({ id: item.id, modelId: encoder.modelId, values: result.values });
      }
      for (const item of corpus.descriptors) {
        const start = performance.now(); await encoder.encode(item.text); warmPass.push(performance.now() - start);
      }
      collection = { modelId: encoder.modelId, dimensions: encoder.dimensions, vectors };
      measurements = { loadMs, firstInferenceMs: firstPass[0], firstPassMs: summarizeTimings(firstPass),
        warmPassMs: summarizeTimings(warmPass), maxTokens: Math.max(...tokens), modelBytes: encoder.modelBytes,
        tokenizerBytes: encoder.tokenizerBytes, implementation: encoder.implementation };
    } finally { await encoder.dispose?.(); }
  }
  const report = evaluateVectors(corpus, collection);
  return { mode, corpusFreezeCommit: "821baf7", corpusDigest: EXPECTED_CORPUS_DIGEST,
    provenance: { node: process.version, platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model,
      lockSha256: sha(await readFile(path.join(experimentRoot, "runtime/package-lock.json"))),
      memoryNote: "Whole fresh process high-water RSS includes validation/evaluation; not isolated model RAM. Load includes integrity reads; OS cache not flushed." },
    measurements: { ...measurements, peakRssKiB: process.resourceUsage().maxRSS, elapsedMs: performance.now() - started },
    collection, report };
}

async function main() {
  const mode = process.argv[2];
  if (!modes.includes(mode) || process.argv.length !== 3) throw new Error(`Choose one mode: ${modes.join(", ")}`);
  await safePath(cacheRoot);
  await withAcquisitionLock(async () => {
    const result = await run(mode);
    const directory = path.join(experimentRoot, "output");
    await safePath(directory, { root: experimentRoot });
    await mkdir(directory, { recursive: true });
    const body = JSON.stringify(result, null, 2);
    result.installedBytesBeforeReport = await footprint(Buffer.byteLength(body) + 1024);
    const filename = `${mode}-${new Date().toISOString().replaceAll(":", "-")}.json`;
    await writeFile(path.join(directory, filename), JSON.stringify(result, null, 2), { flag: "wx" });
    process.stdout.write(JSON.stringify({ mode, report: `output/${filename}`, installedBytes: await footprint(),
      metrics: result.report && { english: result.report.metrics.english, crossLanguage: result.report.metrics.crossLanguage }, hardNegatives: result.report && {
        strictWins: result.report.hardNegatives.strictWins, ties: result.report.hardNegatives.ties,
        failures: result.report.hardNegatives.failures }, measurements: result.measurements, derived: result.derived }) + "\n");
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
