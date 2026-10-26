// Bounded read latency under the running crawler. Credentials and response
// content stay in memory and never enter arguments, logs or benchmark artifacts.
import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

if (process.argv.length !== 2) throw new Error('Unexpected read benchmark arguments');
const originBytes = await readFile(new URL('../data/pairing.json', import.meta.url));
let origin;
try {
  if (originBytes.length > 8192) throw new Error('Invalid pairing metadata');
  origin = JSON.parse(originBytes).origin;
  if (typeof origin !== 'string' || !/^chrome-extension:\/\/[a-p]{32}$/.test(origin))
    throw new Error('Invalid pairing origin');
} finally { originBytes.fill(0); }
const tokenBytes = await readFile(new URL('../data/pairing-recovery/pairing-token.txt', import.meta.url));
let token;
try {
  if (tokenBytes.length > 128) throw new Error('Invalid pairing credential');
  token = tokenBytes.toString('utf8').replace(/\r?\n$/, '');
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('Invalid pairing credential');
} finally { tokenBytes.fill(0); }
const requests = [
  { path: '/v1/version' }, { path: '/v1/version' },
  { path: '/v1/catalog/url-selection', url: 'https://en.wikipedia.org/wiki/Principles_of_grouping' },
  { path: '/v1/catalog/url-selection', url: 'https://de.wikipedia.org/wiki/Hammerwurf' },
  { path: '/v1/catalog/url-selection', url: 'https://es.wikipedia.org/wiki/Apolo_17' },
];
const rows = [];
for (const request of requests) {
  const before = performance.now();
  try {
    const response = await fetch('http://127.0.0.1:4174' + request.path, {
      method: request.url ? 'POST' : 'GET',
      headers: { authorization: 'Bearer ' + token, origin, ...(request.url ? { 'content-type': 'application/json' } : {}) },
      ...(request.url ? { body: JSON.stringify({ url: request.url }) } : {}),
      signal: AbortSignal.timeout(10000),
    });
    const bytes = await response.arrayBuffer();
    rows.push({ operation: request.url ? 'stored-url-selection' : 'version',
      status: response.status, milliseconds: performance.now() - before,
      responseBytes: bytes.byteLength });
    new Uint8Array(bytes).fill(0);
  } catch { rows.push({ operation: request.url ? 'stored-url-selection' : 'version',
    status: 'unavailable', milliseconds: performance.now() - before }); }
}
token = null;
const result = { schema: 'hierarchy-live-read-latency/v1', measuredAt: new Date().toISOString(),
  scope: 'authenticated-api-roundtrip-not-browser-rendering', rows, applicationMutations: false,
  responseContentRetained: false };
await writeFile(new URL('../data/hierarchy-live-read-latency-20261026.json', import.meta.url),
  JSON.stringify(result), { flag: 'wx' });
process.stdout.write(JSON.stringify(result) + '\n');
