'use strict';
// Independent Trust fixtures: never connect to a controller or use real credentials.
const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../export-browser.js');
const uuid = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const SECRET = 'SYNTHETIC_TRUST_PRIVATE_SENTINEL';
const basePolicy = () => ({ id: uuid(4), index: 0, enabled: true,
  metadata: { origin: 'USER_DEFINED' }, action: { type: 'BLOCK' },
  source: { zoneId: uuid(2) }, destination: { zoneId: uuid(3) },
  ipProtocolScope: { ipVersion: 'IPV4_AND_IPV6' }, loggingEnabled: false });
const page = (data, offset = 0, totalCount = data.length) => ({ data, offset, totalCount, count: data.length, limit: 200 });
function response(value, options = {}) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let read = false;
  return { status: 200, redirected: false,
    headers: { get: n => n === 'content-type' ? 'application/json' : null },
    body: { getReader: () => ({ read: async () => read ? { done: true } : (read = true, { done: false, value: bytes }),
      cancel: async () => {}, releaseLock() {} }) }, ...options };
}
function envFor(overrides = {}) {
  const calls = [];
  const env = { location: { origin: 'https://192.168.77.1' }, AbortController,
    fetch: async (url, options) => {
      calls.push({ url, options });
      const path = new URL(url).pathname;
      const suffix = path.replace(/^.*\/sites\/[\da-f-]+/, '');
      if (overrides[suffix]) return overrides[suffix](url, options);
      if (path.endsWith('/info')) return response({ applicationVersion: api.VERSION });
      if (path.endsWith('/sites')) return response(page([{ id: uuid(1) }]));
      return response(page([]));
    } };
  return { env, calls };
}
test('unknown selector values and field names cannot escape or become ANY', () => {
  const s = api.createSanitizer();
  const p = basePolicy();
  p.name = p.description = SECRET;
  p.source.trafficFilter = { type: SECRET, [SECRET]: { password: SECRET } };
  p.action = { type: SECRET, allowReturnTraffic: SECRET };
  p.ipProtocolScope.protocolFilter = { type: 'NAMED_PROTOCOL', matchOpposite: false, protocol: { name: SECRET } };
  const output = s.policy(p);
  assert.equal(output.semanticStatus, 'INCOMPLETE');
  assert.equal(output.source.trafficFilter.type, 'UNKNOWN');
  assert.ok(!JSON.stringify(output).includes(SECRET));
  assert.ok(!JSON.stringify(s.issues).includes(SECRET));
});
test('malformed required selector criteria cannot be certified complete', () => {
  for (const value of [undefined, null, false, [], {}, { matchOpposite: false, networkIds: [] }]) {
    const p = basePolicy();
    p.source.trafficFilter = { type: 'NETWORK', networkFilter: value };
    const result = api.createSanitizer().policy(p);
    assert.equal(result.semanticStatus, 'INCOMPLETE');
    assert.equal(result.source.trafficFilter.type, 'NETWORK');
  }
});
test('issue storage saturation never makes subsequent invalid records COMPLETE', () => {
  const s = api.createSanitizer();
  for (let i = 0; i < 10010; i++) s.address(SECRET);
  const p = basePolicy(); p.source.trafficFilter = { type: SECRET };
  assert.equal(s.policy(p).semanticStatus, 'INCOMPLETE');
});
test('reversed and mixed-family IP ranges remain semantically incomplete', () => {
  for (const [start, stop] of [['10.1.0.9', '10.1.0.1'], ['10.1.0.1', 'fd00::1']]) {
    const result = api.createSanitizer().matchingList({ id: uuid(8), type: 'IPV4_ADDRESSES',
      items: [{ type: 'IP_ADDRESS_RANGE', start, stop }] });
    assert.equal(result.semanticStatus, 'INCOMPLETE');
  }
});
test('matching list address family must agree with its declared type', () => {
  for (const [type, value] of [['IPV4_ADDRESSES', 'fd00::1'], ['IPV6_ADDRESSES', '10.1.0.1']]) {
    const result = api.createSanitizer().matchingList({ id: uuid(8), type,
      items: [{ type: 'IP_ADDRESS', value }] });
    assert.equal(result.semanticStatus, 'INCOMPLETE');
  }
});
test('masked public and global IPv6 selectors never disclose their values', () => {
  const s = api.createSanitizer();
  for (const address of ['203.0.113.77', '2001:db8:abcd::1234', 'fe80::abc']) {
    const output = s.address(address);
    assert.match(output, /^external-address-\d+$/);
    assert.ok(!output.includes(address));
  }
  assert.match(s.address('10.0.0.0/7'), /^external-address-\d+\/7$/);
});
test('changing totalCount invalidates complete collection without exposing page fields', async () => {
  let count = 0;
  const { env } = envFor({ '/firewall/zones': async () => response(++count === 1
    ? page([{ id: uuid(2), name: SECRET }], 0, 2)
    : page([{ id: uuid(3), name: SECRET }], 1, 3)) });
  const output = await api.collect(env, SECRET, 0);
  assert.equal(output.coverage.zones.code, 'pagination-invalid');
  assert.equal(output.collectionStatus, 'PARTIAL');
  assert.deepEqual(output.zones, []);
  assert.ok(!JSON.stringify(output).includes(SECRET));
});
test('redirection and malformed JSON headers stop before reading response bodies', async () => {
  for (const extra of [{ redirected: true }, { url: 'https://public.example/private' },
    { headers: { get: () => 'text/html' } }, { headers: { get: n => n === 'content-type' ? 'application/json' : String(api.LIMITS.bytes + 1) } }]) {
    let reads = 0;
    const { env } = envFor({ '/firewall/zones': async () => response({}, { ...extra,
      body: { getReader: () => { reads++; throw new Error(SECRET); } } }) });
    const output = await api.collect(env, SECRET, 0);
    assert.equal(output.coverage.zones.status, 'ERROR');
    assert.equal(reads, 0);
    assert.ok(!JSON.stringify(output).includes(SECRET));
  }
});
test('stream byte excess cancels its reader and exposes only fixed error codes', async () => {
  let cancelled = 0;
  const { env } = envFor({ '/firewall/zones': async () => response({}, {
    body: { getReader: () => ({ read: async () => ({ done: false, value: new Uint8Array(api.LIMITS.bytes + 1) }),
      cancel: async () => { cancelled++; } }) } }) });
  const output = await api.collect(env, SECRET, 0);
  assert.equal(output.coverage.zones.code, 'response-size-limit');
  assert.equal(cancelled, 1);
});
test('aborted collection never starts a controller request', async () => {
  const { env, calls } = envFor();
  const controller = new AbortController(); controller.abort(); env.signal = controller.signal;
  await assert.rejects(api.collect(env, SECRET, 0), { auditCode: 'export-cancelled' });
  assert.equal(calls.length, 0);
});
test('deadline aborts a stalled request without waiting for the remote implementation', async () => {
  let signal;
  const env = { location: { origin: 'https://192.168.77.1' }, AbortController,
    fetch: (_url, options) => { signal = options.signal; return new Promise(() => {}); },
    setTimeout: callback => { queueMicrotask(callback); return 1; }, clearTimeout() {} };
  await assert.rejects(api.collect(env, SECRET, 0), { auditCode: 'request-timeout' });
  assert.equal(signal.aborted, true);
});
test('non-JSON error text and transport exception messages are never exported', async () => {
  for (const make of [async () => { throw new Error(SECRET); }, async () => response({}, {
    body: { getReader: () => ({ read: async () => ({ done: false, value: new TextEncoder().encode(SECRET) }),
      cancel: async () => {} }) } })]) {
    // A single final chunk exercises the JSON parse error without a real timer delay.
    let sent = false;
    const { env } = envFor({ '/firewall/zones': async (...args) => {
      const value = await make(...args);
      if (value.body) value.body.getReader = () => ({ read: async () => sent ? { done: true }
        : (sent = true, { done: false, value: new TextEncoder().encode(SECRET) }), cancel: async () => {} });
      return value;
    } });
    const output = await api.collect(env, SECRET, 0);
    assert.equal(output.coverage.zones.status, 'ERROR');
    assert.ok(!JSON.stringify(output).includes(SECRET));
  }
});
test('missing pair ordering cannot appear as complete precedence', async () => {
  const { env } = envFor({ '/firewall/policies': async () => response(page([basePolicy()])),
    '/firewall/policies/ordering': async () => response({ orderedFirewallPolicyIds: { beforeSystemDefined: [], afterSystemDefined: [] } }) });
  const output = await api.collect(env, SECRET, 0);
  assert.equal(output.ordering.length, 1);
  assert.equal(output.ordering[0].semanticStatus, 'INCOMPLETE');
});
test('ordering refuses globally valid IDs from another pair or system-defined policies', async () => {
  for (const system of [false, true]) {
    const first = basePolicy(), other = basePolicy(); other.id = uuid(5);
    if (system) other.metadata.origin = 'SYSTEM_DEFINED';
    else other.source.zoneId = uuid(6);
    const { env } = envFor({ '/firewall/policies': async () => response(page([first, other])),
      '/firewall/policies/ordering': async () => response({ orderedFirewallPolicyIds: {
        beforeSystemDefined: [first.id, other.id], afterSystemDefined: [] } }) });
    const output = await api.collect(env, SECRET, 0);
    assert.equal(output.ordering[0].semanticStatus, 'INCOMPLETE');
  }
});
