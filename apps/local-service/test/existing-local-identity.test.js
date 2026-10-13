import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { loadReadOnlyCompatiblePairingVerifier } from "../src/http/pairing-store.js";
import { createExistingProtectedRefreshStore } from "../src/ai/existing-protected-refresh-store.js";

const origin = `chrome-extension://${"a".repeat(32)}`;
const token = "A".repeat(43);
function directory(t) {
  const root = mkdtempSync(path.join(tmpdir(), "reference-identity-check-"));
  t.after(() => rmSync(root, { recursive: true, force: true })); return root;
}
for (const domain of ["universal-discussion-layer/pairing/v1\0", "murmingle/pairing/v1\0"]) {
  test(`existing ${domain.startsWith("murmingle") ? "current" : "legacy"} pairing verifies read-only with exact Origin and token`, t => {
    const filePath = path.join(directory(t), "pairing.json");
    const verifier = createHash("sha256").update(domain).update(origin).update("\0").update(token).digest("hex");
    writeFileSync(filePath, JSON.stringify({ version: 1, origin, state: "active", verifier }));
    const before = readFileSync(filePath), reader = loadReadOnlyCompatiblePairingVerifier({ filePath, origin });
    assert.equal(reader.verify(token), true); assert.equal(reader.verify("B".repeat(43)), false);
    for (const invalid of [null, {}, "", token + "x"]) assert.equal(reader.verify(invalid), false);
    assert.throws(() => loadReadOnlyCompatiblePairingVerifier({ filePath, origin: `chrome-extension://${"b".repeat(32)}` }));
    assert.deepEqual(readFileSync(filePath), before, "no rotation, migration or verifier rewrite");
  });
}
test("read-only pairing never accepts revoked, decorated or another-domain records", t => {
  const filePath = path.join(directory(t), "pairing.json");
  for (const record of [{ version: 1, origin, state: "revoked" }, { version: 1, origin, state: "active", verifier: "0".repeat(64), extra: true }]) {
    writeFileSync(filePath, JSON.stringify(record)); assert.throws(() => loadReadOnlyCompatiblePairingVerifier({ filePath, origin }));
  }
  writeFileSync(filePath, JSON.stringify({ version: 1, origin, state: "active", verifier: createHash("sha256").update("foreign").update(token).digest("hex") }));
  assert.equal(loadReadOnlyCompatiblePairingVerifier({ filePath, origin }).verify(token), false);
});

const hostId = "urn:uuid:11111111-1111-4111-8111-111111111111";
const record = { clientId: "synthetic-client", subject: "synthetic-subject", refreshToken: "synthetic-only-token" };
for (const currentPresent of [false, true]) test(`existing protected ${currentPresent ? "current" : "legacy"} record selection performs no path migration or other-record deletion`, async t => {
  const root = directory(t), name = `chatgpt-refresh-${createHash("sha256").update(hostId).digest("hex").slice(0,32)}.dpapi`;
  const legacyPath = path.join(root,"UniversalDiscussionLayer",name), currentPath = path.join(root,"Murmingle",name);
  mkdirSync(path.dirname(legacyPath)); writeFileSync(legacyPath,"synthetic cipher placeholder");
  if (currentPresent) { mkdirSync(path.dirname(currentPath)); writeFileSync(currentPath,"synthetic current cipher placeholder"); }
  const calls = [], expectedPath = currentPresent ? currentPath : legacyPath;
  const scripts = [];
  const spawnImpl = (executable, args) => {
    scripts.push(args[3]);
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => {};
    let input = "";
    child.stdin = new Writable({ write(chunk,encoding,done) { input += chunk.toString(); done(); }, final(done) {
      queueMicrotask(() => { const request = JSON.parse(input); calls.push(request);
        child.stdout.end(request.operation === "read" ? JSON.stringify(record) : "null"); child.stderr.end(); child.emit("close",0); }); done(); } });
    return child;
  };
  const store = createExistingProtectedRefreshStore({ hostId, platform: "win32", localAppData: root, systemRoot: process.env.SystemRoot ?? "C:/Windows", spawnImpl });
  assert.ok(store); assert.deepEqual(await store.read(), record);
  assert.deepEqual(calls.map(call => [call.operation,call.path]), [["read",expectedPath]]);
  await store.write(record); await store.clear();
  assert.deepEqual(calls.map(call => call.operation), ["read","write","clear"]);
  assert.ok(calls.every(call => call.path === expectedPath));
  assert.ok(scripts.every(script => !script.slice(script.indexOf("if ($request.operation -eq 'read')"),
    script.indexOf("if ($request.operation -eq 'write')")).includes("::Delete")));
  assert.equal(readFileSync(legacyPath,"utf8"),"synthetic cipher placeholder");
});
test("existing protected adapter preserves unsupported-platform and invalid-host denial", () => {
  assert.equal(createExistingProtectedRefreshStore({ hostId, platform: "linux" }), null);
  assert.equal(createExistingProtectedRefreshStore({ hostId: "untrusted", platform: "win32" }), null);
});
