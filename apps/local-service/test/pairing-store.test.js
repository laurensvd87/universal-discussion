import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
const CURRENT_PAIRING_DOMAIN = "murmingle/pairing/v1\0";
const PRE_NAME_TOKEN = "A".repeat(43);
const PRE_NAME_VERIFIER = "c05f29a92e3b4ddb4d715da8bd29729a34a2cea58fbac9f2327c317f77a4ff29";

function verifier(domain, origin, token) {
  return createHash("sha256").update(domain).update(origin).update("\0").update(token).digest("hex");
}

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
  const record = JSON.parse(raw);
  assert.equal(record.version, 1);
  assert.equal(record.verifier, verifier(CURRENT_PAIRING_DOMAIN, ORIGIN, token));
  assert.equal(loadPairingVerifier({ filePath, origin: ORIGIN }).verify(token), true);
  assert.equal(loadPairingVerifier({ filePath, origin: ORIGIN }).verify(`${token.slice(0, -1)}x`), false);
  assert.equal(loadPairingVerifier({ filePath, origin: ORIGIN }).verify("legacy-process-token"), false);
  assert.throws(() => loadPairingVerifier({ filePath, origin: OTHER_ORIGIN }), /Pairing unavailable/u);
  assert.throws(() => changePairing({ filePath, origin: ORIGIN, action: "init" }), /Pairing unavailable/u);
}));

test("pre-name verifier authenticates and upgrades atomically after a successful match", () => withFile((filePath) => {
  const original = `${JSON.stringify({
    version: 1,
    origin: ORIGIN,
    state: "active",
    verifier: PRE_NAME_VERIFIER,
  })}\n`;
  writeFileSync(filePath, original);
  const loaded = loadPairingVerifier({ filePath, origin: ORIGIN });

  assert.equal(loaded.verify("B".repeat(43)), false);
  assert.equal(readFileSync(filePath, "utf8"), original);
  assert.equal(loaded.verify(PRE_NAME_TOKEN), true);

  const upgraded = JSON.parse(readFileSync(filePath, "utf8"));
  assert.deepEqual(upgraded, {
    version: 1,
    origin: ORIGIN,
    state: "active",
    verifier: verifier(CURRENT_PAIRING_DOMAIN, ORIGIN, PRE_NAME_TOKEN),
  });
  assert.notEqual(upgraded.verifier, PRE_NAME_VERIFIER);
  assert.deepEqual(readdirSync(path.dirname(filePath)), ["pairing.json"]);
  assert.equal(loaded.verify(PRE_NAME_TOKEN), true);
  assert.equal(loadPairingVerifier({ filePath, origin: ORIGIN }).verify(PRE_NAME_TOKEN), true);
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
