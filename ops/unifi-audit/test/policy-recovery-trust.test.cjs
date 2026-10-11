'use strict';
// Independent Trust fixtures; every response and credential is synthetic.
const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../export-browser.js');
const SECRET = 'SYNTHETIC_POLICY_TRUST_PRIVATE_SENTINEL';
const uuid = n => `a1000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const page = (data, offset = 0, totalCount = data.length) => ({ data, count: data.length, offset, limit: 200, totalCount });
const policy = n => ({ id: uuid(n), index: 0, enabled: true, metadata: { origin: 'USER_DEFINED' },
  action: { type: 'BLOCK' }, source: { zoneId: uuid(2) }, destination: { zoneId: uuid(3) },
  ipProtocolScope: { ipVersion: 'IPV4_AND_IPV6' }, loggingEnabled: false });
const response = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
function fixture(policyPage, overrides = {}) {
  const calls = [];
  const env = { location: { origin: 'https://10.31.0.1' }, AbortController,
    fetch: async (url, options) => {
      calls.push({ url, options });
      const u = new URL(url), path = u.pathname;
      if (path.endsWith('/info')) return response({ applicationVersion: api.VERSION });
      if (path.endsWith('/sites')) return response(page([{ id: uuid(1) }]));
      const suffix = path.replace(/^.*\/sites\/[a-f\d-]+/, '');
      if (overrides[suffix]) return response(await overrides[suffix](u));
      if (suffix === '/firewall/policies') return response(await policyPage(u));
      if (suffix === '/firewall/zones') return response(page([2, 3].map(n => ({ id: uuid(n), name: 'Internal', metadata: { origin: 'SYSTEM_DEFINED' }, networkIds: [] }))));
      if (suffix === '/firewall/policies/ordering') return response({ orderedFirewallPolicyIds: { beforeSystemDefined: [uuid(4)], afterSystemDefined: [] } });
      return response(page([]));
    } };
  return { calls, run: () => api.collect(env, SECRET, 0) };
}
function privateClean(output, rawIds = []) {
  const serialized = JSON.stringify(output);
  assert.ok(!serialized.includes(SECRET));
  for (const id of [uuid(1), uuid(2), uuid(3), ...rawIds]) assert.ok(!serialized.includes(id));
}
function identityIncomplete(output, calls, count) {
  assert.equal(output.collectionStatus, 'PARTIAL');
  assert.equal(output.auditStatus, 'INCOMPLETE');
  assert.equal(output.coverage.policies.status, count ? 'PARTIAL' : 'ERROR');
  assert.equal(output.coverage.policies.code, 'policy-identity-invalid');
  assert.equal(output.coverage.policies.recordCount, count);
  assert.deepEqual(output.ordering, []);
  assert.equal(output.coverage.ordering.code, 'policy-inventory-unavailable');
  assert.ok(!calls.some(c => new URL(c.url).pathname.endsWith('/ordering')));
  privateClean(output);
}

test('missing, malformed and non-string policy IDs retain only incomplete typed audit rows', async () => {
  for (const badId of [undefined, null, false, 7, {}, [], '', SECRET, uuid(4) + SECRET]) {
    const row = policy(4); row.id = badId; row.name = row.description = SECRET;
    row[SECRET] = { password: SECRET };
    const { run, calls } = fixture(() => page([row]));
    const output = await run();
    identityIncomplete(output, calls, 1);
    assert.equal(output.policies[0].auditRow, 1);
    assert.equal(output.policies[0].id, 'UNKNOWN');
    assert.equal(output.policies[0].semanticStatus, 'INCOMPLETE');
    assert.equal(output.policies[0].action.type, 'BLOCK');
    assert.equal(output.policies[0].enabled, true);
    assert.notEqual(output.policies[0].identityStatus, 'VALID_UUID');
  }
});

test('case-insensitive duplicate identities taint every occurrence across accepted pages', async () => {
  const first = policy(4), duplicate = policy(4); duplicate.id = duplicate.id.toUpperCase();
  const { run, calls } = fixture(u => Number(u.searchParams.get('offset')) === 0
    ? page([first, policy(5)], 0, 3) : page([duplicate], 2, 3));
  const output = await run();
  identityIncomplete(output, calls, 3);
  for (const i of [0, 2]) {
    assert.equal(output.policies[i].id, 'UNKNOWN');
    assert.equal(output.policies[i].identityStatus, 'DUPLICATE_ID');
    assert.equal(output.policies[i].semanticStatus, 'INCOMPLETE');
  }
  assert.equal(output.policies[1].identityStatus, 'VALID_UUID');
  assert.equal(output.policies[1].semanticStatus, 'COMPLETE');
  assert.deepEqual(output.policies.map(p => p.auditRow), [1, 2, 3]);
  privateClean(output, [uuid(4), uuid(5)]);
});

test('nonobject policy rows are omitted without losing ordinal, counters or incomplete coverage', async () => {
  const { run, calls } = fixture(() => page([null, SECRET, false, [], policy(4), 42]));
  const output = await run();
  identityIncomplete(output, calls, 1);
  assert.equal(output.policies[0].auditRow, 5);
  assert.equal(output.recordsRead, 9); // site + two zones + all six policy rows
  privateClean(output, [uuid(4)]);
});

test('an entirely unusable policy page is ERROR rather than an empty complete inventory', async () => {
  const { run, calls } = fixture(() => page([null, SECRET, []]));
  const output = await run();
  identityIncomplete(output, calls, 0);
  assert.deepEqual(output.policies, []);
});

test('policy diagnostics are fixed numeric counts, including every duplicate occurrence', async () => {
  const missing = policy(5); delete missing.id;
  const type = policy(6); type.id = { [SECRET]: SECRET };
  const format = policy(7); format.id = SECRET;
  const duplicate = policy(4); duplicate.id = duplicate.id.toUpperCase();
  const { run, calls } = fixture(() => page([null, missing, type, format, policy(4), duplicate, policy(4)]));
  const output = await run();
  identityIncomplete(output, calls, 6);
  assert.deepEqual(output.coverage.policies.diagnostics, { pagesAccepted: 1, rowsRead: 7,
    omittedNonObjectRows: 1, missingIdRows: 1, invalidIdTypeRows: 1, invalidIdFormatRows: 1, duplicateIdRows: 3 });
  for (const row of output.policies) {
    assert.equal(row.semanticStatus, 'INCOMPLETE');
    assert.equal(row.id, 'UNKNOWN');
  }
  for (const count of Object.values(output.coverage.policies.diagnostics)) assert.ok(Number.isSafeInteger(count) && count >= 0);
  privateClean(output, [uuid(4), uuid(5), uuid(6), uuid(7)]);
});

test('later changing totals discard all accepted policy rows even when identity recovery was needed', async () => {
  const row = policy(4); delete row.id;
  const { run, calls } = fixture(u => Number(u.searchParams.get('offset')) === 0
    ? page([row], 0, 2) : page([policy(5)], 1, 3));
  const output = await run();
  assert.equal(output.collectionStatus, 'PARTIAL');
  assert.equal(output.coverage.policies.status, 'ERROR');
  assert.equal(output.coverage.policies.code, 'pagination-invalid');
  assert.deepEqual(output.policies, []);
  assert.deepEqual(output.ordering, []);
  assert.ok(!calls.some(c => new URL(c.url).pathname.endsWith('/ordering')));
  privateClean(output, [uuid(4), uuid(5)]);
});

test('policy projection never excuses count, limit, offset or stalled-page envelope violations', async () => {
  const bad = policy(4); bad.id = SECRET;
  for (const change of [{ count: 0 }, { count: 201 }, { limit: 0 }, { offset: 1 }, { totalCount: 0 }, { data: [], count: 0, totalCount: 1 }]) {
    const { run } = fixture(() => ({ ...page([bad]), ...change }));
    const output = await run();
    assert.equal(output.coverage.policies.status, 'ERROR');
    assert.equal(output.coverage.policies.code, 'pagination-invalid');
    assert.deepEqual(output.policies, []);
    assert.equal(output.collectionStatus, 'PARTIAL');
    privateClean(output);
  }
});

test('identity recovery remains policy-only: malformed and duplicate zone IDs still discard inventory', async () => {
  for (const rows of [[{ id: SECRET }], [{ id: uuid(2) }, { id: uuid(2).toUpperCase() }], [null]]) {
    const { run } = fixture(() => page([]), { '/firewall/zones': () => page(rows) });
    const output = await run();
    assert.equal(output.coverage.zones.status, 'ERROR');
    assert.equal(output.coverage.zones.code, 'pagination-invalid');
    assert.deepEqual(output.zones, []);
    privateClean(output);
  }
});

test('malformed policy rows remain charged to the shared global budget', async () => {
  const { run, calls } = fixture(u => {
    const offset = Number(u.searchParams.get('offset'));
    return page(Array(Math.min(200, 5000 - offset)).fill(null), offset, 5000);
  });
  const output = await run();
  assert.equal(output.coverage.policies.status, 'ERROR');
  assert.equal(output.coverage.policies.code, 'record-limit');
  assert.deepEqual(output.policies, []);
  assert.equal(output.collectionStatus, 'PARTIAL');
  assert.ok(output.recordsRead <= api.LIMITS.records);
  assert.ok(calls.length <= api.LIMITS.requests);
  assert.ok(!calls.some(c => new URL(c.url).pathname.endsWith('/ordering')));
});

test('valid identity and order flows remain complete without certifying the security audit', async () => {
  const { run, calls } = fixture(() => page([policy(4)]));
  const output = await run();
  assert.equal(output.collectionStatus, 'COMPLETE');
  assert.equal(output.auditStatus, 'INCOMPLETE');
  assert.equal(output.coverage.policies.status, 'COLLECTED');
  assert.equal(output.policies[0].identityStatus, 'VALID_UUID');
  assert.equal(output.policies[0].semanticStatus, 'COMPLETE');
  assert.equal(output.policies[0].auditRow, 1);
  assert.deepEqual(output.ordering[0].beforeSystemDefined, [output.policies[0].id]);
  assert.equal(output.ordering[0].semanticStatus, 'COMPLETE');
  assert.equal(calls.filter(c => new URL(c.url).pathname.endsWith('/ordering')).length, 1);
  for (const call of calls) {
    assert.equal(call.options.method, 'GET');
    assert.equal(call.options.credentials, 'omit');
    assert.equal(new URL(call.url).origin, 'https://10.31.0.1');
  }
  privateClean(output, [uuid(4)]);
});

test('valid-ID semantic incompleteness preserves prior collection and ordering behavior', async () => {
  const row = policy(4); row.action.type = SECRET;
  const { run, calls } = fixture(() => page([row]));
  const output = await run();
  assert.equal(output.collectionStatus, 'COMPLETE');
  assert.equal(output.policies[0].semanticStatus, 'INCOMPLETE');
  assert.equal(output.policies[0].identityStatus, 'VALID_UUID');
  assert.equal(output.coverage.policies.status, 'COLLECTED');
  assert.equal(calls.filter(c => new URL(c.url).pathname.endsWith('/ordering')).length, 1);
  privateClean(output, [uuid(4)]);
});
