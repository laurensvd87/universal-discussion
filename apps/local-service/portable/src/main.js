import { pathToFileURL } from 'node:url';
import { loadConfig } from './config.js';
import { createPortableHandler } from './handler.js';
import { runWorker } from './worker.js';

export async function runRole(role, { env = process.env, dependencies, signal = new AbortController().signal, logger = () => {} } = {}) {
  if (!['api', 'worker', 'migrate', 'seed-fixture'].includes(role)) throw new Error('portable-role-invalid');
  const config = await loadConfig(env, { ...dependencies?.configOptions, role });
  if (['migrate', 'seed-fixture'].includes(role) !== (config.database.user === 'udl_owner')) throw new Error('portable-database-role-invalid');
  const adapters = dependencies ?? await defaultDependencies();
  const database = await adapters.createDatabase(config.database);
  let server;
  try {
    if (role === 'migrate') { await adapters.migrate(database); return; }
    const repository = adapters.createRepository({ database });
    if (role === 'seed-fixture') {
      if (!config.fixtureTokens.alex || !config.fixtureTokens.blair) throw new Error('portable-fixture-tokens-required');
      await adapters.seedFixture(repository, { tokens: config.fixtureTokens }); return;
    }
    if (role === 'worker') { await runWorker({ repository, signal, logger, sleep: adapters.sleep }); return; }
    server = adapters.createServer({ maxHeaderSize: config.maxHeaderBytes }, createPortableHandler({ repository, config, logger }));
    server.requestTimeout = 10000; server.headersTimeout = 5000; server.keepAliveTimeout = 1000;
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(config.port, config.bind, () => { server.removeListener('error', reject); resolve(); });
    });
    if (!signal.aborted) await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
  } finally {
    if (server?.listening) await new Promise(resolve => {
      const timer = setTimeout(() => server.closeAllConnections?.(), 5000); timer.unref();
      server.close(() => { clearTimeout(timer); resolve(); }); server.closeIdleConnections?.();
    });
    await database.close();
  }
}

async function defaultDependencies() {
  const [{ createServer }, { createPgDatabase }, { createPortableRepository }, { migrate }, { seedFixture }] = await Promise.all([
    import('node:http'), import('./database.js'), import('./repository.js'), import('./migrate.js'), import('./fixture.js'),
  ]);
  return { createServer, createDatabase: config => createPgDatabase({ config }), createRepository: createPortableRepository, migrate, seedFixture };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const controller = new AbortController();
  for (const event of ['SIGINT', 'SIGTERM']) process.once(event, () => controller.abort());
  const logger = ({ requestId, code }) => {
    // Never serialize the request, URL, database error, body or credentials.
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(requestId) || !/^[a-z-]{1,64}$/.test(code)) return;
    process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), requestId, code })}\n`);
  };
  runRole(process.argv[2], { signal: controller.signal, logger }).catch(() => {
    process.stderr.write('portable-start-failed\n'); process.exitCode = 1;
  });
}
