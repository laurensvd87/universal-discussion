import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { MODEL_ID, ORT_VERSION, inputText, poolHidden, prefixTokenInput, readAssetManifest } from
  "../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js";

const DEFAULT_ASSET_ROOT = fileURLToPath(new URL("../../../../spikes/topic-resolution/browser/embedding/.assets/", import.meta.url));

async function fixedFile(filename, maximum) {
  const info = await lstat(filename);
  if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > maximum) throw new Error("Crawler embedding assets unavailable");
  const bytes = await readFile(filename);
  if (bytes.length !== info.size) { bytes.fill(0); throw new Error("Crawler embedding assets unavailable"); }
  return bytes;
}

export async function createPackagedCrawlerEmbedder({ assetRoot = DEFAULT_ASSET_ROOT } = {}) {
  if (typeof assetRoot !== "string" || !path.isAbsolute(assetRoot)) throw new TypeError("Invalid embedding asset path");
  const manifestBytes = await fixedFile(path.join(assetRoot, "manifest.json"), 16_384);
  let manifest;
  try { manifest = readAssetManifest(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes))); }
  finally { manifestBytes.fill(0); }
  const verified = new Map();
  try {
    for (const [filename, spec] of manifest) {
      const bytes = await fixedFile(path.join(assetRoot, filename), spec.bytes);
      if (createHash("sha256").update(bytes).digest("hex") !== spec.sha256) {
        bytes.fill(0); throw new Error("Crawler embedding asset integrity mismatch");
      }
      verified.set(filename, bytes);
    }
    const tokenizerModule = pathToFileURL(path.join(assetRoot, "tokenizers.mjs")).href;
    const runtimeModule = pathToFileURL(path.join(assetRoot, "ort.wasm.min.mjs")).href;
    const { Tokenizer } = await import(tokenizerModule);
    const ort = await import(runtimeModule);
    if (ort.env.versions.web !== ORT_VERSION) throw new Error("Crawler embedding runtime mismatch");
    const tokenizer = new Tokenizer(JSON.parse(verified.get("tokenizer.json")), JSON.parse(verified.get("tokenizer_config.json")));
    if (tokenizer.get_vocab().size !== 250002 || tokenizer.token_to_id("<s>") !== 0 || tokenizer.token_to_id("</s>") !== 2)
      throw new Error("Crawler embedding tokenizer mismatch");
    const config = JSON.parse(verified.get("config.json"));
    if (config.hidden_size !== 384 || config.vocab_size !== 250037 || config.model_type !== "bert")
      throw new Error("Crawler embedding model mismatch");
    ort.env.logLevel = "error";
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    ort.env.wasm.simd = true;
    ort.env.wasm.initTimeout = 30_000;
    ort.env.wasm.wasmPaths = { mjs: pathToFileURL(path.join(assetRoot, "ort-wasm-simd-threaded.mjs")).href,
      wasm: pathToFileURL(path.join(assetRoot, "ort-wasm-simd-threaded.wasm")).href };
    ort.env.wasm.wasmBinary = verified.get("ort-wasm-simd-threaded.wasm");
    const session = await ort.InferenceSession.create(verified.get("model.onnx"), {
      executionProviders: ["wasm"], executionMode: "sequential", graphOptimizationLevel: "all", logSeverityLevel: 3,
    });
    if (JSON.stringify([...session.inputNames].sort()) !== JSON.stringify(["attention_mask", "input_ids", "token_type_ids"]) ||
        !session.outputNames.includes("last_hidden_state")) {
      await session.release(); throw new Error("Crawler embedding graph mismatch");
    }
    let busy = false, closed = false;
    return Object.freeze({
      modelId: MODEL_ID,
      async embed(text) {
        inputText(text);
        if (busy || closed) throw new Error("Crawler embedding unavailable");
        busy = true;
        const tensors = [];
        let output;
        try {
          const encoded = prefixTokenInput(tokenizer, text);
          const feeds = Object.create(null);
          for (const name of session.inputNames) {
            const source = name === "input_ids" ? encoded.ids : encoded[name];
            const tensor = new ort.Tensor("int64", BigInt64Array.from(source, BigInt), [1, source.length]);
            tensors.push(tensor); feeds[name] = tensor;
          }
          output = await session.run(feeds);
          const values = poolHidden(output.last_hidden_state, encoded.attention_mask);
          return Object.freeze({ modelId: MODEL_ID, values: Object.freeze(values) });
        } finally {
          for (const tensor of [...Object.values(output ?? {}), ...tensors]) try { tensor?.dispose?.(); } catch { /* Release below remains authoritative. */ }
          busy = false;
        }
      },
      async close() {
        if (closed) return;
        if (busy) throw new Error("Crawler embedding busy");
        closed = true;
        await session.release();
        for (const bytes of verified.values()) bytes.fill(0);
        verified.clear();
      },
    });
  } catch (error) {
    for (const bytes of verified.values()) bytes.fill(0);
    throw error;
  }
}
