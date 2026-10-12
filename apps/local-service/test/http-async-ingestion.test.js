import assert from "node:assert/strict";
import test from "node:test";
import { createRequestHandler } from "../src/http/request-handler.js";
import { ServiceError } from "../src/domain/errors.js";

const config = { hostHeader: "127.0.0.1:4174", origin: `chrome-extension://${"a".repeat(32)}`, capability: "synthetic-pairing" };
const request = session => ({ method: "POST", url: "/v1/sources/ingest", body: JSON.stringify({
  expected: { generation: "synthetic-generation", revision: 0 }, operationId: "operation-async",
  url: "https://example.org/async", title: "Synthetic async page", extractorVersion: "crawler-static-html-prefix/v1",
  embedding: { modelId: "e5-small-q8-browser-main-prefix-v1", values: [1, ...Array(383).fill(0)] },
}), headers: { host: config.hostHeader, origin: config.origin, authorization: `Bearer ${config.capability}`,
  "content-type": "application/json", ...(session ? { "x-account-session": "synthetic-session" } : {}) } });

for (const invalidation of ["none", "pairing", "account", "transport", "abort"]) {
  test(`queued ingestion renews authority immediately before commit: ${invalidation}`, async () => {
    let release, paired = true, account = true, transport = true, committed = false;
    const controller = new AbortController();
    const accounts = invalidation === "account" ? { me() { if (!account) throw new ServiceError("unauthorized", "Synthetic session expired"); } } : null;
    const handle = createRequestHandler({ config, accounts, accountWrites: accounts !== null,
      pairingVerifier: { verify: () => paired }, service: { ingest(_input, guards) {
        return new Promise(resolve => { release = resolve; }).then(() => {
          if (guards.signal.aborted || !guards.isCurrent()) throw new ServiceError("unavailable", "Synthetic invalidation");
          committed = true; return { accepted: true };
        });
      } } });
    const result = handle(request(accounts !== null), { leaseAuthenticatedIngestion: () => true,
      signal: controller.signal, isCurrent: () => transport });
    if (invalidation === "pairing") paired = false;
    if (invalidation === "account") account = false;
    if (invalidation === "transport") transport = false;
    if (invalidation === "abort") controller.abort();
    release();
    assert.equal((await result).status, invalidation === "none" ? 200 : 503);
    assert.equal(committed, invalidation === "none");
  });
}
