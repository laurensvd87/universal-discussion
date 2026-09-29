import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { acquireFile, acquireMetadata, allowedDownloadUrl, boundedResponse, chargeMetadata,
  DOWNLOAD_CAP, loadLedger, METADATA_RESERVE, modelAssets, safePath, saveLedger,
  verifyFile, withAcquisitionLock, runtimeArchiveBound } from "../src/acquire.js";

test("legacy registry sizes get a fixed bound without weakening locked integrity", () => {
  const pkg = { resolved: "https://registry.npmjs.org/a.tgz", integrity: "sha512-synthetic" };
  const dist = { tarball: pkg.resolved, integrity: pkg.integrity };
  assert.equal(runtimeArchiveBound(dist, pkg), 16 * 1024 * 1024);
  assert.equal(runtimeArchiveBound({ ...dist, unpackedSize: 100 }, pkg), 65_641);
  assert.throws(() => runtimeArchiveBound({ ...dist, integrity: "different" }, pkg), /mismatch/);
  assert.throws(() => runtimeArchiveBound({ ...dist, unpackedSize: -1 }, pkg), /size/);
});

test("artifact hosts require HTTPS and no credentials or nonstandard port", () => {
  for (const url of ["https://registry.npmjs.org/a", "https://huggingface.co/a", "https://cas-bridge.xethub.hf.co/a"])
    assert.equal(allowedDownloadUrl(url), true);
  for (const url of ["http://huggingface.co/a", "https://huggingface.co.evil.test/a", "https://evil.test/a", "https://u:p@huggingface.co/a", "https://huggingface.co:8443/a", "http://127.0.0.1/a"])
    assert.equal(allowedDownloadUrl(url), false);
});
test("redirects are checked before the redirected request", async () => {
  const requests = [];
  await assert.rejects(boundedResponse("https://huggingface.co/a", async (url) => {
    requests.push(url);
    return new Response(null, { status: 302, headers: { location: "https://evil.test/a" } });
  }), /Unapproved/);
  assert.equal(requests.length, 1);
});
test("redirect and HTTP failure bounds are explicit", async () => {
  let calls = 0;
  await assert.rejects(boundedResponse("https://huggingface.co/a", async () => {
    calls += 1;
    return new Response(null, { status: 302, headers: { location: "/a" } });
  }), /Too many/);
  assert.equal(calls, 6);
  await assert.rejects(boundedResponse("https://huggingface.co/a", async () => new Response(null, { status: 404 })), /404/);
});
test("pinned model list remains bounded and excludes mutable revisions", () => {
  assert.equal(modelAssets.length, 12);
  assert.ok(modelAssets.every((asset) => /^[a-f0-9]{40}$/.test(asset.revision) && allowedDownloadUrl(asset.url)));
  assert.ok(modelAssets.reduce((sum, asset) => sum + asset.size, 0) < 573_000_000);
  assert.equal(modelAssets.filter((asset) => asset.file.endsWith(".onnx")).length, 1);
});
test("local byte integrity verifies SHA256 and Git blob framing", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "udl-asset-integrity-"));
  try {
    const filename = path.join(root, "asset");
    const bytes = Buffer.from("synthetic");
    await writeFile(filename, bytes);
    const sha = createHash("sha256").update(bytes).digest("hex");
    assert.equal((await verifyFile(filename, { size: bytes.length, kind: "sha256", hash: sha }, { root })).sha256, sha);
    const git = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
    await verifyFile(filename, { size: bytes.length, kind: "git", hash: git }, { root });
    await assert.rejects(verifyFile(filename, { size: 1, kind: "git", hash: git }, { root }), /integrity/);
    await assert.rejects(verifyFile(filename, { size: bytes.length, kind: "sha256", hash: "0".repeat(64) }, { root }), /integrity/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

async function withRoot(action) {
  const root = await mkdtemp(path.join(os.tmpdir(), "udl-acquire-"));
  try { return await action(root); }
  finally { await rm(root, { recursive: true, force: true }); }
}
const syntheticBytes = Buffer.from("synthetic fixture artifact");
function syntheticSpec(extra = {}) {
  return { target: "assets/synthetic.bin", size: syntheticBytes.length,
    kind: "sha256", hash: createHash("sha256").update(syntheticBytes).digest("hex"),
    url: "https://huggingface.co/pinned/artifact", ...extra };
}
const localOptions = (root, fetcher) => ({ root, footprintRoot: root, fetcher });

test("exclusive acquisition lock rejects concurrency and releases on success or failure", async () => withRoot(async root => {
  await withAcquisitionLock(async () => {
    await assert.rejects(withAcquisitionLock(async () => {}, { root }), /lock exists/);
    assert.equal(JSON.parse(await readFile(path.join(root, "acquisition.lock"), "utf8")).pid, process.pid);
  }, { root });
  await assert.rejects(lstat(path.join(root, "acquisition.lock")), { code: "ENOENT" });
  await assert.rejects(withAcquisitionLock(async () => { throw new Error("synthetic failure"); }, { root }), /synthetic failure/);
  await withAcquisitionLock(async () => {}, { root });
  await writeFile(path.join(root, "acquisition.lock"), "stale");
  await assert.rejects(withAcquisitionLock(async () => {}, { root }), /stale lock manually/);
}));

test("safe paths reject traversal, linked cache roots and linked parents before existing-file reads", async () => withRoot(async root => {
  const outside = await mkdtemp(path.join(os.tmpdir(), "udl-acquire-outside-"));
  try {
    await writeFile(path.join(outside, "asset"), syntheticBytes);
    await symlink(outside, path.join(root, "linked"), process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(safePath(path.join(root, "..", "outside"), { root }), /path/);
    await assert.rejects(safePath(path.join(root, "linked", "asset"), { root }), /symlink/);
    await assert.rejects(verifyFile(path.join(root, "linked", "asset"), syntheticSpec(), { root }), /symlink/);
    await assert.rejects(safePath(path.join(root, "linked", "asset"), { root: path.join(root, "linked") }), /symlink/);
    const ledger = await loadLedger({ root });
    await assert.rejects(acquireFile(syntheticSpec({ target: "linked/asset" }), ledger, localOptions(root, () => assert.fail("no request"))), /symlink/);
  } finally { await rm(outside, { recursive: true, force: true }); }
}));

test("existing-file reads require a finite bound and reject oversized files or non-file types", async () => withRoot(async root => {
  const filename = path.join(root, "large");
  await writeFile(filename, Buffer.alloc(8192));
  await assert.rejects(verifyFile(filename, { maxBytes: 8, kind: "sha256", hash: "x" }, { root }), /size mismatch/);
  await assert.rejects(verifyFile(filename, { kind: "sha256", hash: "x" }, { root }), /size mismatch/);
  await assert.rejects(verifyFile(root, { maxBytes: 8192, kind: "sha256", hash: "x" }, { root }), /size mismatch/);
  await writeFile(path.join(root, "acquisition.json"), Buffer.alloc(1024 * 1024 + 1));
  await assert.rejects(loadLedger({ root }), /ledger size/);
}));

test("metadata precharge persists across failure/reload and rejects excess before any request", async () => withRoot(async root => {
  let calls = 0;
  const ledger = await loadLedger({ root });
  await assert.rejects(acquireMetadata("https://registry.npmjs.org/test", ledger, { root, fetcher: async () => {
    calls++; throw new Error("synthetic interruption");
  } }), /interruption/);
  const reloaded = await loadLedger({ root });
  assert.equal(reloaded.metadataChargedBytes, 4 * 1024 * 1024 + 6 * 64 * 1024);
  assert.equal(reloaded.chargedBytes, METADATA_RESERVE);
  reloaded.metadataChargedBytes = METADATA_RESERVE - 1;
  await saveLedger(reloaded, { root });
  await assert.rejects(acquireMetadata("https://registry.npmjs.org/test", reloaded, { root, fetcher: async () => {
    calls++; assert.fail("no request");
  } }), /metadata reserve/);
  assert.equal(calls, 1);
  await assert.rejects(chargeMetadata(reloaded, 2, { root }), /metadata reserve/);
}));

test("metadata byte bounds, successful accounting and split UTF8 decoding are deterministic", async () => withRoot(async root => {
  const ledger = await loadLedger({ root });
  const body = Buffer.from('{"label":"日本語"}');
  const stream = new ReadableStream({ start(controller) {
    controller.enqueue(body.subarray(0, 12)); controller.enqueue(body.subarray(12)); controller.close();
  } });
  const result = await acquireMetadata("https://registry.npmjs.org/test", ledger,
    { root, fetcher: async () => new Response(stream) });
  assert.equal(result.label, "日本語");
  assert.equal(ledger.metadataChargedBytes, body.length + 6 * 64 * 1024);
  const before = ledger.metadataChargedBytes;
  await assert.rejects(acquireMetadata("https://registry.npmjs.org/test", ledger,
    { root, fetcher: async () => new Response(Buffer.alloc(4 * 1024 * 1024 + 1)) }), /Oversized/);
  assert.equal((await loadLedger({ root })).metadataChargedBytes, before + 4 * 1024 * 1024 + 6 * 64 * 1024);
}));

test("artifact acquisition reserves before injected request and verified cache hits do not request", async () => withRoot(async root => {
  const ledger = await loadLedger({ root });
  let calls = 0;
  const options = localOptions(root, async () => {
    calls++;
    const persisted = await loadLedger({ root });
    assert.equal(persisted.chargedBytes, METADATA_RESERVE + syntheticBytes.length);
    assert.equal(persisted.pending.length, 1);
    assert.equal(persisted.metadataChargedBytes, 6 * 64 * 1024);
    return new Response(syntheticBytes);
  });
  const verified = await acquireFile(syntheticSpec(), ledger, options);
  assert.equal(verified.bytes, syntheticBytes.length);
  assert.equal(ledger.pending.length, 0);
  assert.equal(ledger.files.length, 1);
  await acquireFile(syntheticSpec(), await loadLedger({ root }), options);
  assert.equal(calls, 1);
}));

test("failed/incomplete artifacts retain files and charges and require manual review without retry", async () => withRoot(async root => {
  const ledger = await loadLedger({ root });
  let calls = 0;
  const options = localOptions(root, async () => { calls++; return new Response("partial"); });
  await assert.rejects(acquireFile(syntheticSpec(), ledger, options), /size mismatch/);
  const partial = path.join(root, "assets/synthetic.bin.partial");
  assert.equal(await readFile(partial, "utf8"), "partial");
  const reloaded = await loadLedger({ root });
  assert.equal(reloaded.chargedBytes, METADATA_RESERVE + syntheticBytes.length);
  await assert.rejects(acquireFile(syntheticSpec(), reloaded, options), /size mismatch/);
  assert.equal(calls, 1);
  await rm(partial);
  await assert.rejects(acquireFile(syntheticSpec(), reloaded, options), /manual review/);
  assert.equal(calls, 1);
}));

test("missing recorded artifacts never silently download again", async () => withRoot(async root => {
  const spec = syntheticSpec();
  const ledger = await loadLedger({ root });
  let calls = 0;
  const options = localOptions(root, async () => { calls++; return new Response(syntheticBytes); });
  await acquireFile(spec, ledger, options);
  await rm(path.join(root, spec.target));
  await assert.rejects(acquireFile(spec, await loadLedger({ root }), options), /Recorded artifact is missing/);
  assert.equal(calls, 1);
}));

test("complete verified partials resume only against matching persisted reservations", async () => withRoot(async root => {
  const ledger = await loadLedger({ root });
  const spec = syntheticSpec();
  ledger.chargedBytes += spec.size;
  ledger.pending.push({ target: spec.target, reservation: spec.size, kind: spec.kind, hash: spec.hash });
  await saveLedger(ledger, { root });
  await mkdir(path.join(root, "assets"));
  await writeFile(path.join(root, `${spec.target}.partial`), syntheticBytes);
  const verified = await acquireFile(spec, await loadLedger({ root }), localOptions(root, () => assert.fail("no request")));
  assert.equal(verified.bytes, spec.size);
  assert.equal((await loadLedger({ root })).pending.length, 0);
  assert.deepEqual(await readFile(path.join(root, spec.target)), syntheticBytes);
}));

test("orphan artifacts, unrecorded partials and total-download overage fail before requests", async () => withRoot(async root => {
  const ledger = await loadLedger({ root });
  const spec = syntheticSpec();
  await mkdir(path.join(root, "assets"));
  const options = localOptions(root, () => assert.fail("no request"));
  await writeFile(path.join(root, spec.target), syntheticBytes);
  await assert.rejects(acquireFile(spec, ledger, options), /lacks acquisition record/);
  await rm(path.join(root, spec.target));
  await writeFile(path.join(root, `${spec.target}.partial`), syntheticBytes);
  await assert.rejects(acquireFile(spec, ledger, options), /lacks reservation record/);
  await rm(path.join(root, `${spec.target}.partial`));
  ledger.chargedBytes = DOWNLOAD_CAP;
  await assert.rejects(acquireFile(spec, ledger, options), /download cap/);
}));
