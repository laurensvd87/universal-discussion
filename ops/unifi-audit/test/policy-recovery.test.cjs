'use strict';
// Synthetic responses only: no router, credential store or external fetch.
const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../export-browser.js');
const uuid = n => `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const privateText = 'SYNTHETIC_PRIVATE_TEXT';
const policy = (id = uuid(4)) => ({id, name: privateText, description: privateText,
  index: 0, enabled: true, metadata: {origin: 'USER_DEFINED'}, action: {type: 'BLOCK'},
  source: {zoneId: uuid(2)}, destination: {zoneId: uuid(3)},
  ipProtocolScope: {ipVersion: 'IPV4_AND_IPV6'}, loggingEnabled: false});
const page = (data, offset = 0, totalCount = data.length) => ({data, count: data.length, offset, limit: 200, totalCount});
const reply = value => new Response(JSON.stringify(value), {headers: {'content-type': 'application/json'}});
function fixture(policyResponse, options = {}) {
  const calls = [];
  const env = {location: {origin: 'https://10.24.0.1'}, AbortController, fetch: async (url, request) => {
    const u = new URL(url); calls.push({u, request});
    if (u.pathname.endsWith('/info')) return reply({applicationVersion: api.VERSION});
    if (u.pathname.endsWith('/sites')) return reply(page([{id: uuid(1)}]));
    if (u.pathname.endsWith('/firewall/policies/ordering')) return reply({orderedFirewallPolicyIds: {
      beforeSystemDefined: options.orderIds ?? [uuid(4)], afterSystemDefined: []}});
    if (u.pathname.endsWith('/firewall/policies')) return policyResponse(u);
    if (u.pathname.endsWith('/firewall/zones')) return reply(options.zones ?? page([2, 3].map(n => ({
      id: uuid(n), name: 'Internal', metadata: {origin: 'SYSTEM_DEFINED'}, networkIds: []}))));
    return reply(page([]));
  }};
  return {calls, collect: () => api.collect(env, 'synthetic-policy-key', 0)};
}
function safe(result, calls) {
  const text = JSON.stringify(result);
  assert.ok(!text.includes(privateText));
  assert.ok(!text.includes('synthetic-policy-key'));
  assert.ok(!/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i.test(text));
  for (const {u, request} of calls) {
    assert.equal(u.origin, 'https://10.24.0.1'); assert.equal(request.method, 'GET');
    assert.equal(request.credentials, 'omit'); assert.equal(request.redirect, 'error');
  }
}
function unavailable(result, calls) {
  assert.equal(result.collectionStatus, 'PARTIAL');
  assert.equal(result.coverage.ordering.code, 'policy-inventory-unavailable');
  assert.deepEqual(result.ordering, []);
  assert.equal(calls.filter(({u}) => u.pathname.endsWith('/ordering')).length, 0);
  safe(result, calls);
}

test('mixed rejected identity rows retain typed policy evidence and numeric reasons', async () => {
  const missing = policy(); delete missing.id;
  const f = fixture(async () => reply(page([policy(), missing, policy(null), policy(privateText), null, privateText, []])));
  const result = await f.collect();
  unavailable(result, f.calls);
  assert.equal(result.coverage.policies.status, 'PARTIAL');
  assert.equal(result.coverage.policies.code, 'policy-identity-invalid');
  assert.equal(result.coverage.policies.recordCount, 4);
  assert.deepEqual(result.coverage.policies.diagnostics, {pagesAccepted: 1, rowsRead: 7,
    omittedNonObjectRows: 3, missingIdRows: 1, invalidIdTypeRows: 1, invalidIdFormatRows: 1, duplicateIdRows: 0});
  assert.deepEqual(result.policies.map(p => p.auditRow), [1, 2, 3, 4]);
  assert.deepEqual(result.policies.map(p => p.identityStatus), ['VALID_UUID', 'MISSING_ID', 'INVALID_ID_TYPE', 'INVALID_ID_FORMAT']);
  assert.equal(result.policies[0].semanticStatus, 'COMPLETE');
  for (const p of result.policies.slice(1)) {
    assert.equal(p.id, 'UNKNOWN'); assert.equal(p.semanticStatus, 'INCOMPLETE');
    assert.deepEqual(p.action, {type: 'BLOCK'}); assert.equal(p.enabled, true);
  }
  assert.equal(result.recordsRead, 10); // Site + two zones + all seven policy rows.
  assert.equal(f.calls.length, 6);
});

test('case-insensitive duplicate identity taints every occurrence across pages', async () => {
  const f = fixture(async u => {
    const offset = Number(u.searchParams.get('offset'));
    return reply(page(offset === 0 ? [policy(), null] : [policy(uuid(4).toUpperCase()), policy(), policy(uuid(5))], offset, 5));
  });
  const result = await f.collect(); unavailable(result, f.calls);
  assert.equal(result.coverage.policies.diagnostics.duplicateIdRows, 3);
  assert.deepEqual(result.policies.map(p => p.auditRow), [1, 3, 4, 5]);
  for (const p of result.policies.slice(0, 3)) {
    assert.equal(p.identityStatus, 'DUPLICATE_ID'); assert.equal(p.id, 'UNKNOWN');
    assert.equal(p.semanticStatus, 'INCOMPLETE');
  }
  assert.equal(result.policies[3].id, 'policy-1'); // Duplicates never allocate aliases.
  assert.equal(result.coverage.policies.diagnostics.rowsRead, 5);
  assert.equal(result.recordsRead, 8);
});

test('all non-object rows yield ERROR with counted omissions, not no-rules evidence', async () => {
  const f = fixture(async () => reply(page([null, 42, [], false])));
  const result = await f.collect(); unavailable(result, f.calls);
  assert.equal(result.coverage.policies.status, 'ERROR');
  assert.equal(result.coverage.policies.code, 'policy-identity-invalid');
  assert.deepEqual(result.policies, []);
  assert.equal(result.coverage.policies.diagnostics.omittedNonObjectRows, 4);
});

test('consistently completed empty policy inventory remains COLLECTED', async () => {
  const f = fixture(async () => reply(page([])));
  const result = await f.collect(); safe(result, f.calls);
  assert.equal(result.collectionStatus, 'COMPLETE');
  assert.equal(result.coverage.policies.status, 'COLLECTED');
  assert.equal(result.coverage.policies.diagnostics.pagesAccepted, 1);
  assert.deepEqual(result.policies, []);
});

test('valid UUIDs keep ordering despite preexisting semantic incompleteness', async () => {
  const p = policy(); p.action = {type: privateText};
  const f = fixture(async () => reply(page([p])));
  const result = await f.collect(); safe(result, f.calls);
  assert.equal(result.collectionStatus, 'COMPLETE');
  assert.equal(result.policies[0].identityStatus, 'VALID_UUID');
  assert.equal(result.policies[0].semanticStatus, 'INCOMPLETE');
  assert.equal(result.ordering.length, 1);
  assert.deepEqual(result.ordering[0].beforeSystemDefined, [result.policies[0].id]);
});

test('later changed total or offset discards every previously accepted policy', async () => {
  for (const defect of ['total', 'offset', 'count', 'empty']) {
    const f = fixture(async u => {
      const offset = Number(u.searchParams.get('offset'));
      if (!offset) return reply(page([policy(privateText)], 0, 2));
      const p = page([policy(uuid(5))], 1, 2);
      if (defect === 'total') p.totalCount = 3;
      if (defect === 'offset') p.offset = 0;
      if (defect === 'count') p.count = 2;
      if (defect === 'empty') {p.data = []; p.count = 0;}
      return reply(p);
    });
    const result = await f.collect(); unavailable(result, f.calls);
    assert.equal(result.coverage.policies.status, 'ERROR');
    assert.equal(result.coverage.policies.code, 'pagination-invalid');
    assert.deepEqual(result.policies, []);
    assert.equal(result.coverage.policies.diagnostics.pagesAccepted, 1);
    assert.equal(result.coverage.policies.diagnostics.rowsRead, 1);
    assert.equal(result.coverage.policies.diagnostics.invalidIdFormatRows, 1);
  }
});

test('later HTTP failure discards accepted rows with fixed code and no retry', async () => {
  const f = fixture(async u => Number(u.searchParams.get('offset')) === 0
    ? reply(page([policy()], 0, 2)) : new Response(privateText, {status: 403}));
  const result = await f.collect(); unavailable(result, f.calls);
  assert.deepEqual(result.policies, []);
  assert.equal(result.coverage.policies.code, 'api-access-denied');
  assert.equal(result.coverage.policies.diagnostics.rowsRead, 1);
  assert.equal(f.calls.filter(({u}) => u.pathname.endsWith('/policies')).length, 2);
});

test('policy page limit discards all evidence and counts rejected object rows globally', async () => {
  const f = fixture(async u => reply(page([policy(privateText)], Number(u.searchParams.get('offset')), 51)));
  const result = await f.collect(); unavailable(result, f.calls);
  assert.equal(result.coverage.policies.code, 'page-limit');
  assert.deepEqual(result.policies, []);
  assert.equal(result.coverage.policies.diagnostics.pagesAccepted, 50);
  assert.equal(result.coverage.policies.diagnostics.rowsRead, 50);
  assert.equal(result.recordsRead, 53);
  assert.equal(f.calls.filter(({u}) => u.pathname.endsWith('/policies')).length, 50);
});

test('global record limit includes omitted policy rows and discards unfinished inventory', async () => {
  const f = fixture(async u => {
    const offset = Number(u.searchParams.get('offset'));
    return reply(page(Array(Math.min(200, 5000 - offset)).fill(null), offset, 5000));
  });
  const result = await f.collect(); unavailable(result, f.calls);
  assert.equal(result.coverage.policies.code, 'record-limit');
  assert.deepEqual(result.policies, []);
  assert.equal(result.coverage.policies.diagnostics.rowsRead, 4800);
  assert.equal(result.coverage.policies.diagnostics.omittedNonObjectRows, 4800);
  assert.equal(result.recordsRead, 4803);
});

test('general zone inventory still rejects malformed or duplicate identity wholesale', async () => {
  for (const data of [[{id: privateText}], [{id: uuid(2)}, {id: uuid(2).toUpperCase()}], [null]]) {
    const f = fixture(async () => reply(page([])), {zones: page(data)});
    const result = await f.collect(); safe(result, f.calls);
    assert.equal(result.coverage.zones.status, 'ERROR');
    assert.equal(result.coverage.zones.code, 'pagination-invalid');
    assert.deepEqual(result.zones, []);
  }
});
