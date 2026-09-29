// Explicit acquisition CLI and inert integrity helpers. Never imported by the service.
import { createHash } from "node:crypto";
import { lstat, mkdir, open, readFile, readdir, realpath, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const experimentRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const cacheRoot = path.join(experimentRoot, ".cache");
export const DOWNLOAD_CAP = 1_073_741_824;
export const INSTALLED_CAP = 2_147_483_648;
// Conservatively reserve for registry/HF metadata, redirects and HTTP overhead.
export const METADATA_RESERVE = 64 * 1024 * 1024;
const METADATA_BODY_CAP = 4 * 1024 * 1024;
const REQUEST_OVERHEAD = 6 * 64 * 1024;
const LEDGER_CAP = 1024 * 1024;
const staticRepo = "sentence-transformers/static-similarity-mrl-multilingual-v1";
const staticRevision = "bae9c8b1d48e8962a2ce7cb207662ed2a8441ccc";
const e5Repo = "Xenova/multilingual-e5-small";
const e5Revision = "761b726dd34fb83930e26aab4e9ac3899aa1fa78";

const entry = (repo, revision, file, size, hash, kind = "git") => ({
  repo, revision, file, size, hash, kind,
  target: `assets/${repo === staticRepo ? "static" : "e5"}/${file}`,
  url: `https://huggingface.co/${repo}/resolve/${revision}/${file}`,
});
export const modelAssets = Object.freeze([
  entry(staticRepo, staticRevision, "0_StaticEmbedding/model.safetensors", 433680480, "8245ab78ee71dded845a82d2270fcb9e785b29dad0e1619f69d5390c47d9ba00", "sha256"),
  entry(staticRepo, staticRevision, "0_StaticEmbedding/tokenizer.json", 2563370, "24ce57bee78a391706c443e2417f3339a842438f"),
  entry(staticRepo, staticRevision, "README.md", 148257, "6182c9ccf2610dbe5462741066d1b0dfc0f30b1c"),
  entry(staticRepo, staticRevision, "config_sentence_transformers.json", 219, "9289d8e153f69e4924062f64eb7f10c16f99a3ca"),
  entry(staticRepo, staticRevision, "modules.json", 141, "a26e6891b5d93556c051c8b5cf4eeb24c5dd4ed2"),
  entry(e5Repo, e5Revision, "onnx/model_quantized.onnx", 118308185, "f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193", "sha256"),
  entry(e5Repo, e5Revision, "tokenizer.json", 17082730, "0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39", "sha256"),
  entry(e5Repo, e5Revision, "config.json", 658, "4104f38273cc595fd9500fd243124e9f6cf383dc"),
  entry(e5Repo, e5Revision, "tokenizer_config.json", 443, "059214673d9d6d2ee319411e2ffec8c024b816d5"),
  entry(e5Repo, e5Revision, "special_tokens_map.json", 167, "e0b1d18ecd0ae4ff1d47bd297d910c0cf83e504b"),
  entry(e5Repo, e5Revision, "README.md", 1077, "53e76ac0e07cb45ebbf3870244998e0f08632d4f"),
  { ...entry("intfloat/multilingual-e5-small", "614241f622f53c4eeff9890bdc4f31cfecc418b3", "README.md", 497538,
    "e56327af55e9742caf76bff9ba83b6904cd2003d"), target: "licenses/e5-upstream-README.md" },
]);

export function allowedDownloadUrl(value) {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password &&
    (!url.port || url.port === "443") &&
    (url.hostname === "registry.npmjs.org" || url.hostname === "huggingface.co" ||
     url.hostname.endsWith(".huggingface.co") || url.hostname.endsWith(".hf.co"));
}

export async function boundedResponse(url, fetcher = globalThis.fetch) {
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    if (!allowedDownloadUrl(url)) throw new Error("Unapproved artifact host");
    const response = await fetcher(url, { redirect: "manual", signal: AbortSignal.timeout(120_000) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) throw new Error("Invalid artifact redirect");
      url = new URL(location, url).href;
      continue;
    }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`Artifact HTTP ${response.status}`); }
    return response;
  }
  throw new Error("Too many artifact redirects");
}

// Explicit roots are trusted local test injections. The CLI always uses cacheRoot.
// Check each existing parent below root; hostile same-user replacement races are
// outside this local tool's threat model, but pre-existing links fail closed.
export async function safePath(filename, { root = cacheRoot, allowMissing = true } = {}) {
  root = path.resolve(root);
  filename = path.resolve(filename);
  const relative = path.relative(root, filename);
  if (relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) throw new Error("Invalid artifact path");
  const rootInfo = await lstat(root);
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) throw new Error("Unexpected symlink or cache root type");
  const canonicalRoot = await realpath(root);
  let current = root;
  for (const component of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink()) throw new Error("Unexpected symlink in artifact path");
      const canonical = await realpath(current);
      const resolvedRelative = path.relative(canonicalRoot, canonical);
      if (resolvedRelative === ".." || resolvedRelative.startsWith(`..${path.sep}`) || path.isAbsolute(resolvedRelative)) throw new Error("Artifact escaped cache root");
    } catch (error) {
      if (allowMissing && error.code === "ENOENT") return filename;
      throw error;
    }
  }
  return filename;
}

export async function withAcquisitionLock(action, { root = cacheRoot } = {}) {
  const filename = await safePath(path.join(root, "acquisition.lock"), { root });
  let handle;
  try { handle = await open(filename, "wx"); }
  catch (error) {
    if (error.code === "EEXIST") throw new Error("Acquisition lock exists; stop concurrent acquisition or review a stale lock manually");
    throw error;
  }
  try {
    await handle.writeFile(JSON.stringify({ pid: process.pid, started: new Date().toISOString() }));
    return await action();
  } finally {
    await handle.close();
    await unlink(filename);
  }
}

export async function treeBytes(root) {
  const info = await lstat(root);
  if (info.isSymbolicLink() || !info.isDirectory()) throw new Error("Unexpected symlink in experiment footprint");
  let bytes = 0;
  for (const item of await readdir(root, { withFileTypes: true })) {
    if (item.isSymbolicLink()) throw new Error("Unexpected symlink in experiment footprint");
    const child = path.join(root, item.name);
    if (item.isDirectory()) bytes += await treeBytes(child);
    else if (item.isFile()) bytes += (await stat(child)).size;
  }
  return bytes;
}

function hashBytes(bytes, kind) {
  if (kind === "git") return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
  if (kind === "sha512") return createHash("sha512").update(bytes).digest("base64");
  return createHash("sha256").update(bytes).digest("hex");
}
export async function verifyFile(filename, spec, { root = cacheRoot } = {}) {
  await safePath(filename, { root, allowMissing: false });
  const info = await lstat(filename);
  const limit = spec.size ?? spec.maxBytes;
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > DOWNLOAD_CAP || !info.isFile() ||
      info.size > limit || (spec.size !== undefined && info.size !== spec.size)) throw new Error("Artifact integrity size mismatch");
  const bytes = await readFile(filename);
  if (bytes.length > limit || (spec.size !== undefined && bytes.length !== spec.size) ||
      hashBytes(bytes, spec.kind) !== spec.hash) throw new Error("Artifact integrity mismatch");
  return { bytes: bytes.length, sha256: hashBytes(bytes, "sha256") };
}

export async function loadLedger({ root = cacheRoot } = {}) {
  try {
    const filename = await safePath(path.join(root, "acquisition.json"), { root, allowMissing: false });
    const info = await lstat(filename);
    if (!info.isFile() || info.size > LEDGER_CAP) throw new Error("Invalid acquisition ledger size");
    const ledger = JSON.parse(await readFile(filename, "utf8"));
    if (ledger.version !== 1 || !Number.isSafeInteger(ledger.chargedBytes) ||
        ledger.chargedBytes < METADATA_RESERVE || ledger.chargedBytes > DOWNLOAD_CAP ||
        !Array.isArray(ledger.files) || !Array.isArray(ledger.pending) ||
        !Number.isSafeInteger(ledger.metadataChargedBytes) || ledger.metadataChargedBytes < 0 ||
        ledger.metadataChargedBytes > METADATA_RESERVE || ledger.metadataReserve !== METADATA_RESERVE)
      throw new Error("Invalid acquisition ledger");
    for (const file of [...ledger.files, ...ledger.pending]) {
      if (!file || typeof file.target !== "string") throw new Error("Invalid acquisition ledger entry");
      await safePath(path.resolve(root, file.target), { root });
    }
    return ledger;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return { version: 1, metadataReserve: METADATA_RESERVE, metadataChargedBytes: 0,
      chargedBytes: METADATA_RESERVE, files: [], pending: [] };
  }
}
export async function saveLedger(ledger, { root = cacheRoot } = {}) {
  const next = await safePath(path.join(root, "acquisition.json.next"), { root });
  const current = await safePath(path.join(root, "acquisition.json"), { root });
  const body = JSON.stringify(ledger, null, 2);
  if (Buffer.byteLength(body) > LEDGER_CAP) throw new Error("Acquisition ledger size limit");
  await writeFile(next, body);
  // Windows scanners can briefly hold the destination. Retry only the atomic
  // rename, never a network operation or an unrecorded reservation.
  for (let attempt = 0; ; attempt += 1) {
    try { await rename(next, current); break; }
    catch (error) {
      if (process.platform !== "win32" || !["EPERM", "EACCES", "EBUSY"].includes(error.code) || attempt >= 5) throw error;
      await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
}

export async function chargeMetadata(ledger, bytes, { root = cacheRoot } = {}) {
  if (!Number.isSafeInteger(bytes) || bytes <= 0 ||
      !Number.isSafeInteger(ledger.metadataChargedBytes) || ledger.metadataChargedBytes + bytes > METADATA_RESERVE)
    throw new Error("Approved metadata reserve would be exceeded");
  ledger.metadataChargedBytes += bytes;
  await saveLedger(ledger, { root });
}

export async function acquireFile(spec, ledger, { root = cacheRoot, footprintRoot = experimentRoot,
  fetcher = globalThis.fetch } = {}) {
  const target = await safePath(path.resolve(root, spec.target), { root });
  const reservation = spec.size ?? spec.maxBytes;
  if (!Number.isSafeInteger(reservation) || reservation <= 0 || reservation > DOWNLOAD_CAP) throw new Error("Invalid artifact size bound");
  const finish = async (verified) => {
    const pending = ledger.pending.find(file => file.target === spec.target && file.hash === spec.hash && file.kind === spec.kind && file.reservation === reservation);
    if (!pending) throw new Error("Existing artifact lacks acquisition record");
    ledger.chargedBytes -= reservation - verified.bytes;
    ledger.files.push({ target: spec.target, bytes: verified.bytes, sha256: verified.sha256,
      repo: spec.repo, revision: spec.revision, integrity: `${spec.kind}:${spec.hash}` });
    ledger.pending = ledger.pending.filter(file => file !== pending);
    await saveLedger(ledger, { root });
    return verified;
  };
  try {
    await lstat(target);
    const verified = await verifyFile(target, spec, { root });
    if (!ledger.files.some((file) => file.target === spec.target && file.sha256 === verified.sha256))
      return finish(verified);
    return verified;
  } catch (error) { if (error.code !== "ENOENT") throw error; }

  if (ledger.files.some(file => file.target === spec.target))
    throw new Error("Recorded artifact is missing; manual review required before any reacquisition");
  const partial = await safePath(`${target}.partial`, { root });
  try {
    await lstat(partial);
    if (!ledger.pending.some(file => file.target === spec.target && file.hash === spec.hash && file.kind === spec.kind && file.reservation === reservation)) throw new Error("Partial artifact lacks reservation record");
    const verified = await verifyFile(partial, spec, { root });
    await rename(partial, target);
    return finish(verified);
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  if (ledger.pending.some(file => file.target === spec.target)) throw new Error("Interrupted artifact reservation requires manual review");
  if (ledger.chargedBytes + reservation > DOWNLOAD_CAP) throw new Error("Approved download cap would be exceeded");
  if (await treeBytes(footprintRoot) + reservation > INSTALLED_CAP) throw new Error("Approved installed cap would be exceeded");
  // Charge before requesting; interrupted/failed transfers retain their reservation.
  ledger.chargedBytes += reservation;
  ledger.pending.push({ target: spec.target, reservation, kind: spec.kind, hash: spec.hash });
  await saveLedger(ledger, { root });
  await chargeMetadata(ledger, REQUEST_OVERHEAD, { root });
  await mkdir(path.dirname(target), { recursive: true });
  await safePath(partial, { root });
  const handle = await open(partial, "wx");
  let received = 0;
  try {
    const response = await boundedResponse(spec.url, fetcher);
    for await (const chunk of response.body) {
      received += chunk.length;
      if (received > reservation) throw new Error("Artifact exceeds reserved size");
      await handle.writeFile(chunk);
    }
  } finally { await handle.close(); }
  const verified = await verifyFile(partial, spec, { root });
  await rename(partial, target);
  return finish(verified);
}

export async function acquireMetadata(url, ledger, { root = cacheRoot, fetcher = globalThis.fetch } = {}) {
  await chargeMetadata(ledger, METADATA_BODY_CAP + REQUEST_OVERHEAD, { root });
  const response = await boundedResponse(url, fetcher);
  const chunks = [];
  let received = 0;
  for await (const chunk of response.body) {
    received += chunk.length;
    if (received > METADATA_BODY_CAP) throw new Error("Oversized registry metadata");
    chunks.push(Buffer.from(chunk));
  }
  const result = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
  ledger.metadataChargedBytes -= METADATA_BODY_CAP - received;
  await saveLedger(ledger, { root });
  return result;
}

export function runtimeArchiveBound(dist, pkg) {
  if (dist?.tarball !== pkg.resolved || dist?.integrity !== pkg.integrity)
    throw new Error("Registry/lock mismatch");
  // Older npm publications omit unpackedSize. Keep their locked integrity and
  // use a fixed conservative transfer bound, never an unlimited download.
  if (dist.unpackedSize === undefined) return 16 * 1024 * 1024;
  if (!Number.isSafeInteger(dist.unpackedSize) || dist.unpackedSize <= 0)
    throw new Error("Invalid registry size");
  return Math.ceil(dist.unpackedSize * 1.05) + 65_536;
}

async function acquireRuntime(ledger) {
  const lockPath = await safePath(path.join(experimentRoot, "runtime/package-lock.json"), { root: experimentRoot, allowMissing: false });
  const lockStat = await lstat(lockPath);
  if (!lockStat.isFile() || lockStat.size > LEDGER_CAP) throw new Error("Invalid runtime lock size");
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  for (const [name, pkg] of Object.entries(lock.packages)) {
    if (!name || (pkg.os && !pkg.os.includes(process.platform)) ||
        (pkg.cpu && !pkg.cpu.includes(process.arch))) continue;
    if (new URL(pkg.resolved).origin !== "https://registry.npmjs.org" ||
        !pkg.integrity?.startsWith("sha512-")) throw new Error("Unapproved runtime artifact");
    const packageName = name.slice(name.lastIndexOf("node_modules/") + 13);
    const target = `tarballs/${packageName.replaceAll("/", "-")}-${pkg.version}.tgz`;
    const cached = ledger.files.find(file => file.target === target);
    if (cached) {
      await acquireFile({ target, url: pkg.resolved, kind: "sha512", hash: pkg.integrity.slice(7), maxBytes: cached.bytes }, ledger);
      continue;
    }
    const info = await acquireMetadata(`https://registry.npmjs.org/${encodeURIComponent(packageName)}/${pkg.version}`, ledger);
    const maxBytes = runtimeArchiveBound(info.dist, pkg);
    await acquireFile({ target, url: pkg.resolved, kind: "sha512", hash: pkg.integrity.slice(7),
      maxBytes }, ledger);
    process.stdout.write(`Verified runtime archive ${packageName}@${pkg.version}\n`);
  }
}

async function main() {
  const mode = process.argv[2];
  if (!["runtime", "models", "status"].includes(mode)) throw new Error("Use runtime, models or status");
  await mkdir(cacheRoot, { recursive: true });
  await safePath(cacheRoot);
  await withAcquisitionLock(async () => {
  const ledger = await loadLedger();
  if (mode === "runtime") await acquireRuntime(ledger);
  if (mode === "models") for (const asset of modelAssets) {
    await acquireFile(asset, ledger);
    process.stdout.write(`Verified model asset ${asset.target}\n`);
  }
  const installedBytes = await treeBytes(experimentRoot);
  if (installedBytes > INSTALLED_CAP) throw new Error("Approved installed cap exceeded");
  process.stdout.write(JSON.stringify({ chargedBytes: ledger.chargedBytes, metadataReserve: METADATA_RESERVE,
    metadataChargedBytes: ledger.metadataChargedBytes, installedBytes, files: ledger.files.length }) + "\n");
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
