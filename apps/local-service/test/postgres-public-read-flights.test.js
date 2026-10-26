import test from "node:test";
import assert from "node:assert/strict";
import { createPostgresPublicReadFlights } from "../src/application/postgres-public-read-flights.js";

test("a hundred overlapping public reads share work, but a later read obtains fresh state", async () => {
  const read = createPostgresPublicReadFlights();
  let release, calls = 0;
  const work = () => { calls++; return new Promise(resolve => { release = resolve; }); };
  const requests = Array.from({ length: 100 }, () => read("catalogPage", { limit: 20, cursor: null }, work));
  await Promise.resolve(); assert.equal(calls, 1);
  const value = Object.freeze({ revision: 12 }); release(value);
  assert.ok((await Promise.all(requests)).every(result => result === value));
  assert.equal(await read("catalogPage", { cursor: null, limit: 20 }, () => 13), 13);
});

test("cancellation and revoked authority are independent for shared readers", async () => {
  const read = createPostgresPublicReadFlights();
  let release, current = true;
  const controller = new AbortController();
  const pending = read("selection", null, () => new Promise(resolve => { release = resolve; }), { signal: controller.signal });
  const rejected = assert.rejects(pending, { code: "unavailable" });
  const revoked = read("selection", null, () => assert.fail(), { isCurrent: () => current });
  const revokedResult = assert.rejects(revoked, { code: "unavailable" });
  const surviving = read("selection", null, () => assert.fail());
  await Promise.resolve(); controller.abort(); current = false; release(14);
  await rejected; await revokedResult; assert.equal(await surviving, 14);
});

test("public task admission is bounded and getters cannot run during key creation", async () => {
  const read = createPostgresPublicReadFlights({ maxTasks: 1, maxWaiters: 2 });
  let release;
  const a = read("catalog", null, () => new Promise(resolve => { release = resolve; }));
  const b = read("catalog", null, () => assert.fail());
  assert.throws(() => read("catalog", null, () => assert.fail()), { code: "capacity" });
  assert.throws(() => read("catalog", { get cursor() { assert.fail(); } }, () => assert.fail()), { code: "invalid" });
  await Promise.resolve(); release(1); await Promise.all([a, b]);
  assert.equal(await read("catalog", null, () => 2), 2);
});

test("admission snapshots input values and separates canonical revision keys", async () => {
  const read = createPostgresPublicReadFlights();
  const input = { input: { sourceId: "original" }, expected: { revision: 1 } };
  const a = read("context", input, admitted => admitted.input.sourceId);
  input.input.sourceId = "replacement";
  const b = read("context", { input: { sourceId: "original" }, expected: { revision: 2 } }, () => "new-version");
  assert.deepEqual(await Promise.all([a, b]), ["original", "new-version"]);
});

test("shared work preserves every rejection value instead of turning falsy errors into successful reads", async () => {
  const read = createPostgresPublicReadFlights({ maxTasks: 1, maxWaiters: 2 });
  for (const reason of [false, 0, "", null, undefined]) {
    const first = read("falsy", null, () => Promise.reject(reason));
    const second = read("falsy", null, () => assert.fail("must share the original work"));
    await Promise.all([first, second].map(pending => assert.rejects(pending, error => Object.is(error, reason))));
    assert.equal(await read("fresh", null, () => "fresh"), "fresh");
  }
});

test("a falsy delivery-fence failure rejects only that waiter and releases its admission", async () => {
  const read = createPostgresPublicReadFlights({ maxTasks: 1, maxWaiters: 2 });
  for (const reason of [false, 0, "", null, undefined]) {
    let checks = 0;
    const guarded = read("fence", null, () => "public", { isCurrent() {
      if (++checks === 1) return true;
      throw reason;
    } });
    const surviving = read("fence", null, () => assert.fail("must share the original work"));
    await assert.rejects(guarded, error => Object.is(error, reason));
    assert.equal(await surviving, "public");
    assert.equal(await read("fresh", null, () => "fresh"), "fresh");
  }
});
