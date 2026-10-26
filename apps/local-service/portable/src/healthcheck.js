import http from 'node:http';
import { pathToFileURL } from 'node:url';

export async function checkReady({ request = http.request, port = Number(process.env.MURMINGLE_PORT ?? 4185) } = {}) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) return false;
  return new Promise(resolve => {
    const probe = request({ host: '127.0.0.1', port, path: '/health/ready', method: 'GET', headers: { host: `127.0.0.1:${port}` }, timeout: 3000 }, response => {
      response.resume(); resolve(response.statusCode === 200);
    });
    probe.on('timeout', () => { probe.destroy(); resolve(false); });
    probe.on('error', () => resolve(false)); probe.end();
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  checkReady().then(ready => { process.exitCode = ready ? 0 : 1; });
}
