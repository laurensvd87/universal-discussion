import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { changePairing, loadPairingVerifier } from "../src/http/pairing-store.js";
import { createRequestHandler } from "../src/http/request-handler.js";
import { validateStartupConfig } from "../src/http/startup-config.js";
import { parsePairingCliArguments } from "../src/cli.js";
import { demoService } from "./helpers.js";

const ORIGIN = `chrome-extension://${"a".repeat(32)}`;
const OTHER_ORIGIN = `chrome-extension://${"b".repeat(32)}`;

async function withFile(callback) {
  const directory = mkdtempSync(path.join(tmpdir(), "discussion-pairing-"));
  try { return await callback(path.join(directory, "pairing.json")); }
  finally { rmSync(directory, { recursive: true, force: true }); }
}

test("pairing persists a bounded verifier, not bearer, and survives reload", () => withFile((filePath) => {
  assert.throws(() => loadPairingVerifier({ filePath, origin: ORIGIN }), /Pairing unavailable/u);
  const token = changePairing({ filePath, origin: ORIGIN, action: "init" });
  assert.match(token, /^[A-Za-z0-9_-]{43}$/u);
  const raw = readFileSync(filePath, "utf8");
  assert.ok(Buffer.byteLength(raw) < 1_024);
  assert.ok(!raw.includes(token));
  assert.equal(JSON.parse(raw).version, 1);
  assert.equal(loadPairingVerifier({ filePath, origin: ORIGIN }).verify(token), true);
  assert.equal(loadPairingVerifier({ filePath, origin: ORIGIN }).verify(`${token.slice(0, -1)}x`), false);
  assert.equal(loadPairingVerifier({ filePath, origin: ORIGIN }).verify("legacy-process-token"), false);
  assert.throws(() => loadPairingVerifier({ filePath, origin: OTHER_ORIGIN }), /Pairing unavailable/u);
  assert.throws(() => changePairing({ filePath, origin: ORIGIN, action: "init" }), /Pairing unavailable/u);
}));

test("explicit rotation invalidates copies; revocation persists; corruption fails closed", () => withFile((filePath) => {
  const first = changePairing({ filePath, origin: ORIGIN, action: "init" });
  const second = changePairing({ filePath, origin: ORIGIN, action: "rotate" });
  assert.notEqual(first, second);
  let verifier = loadPairingVerifier({ filePath, origin: ORIGIN });
  assert.equal(verifier.verify(first), false);
  assert.equal(verifier.verify(second), true);
  assert.equal(changePairing({ filePath, origin: ORIGIN, action: "revoke" }), null);
  assert.throws(() => loadPairingVerifier({ filePath, origin: ORIGIN }), /Pairing unavailable/u);
  assert.match(readFileSync(filePath, "utf8"), /"state":"revoked"/u);
  assert.ok(!readFileSync(filePath, "utf8").includes(second));
  const third = changePairing({ filePath, origin: ORIGIN, action: "rotate" });
  verifier = loadPairingVerifier({ filePath, origin: ORIGIN });
  assert.equal(verifier.verify(second), false);
  assert.equal(verifier.verify(third), true);
  writeFileSync(filePath, '{"version":2,"state":"active"}');
  assert.throws(() => loadPairingVerifier({ filePath, origin: ORIGIN }), /Pairing unavailable/u);
  assert.throws(() => changePairing({ filePath, origin: ORIGIN, action: "init" }), /Pairing unavailable/u);
  assert.throws(() => changePairing({ filePath, origin: ORIGIN, action: "revoke" }), /Pairing unavailable/u);
  const recovered = changePairing({ filePath, origin: OTHER_ORIGIN, action: "rotate" });
  assert.equal(loadPairingVerifier({ filePath, origin: OTHER_ORIGIN }).verify(recovered), true);
  assert.throws(() => loadPairingVerifier({ filePath, origin: ORIGIN }), /Pairing unavailable/u);
}));

test("oversized and unknown verifier records fail closed", () => withFile((filePath) => {
  writeFileSync(filePath, "x".repeat(1_025));
  assert.throws(() => loadPairingVerifier({ filePath, origin: ORIGIN }), /Pairing unavailable/u);
  writeFileSync(filePath, JSON.stringify({ version: 1, origin: ORIGIN, state: "active", verifier: "0".repeat(64), extra: true }));
  assert.throws(() => loadPairingVerifier({ filePath, origin: ORIGIN }), /Pairing unavailable/u);
}));

test("durable handler authenticates all routes and marks its protocol", async () => {
  await withFile(async (filePath) => {
    const token = changePairing({ filePath, origin: ORIGIN, action: "init" });
    const config = validateStartupConfig({ host: "127.0.0.1", port: 4174, origin: ORIGIN, capability: "durable-pairing-verifier-only-placeholder" });
    const handler = createRequestHandler({ service: demoService(), config,
      pairingVerifier: loadPairingVerifier({ filePath, origin: ORIGIN }) });
    const request = (authorization, origin = ORIGIN) => ({ method: "GET", url: "/v1/health", body: null,
      headers: { host: "127.0.0.1:4174", origin, authorization } });
    const allowed = await handler(request(`Bearer ${token}`));
    assert.equal(allowed.status, 200);
    assert.equal(JSON.parse(allowed.body).capability, "paired-durable-v1");
    assert.equal((await handler(request("Bearer bad"))).status, 401);
    assert.equal((await handler(request(`Bearer ${token}`, OTHER_ORIGIN))).status, 403);
    const before = readFileSync(filePath, "utf8");
    const catalog = JSON.parse((await handler({ ...request(`Bearer ${token}`), url: "/v1/catalog" })).body);
    const reset = await handler({ ...request(`Bearer ${token}`), method: "POST", url: "/v1/demo/reset",
      headers: { ...request(`Bearer ${token}`).headers, "content-type": "application/json" },
      body: JSON.stringify({ expected: catalog.version, confirmation: "RESET DEMO STATE" }) });
    assert.equal(reset.status, 200);
    assert.equal(readFileSync(filePath, "utf8"), before);
  });
});

test("CLI accepts only fixed origin and explicit administrative actions", () => {
  assert.deepEqual(parsePairingCliArguments(["--origin", ORIGIN]), { origin: ORIGIN, action: "start" });
  assert.deepEqual(parsePairingCliArguments(["--origin", ORIGIN, "--debug-insight-raw"]),
    { origin: ORIGIN, action: "start", rawDebug: true });
  for (const action of ["init", "rotate", "revoke"]) {
    assert.deepEqual(parsePairingCliArguments(["--origin", ORIGIN, `--pairing-${action}`]), { origin: ORIGIN, action });
  }
  assert.throws(() => parsePairingCliArguments(["--origin", ORIGIN, "--pairing-reset"]));
});
