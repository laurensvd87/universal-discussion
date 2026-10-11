'use strict';

// Entirely synthetic fixtures. This file never invokes a real fetch.
const test = require('node:test');
const assert = require('node:assert/strict');
const exporter = require('../export-browser.js');

const ids = Object.freeze({
  site: '10000000-0000-4000-8000-000000000001',
  network: '20000000-0000-4000-8000-000000000001',
  zone: '30000000-0000-4000-8000-000000000001',
  external: '30000000-0000-4000-8000-000000000002',
  policy: '40000000-0000-4000-8000-000000000001',
  list: '50000000-0000-4000-8000-000000000001'
});
const secret = 'SYNTHETIC_SECRET_DO_NOT_EXPORT';

function response(value, extra = {}) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let sent = false;
  return {
    ok: true, status: 200, redirected: false,
    headers: { get: name => name.toLowerCase() === 'content-length' ? String(bytes.length) : name.toLowerCase() === 'content-type' ? 'application/json' : null },
    body: { getReader: () => ({
      read: async () => sent ? { done: true } : (sent = true, { done: false, value: bytes }),
      cancel: async () => {}, releaseLock: () => {}
    }) },
    ...extra
  };
}

function page(data, offset = 0, totalCount = data.length) {
  return { offset, limit: 200, count: data.length, totalCount, data };
}

function clean(value) {
  const serialized = JSON.stringify(value);
  assert.ok(!serialized.includes(secret), 'secret/free text escaped projection');
  for (const id of Object.values(ids)) assert.ok(!serialized.includes(id), 'raw resource ID escaped projection');
}

const policyFixture = () => ({
  id: ids.policy, name: secret, description: secret, enabled: true,
  metadata: { origin: 'USER_DEFINED', privateNote: secret },
  action: { type: 'ALLOW', allowReturnTraffic: true, password: secret },
  source: {
    zoneId: ids.zone,
    trafficFilter: {
      type: 'NETWORK',
      networkFilter: { matchOpposite: true, networkIds: [ids.network] },
      portFilter: {
        type: 'PORTS', matchOpposite: false,
        items: [{ type: 'PORT_NUMBER', value: 443 }, { type: 'PORT_NUMBER_RANGE', start: 8080, stop: 8088 }]
      }
    }
  },
  destination: {
    zoneId: ids.external,
    trafficFilter: {
      type: 'IP_ADDRESS',
      ipAddressFilter: {
        type: 'IP_ADDRESSES', matchOpposite: true,
        items: [
          { type: 'IP_ADDRESS', value: '10.77.0.8' },
          { type: 'SUBNET', value: '192.168.77.0/24' },
          { type: 'IP_ADDRESS_RANGE', start: '172.18.0.1', stop: '172.18.0.9' },
          { type: 'IP_ADDRESS', value: '203.0.113.19' }
        ]
      },
      portFilter: null
    }
  },
  ipProtocolScope: {
    ipVersion: 'IPV4_AND_IPV6',
    protocolFilter: { type: 'NAMED_PROTOCOL', matchOpposite: false, protocol: { name: 'tcp' } }
  },
  loggingEnabled: true,
  nestedCredential: { password: secret, apiKey: secret }
});

test('Node import exposes pure API and does not start the browser flow', () => {
  assert.equal(typeof exporter.createSanitizer, 'function');
  assert.equal(typeof exporter.collect, 'function');
  assert.equal(typeof exporter.run, 'function');
});

test('address projection retains private IPv4 and masks stable public addresses', () => {
  const s = exporter.createSanitizer();
  for (const ip of ['10.77.0.8', '192.168.77.0/24', '172.18.0.1']) assert.equal(s.address(ip), ip);
  const alias = s.address('203.0.113.19');
  assert.match(alias, /^external-address-\d+$/);
  assert.equal(s.address('203.0.113.19'), alias);
  assert.notEqual(s.address('198.51.100.19'), alias);
  assert.equal(s.address(secret), 'UNKNOWN');
  assert.ok(s.issues.length > 0);
});

test('malformed private IPv4 and CIDR never bypass address validation', () => {
  const s = exporter.createSanitizer();
  for (const value of ['10.999.0.1', '10.0.0.1/33', '192.168.1.1/-1', '10.1', '10.0.0.1/password', '10.0.0.1\n']) {
    assert.equal(s.address(value), 'UNKNOWN', value);
  }
});

test('identifiers alias consistently while resource kinds remain distinct', () => {
  const s = exporter.createSanitizer();
  assert.equal(s.id('network', ids.network), s.id('network', ids.network));
  assert.notEqual(s.id('network', ids.network), s.id('zone', ids.network));
  assert.match(s.id('network', ids.network), /^network-\d+$/);
});

test('network export retains topology and strips names and arbitrary nested credentials', () => {
  const s = exporter.createSanitizer();
  const record = {
    id: ids.network, name: secret, enabled: true, vlanId: 77,
    management: 'GATEWAY', firewallZoneId: ids.zone,
    isolationEnabled: true, internetAccessEnabled: false,
    ipv4Configuration: { hostIpAddress: '10.77.0.1', prefixLength: 24, password: secret },
    password: secret, wireless: { ssid: secret, securityKey: secret }
  };
  const result = s.network(record);
  clean(result);
  assert.equal(result.vlanId, 77);
  assert.equal(result.isolationEnabled, true);
  assert.equal(result.internetAccessEnabled, false);
  assert.equal(result.ipv4Configuration.hostIpAddress, '10.77.0.1');
  assert.equal(result.ipv4Configuration.prefixLength, 24);
});

test('only recognized system-defined zone labels survive', () => {
  const s = exporter.createSanitizer();
  const system = s.zone({ id: ids.zone, name: 'Internal', metadata: { origin: 'SYSTEM_DEFINED' } });
  assert.ok(JSON.stringify(system).includes('Internal'));
  clean(s.zone({ id: ids.external, name: secret, metadata: { origin: 'USER_DEFINED' } }));
  assert.ok(!JSON.stringify(s.zone({ id: ids.zone, name: 'External', metadata: { origin: 'USER_DEFINED' } })).includes('External'));
});

test('known policy criteria preserve negation, topology, ports and protocol without raw names', () => {
  const s = exporter.createSanitizer();
  const result = s.policy(policyFixture());
  clean(result);
  const text = JSON.stringify(result);
  assert.ok(text.includes('10.77.0.8'));
  assert.ok(text.includes('192.168.77.0/24'));
  assert.ok(!text.includes('203.0.113.19'));
  assert.ok(text.includes('443'));
  assert.ok(text.includes('8088'));
  assert.ok(text.includes('matchOpposite'));
  assert.equal(result.action.allowReturnTraffic, true);
});

function environment(overrides = {}) {
  const calls = [];
  const env = {
    location: { origin: 'https://192.168.77.1' },
    AbortController,
    fetch: async (url, options) => {
      calls.push({ url: String(url), options });
      const pathname = new URL(url).pathname;
      if (overrides[pathname]) return overrides[pathname](url, options);
      if (pathname.endsWith('/info')) return response({ applicationVersion: '10.6.106' });
      if (pathname.endsWith('/sites')) return response(page([{ id: ids.site, name: secret }]));
      return response(page([]));
    }
  };
  return { env, calls };
}

test('collection uses only local credential-free GET routes and explicit missing audit coverage', async () => {
  const { env, calls } = environment();
  const result = await exporter.collect(env, secret, 0);
  assert.equal(result.applicationVersion, '10.6.106');
  assert.equal(result.auditStatus, 'INCOMPLETE');
  assert.equal(result.collectionStatus, 'COMPLETE');
  assert.ok(result.notCollected.length >= 4);
  clean(result);
  assert.ok(calls.length >= 6);
  for (const { url, options } of calls) {
    const parsed = new URL(url);
    assert.equal(parsed.origin, env.location.origin);
    assert.match(parsed.pathname, /^\/proxy\/network\/integration\/v1\//);
    assert.equal(options.method, 'GET');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.mode, 'same-origin');
    assert.ok(!url.includes(secret));
    assert.ok(!/port.forward|upnp|\/nat|clients|devices|login|backup/i.test(parsed.pathname));
  }
});

test('public, cloud, plain HTTP and opaque origins fail before any request', async () => {
  for (const origin of ['http://192.168.77.1', 'https://203.0.113.19', 'https://unifi.ui.com', 'null', 'https://router.local']) {
    const { env, calls } = environment();
    env.location.origin = origin;
    await assert.rejects(() => exporter.collect(env, secret, 0));
    assert.equal(calls.length, 0, origin);
  }
});

test('unexpected application version stops before site/configuration collection', async () => {
  const { env, calls } = environment({
    '/proxy/network/integration/v1/info': async () => response({ applicationVersion: '10.7.0' })
  });
  await assert.rejects(() => exporter.collect(env, secret, 0));
  assert.equal(calls.length, 1);
});

test('endpoint failure yields fixed incomplete coverage without leaking response body', async () => {
  const path = `/proxy/network/integration/v1/sites/${ids.site}/firewall/zones`;
  const { env } = environment({ [path]: async () => response({ password: secret }, { ok: false, status: 403 }) });
  const result = await exporter.collect(env, secret, 0);
  assert.equal(result.collectionStatus, 'PARTIAL');
  assert.ok(Object.values(result.coverage).some(item => item.status === 'ERROR'));
  clean(result);
});

test('inconsistent pagination is a visible failure instead of a shortened successful list', async () => {
  const path = `/proxy/network/integration/v1/sites/${ids.site}/networks`;
  const { env } = environment({ [path]: async () => response(page([], 0, 1)) });
  const result = await exporter.collect(env, secret, 0);
  assert.equal(result.collectionStatus, 'PARTIAL');
  assert.ok(Object.values(result.coverage).some(item => item.status === 'ERROR'));
  clean(result);
});

test('duplicate IDs are a visible collection error, never silently deduplicated', async () => {
  const path = `/proxy/network/integration/v1/sites/${ids.site}/firewall/zones`;
  const duplicate = { id: ids.zone, name: secret, metadata: { origin: 'USER_DEFINED' } };
  const { env } = environment({ [path]: async () => response(page([duplicate, duplicate])) });
  const result = await exporter.collect(env, secret, 0);
  assert.equal(result.collectionStatus, 'PARTIAL');
  assert.ok(Object.values(result.coverage).some(item => item.status === 'ERROR'));
  clean(result);
});

test('pagination response offset must match the requested page offset', async () => {
  const path = `/proxy/network/integration/v1/sites/${ids.site}/traffic-matching-lists`;
  const { env } = environment({ [path]: async () => response(page([], 200, 0)) });
  const result = await exporter.collect(env, secret, 0);
  assert.equal(result.collectionStatus, 'PARTIAL');
  assert.ok(Object.values(result.coverage).some(item => item.status === 'ERROR'));
  clean(result);
});

test('header and streaming response byte limits reject oversized data', async () => {
  const info = '/proxy/network/integration/v1/info';
  const { env } = environment({ [info]: async () => response({}, {
    headers: { get: name => name === 'content-type' ? 'application/json' : name === 'content-length' ? String(exporter.LIMITS.bytes + 1) : null }
  }) });
  await assert.rejects(() => exporter.collect(env, secret, 0), { auditCode: 'response-size-limit' });
  let cancelled = false;
  const streamed = environment({ [info]: async () => response({}, {
    headers: { get: name => name === 'content-type' ? 'application/json' : null },
    body: { getReader: () => ({
      read: async () => ({ done: false, value: new Uint8Array(exporter.LIMITS.bytes + 1) }),
      cancel: async () => { cancelled = true; }
    }) }
  }) });
  await assert.rejects(() => exporter.collect(streamed.env, secret, 0), { auditCode: 'response-size-limit' });
  assert.equal(cancelled, true);
});

test('fixed request timeout aborts a hanging mocked fetch without retry', async () => {
  let signal;
  const { env, calls } = environment({
    '/proxy/network/integration/v1/info': async (_url, options) => { signal = options.signal; return new Promise(() => {}); }
  });
  env.setTimeout = callback => { queueMicrotask(callback); return 1; };
  env.clearTimeout = () => {};
  await assert.rejects(() => exporter.collect(env, secret, 0), { auditCode: 'request-timeout' });
  assert.equal(calls.length, 1);
  assert.equal(signal.aborted, true);
});

test('non-JSON and redirect responses fail without parsing their contents', async () => {
  for (const extra of [
    { redirected: true },
    { url: 'https://203.0.113.19/proxy/network/integration/v1/info' },
    { headers: { get: () => 'text/html' } }
  ]) {
    const { env } = environment({ '/proxy/network/integration/v1/info': async () => response({ key: secret }, extra) });
    await assert.rejects(() => exporter.collect(env, secret, 0), error => {
      assert.ok(['redirect-not-allowed', 'non-json-response'].includes(error.auditCode));
      assert.ok(!error.message.includes(secret));
      return true;
    });
  }
});

test('network details and directional policy ordering are collected through exact documented routes', async () => {
  const scope = `/proxy/network/integration/v1/sites/${ids.site}`;
  const fixture = policyFixture();
  const { env, calls } = environment({
    [`${scope}/networks`]: async () => response(page([{ id: ids.network, name: secret }])),
    [`${scope}/networks/${ids.network}`]: async () => response({
      id: ids.network, name: secret, management: 'UNMANAGED', enabled: true, default: false, vlanId: 77,
      metadata: { origin: 'USER_DEFINED' }
    }),
    [`${scope}/firewall/policies`]: async () => response(page([fixture])),
    [`${scope}/firewall/policies/ordering`]: async () => response({
      orderedFirewallPolicyIds: { beforeSystemDefined: [ids.policy], afterSystemDefined: [] }
    })
  });
  const result = await exporter.collect(env, secret, 0);
  assert.equal(result.collectionStatus, 'COMPLETE');
  assert.equal(result.networks.length, 1);
  assert.equal(result.ordering.length, 1);
  assert.deepEqual(result.ordering[0].beforeSystemDefined, [result.policies[0].id]);
  assert.equal(result.ordering[0].sourceZoneId, result.policies[0].source.zoneId);
  const orderingCall = calls.find(call => new URL(call.url).pathname.endsWith('/ordering'));
  const query = new URL(orderingCall.url).searchParams;
  assert.equal(query.get('sourceFirewallZoneId'), ids.zone);
  assert.equal(query.get('destinationFirewallZoneId'), ids.external);
  clean(result);
});
