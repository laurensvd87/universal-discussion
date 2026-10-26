import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';

const read = (name) => readFile(new URL(`../${name}`, import.meta.url), 'utf8');
const compose = parse(await read('compose.yaml'), { merge: true });
const digest = /@sha256:[a-f0-9]{64}$/;

test('rehearsal has only loopback API ingress and no database or worker publication', () => {
  const published = Object.entries(compose.services).flatMap(([name, service]) => (service.ports ?? []).map(port => [name, port]));
  assert.deepEqual(published, [['api', '127.0.0.1:4185:4185']]);
  assert.equal(compose.networks.private.internal, true);
  for (const service of Object.values(compose.services)) {
    assert.deepEqual(service.networks, ['private']);
    assert.equal(service.restart, 'no');
    assert.equal(service.privileged, undefined);
    assert.equal(service.network_mode, undefined);
  }
});

test('app roles are hardened, deliberate migration and fixture seed never autostart', () => {
  for (const name of ['api', 'worker', 'migrate', 'seed-fixture', 'verify']) {
    const service = compose.services[name];
    assert.equal(service.image, compose.services.api.image);
    assert.equal(service.read_only, true);
    assert.deepEqual(service.cap_drop, ['ALL']);
    assert.deepEqual(service.security_opt, ['no-new-privileges:true']);
    assert.ok(service.user && service.user !== 'root' && service.user !== '0');
    assert.equal(service.environment.MURMINGLE_MODE, 'synthetic-rehearsal');
    assert.equal(service.environment.DATABASE_URL, undefined);
    assert.equal(service.environment.PGPASSWORD, undefined);
    assert.ok(service.environment.MURMINGLE_DATABASE_PASSWORD_FILE.startsWith('/run/secrets/'));
    assert.equal(service.volumes, undefined);
    assert.ok(service.secrets.includes(['migrate', 'seed-fixture'].includes(name) ? 'owner_db_password' : 'app_db_password'));
    assert.equal(service.secrets.includes('admin_db_password'), false);
  }
  assert.deepEqual(compose.services.migrate.profiles, ['tools']);
  assert.deepEqual(compose.services['seed-fixture'].profiles, ['tools']);
  assert.deepEqual(compose.services.verify.profiles, ['tools']);
  assert.equal(compose.services.migrate.environment.MURMINGLE_DATABASE_USER, 'murmingle_owner');
  assert.equal(compose.services['seed-fixture'].environment.MURMINGLE_DATABASE_USER, 'murmingle_owner');
  assert.equal(compose.services.api.environment.MURMINGLE_DATABASE_USER, 'murmingle_app');
  assert.deepEqual(compose.services['restore-db'].profiles, ['restore']);
  assert.ok(compose.services['restore-db'].volumes[0].startsWith('synthetic-restore-data:'));
  assert.ok(compose.services.db.volumes[0].startsWith('synthetic-db-data:'));
});

test('image versions and digests pinned, Docker copy and context allowlist exclude owner material', async () => {
  const dockerfile = await read('Dockerfile');
  assert.match(dockerfile.split('\n')[0], /^FROM node:24\.\d+\.\d+-bookworm-slim@sha256:[a-f0-9]{64}$/);
  assert.match(compose.services.db.image, /^pgvector\/pgvector:0\.8\.\d+-pg17-bookworm/);
  assert.match(compose.services.db.image, digest);
  assert.equal(compose.services.db.image, compose.services['restore-db'].image);
  assert.match(dockerfile, /npm ci --omit=dev --ignore-scripts/);
  assert.match(dockerfile, /^USER node$/m);
  const copies = dockerfile.split('\n').filter(line => line.startsWith('COPY '));
  assert.equal(copies.length, 5);
  for (const line of copies) assert.doesNotMatch(line, /COPY\s+\.\s|data|logs|accounts|chatgpt|spikes|secrets/);
  const ignore = await read('Dockerfile.dockerignore');
  assert.equal(ignore.trim(), (await read('.dockerignore')).trim());
  assert.equal(ignore.split('\n')[0], '**');
  const allowed = ignore.split('\n').filter(line => line.startsWith('!'));
  for (const line of allowed) assert.match(line, /^!(?:portable\/(?:$|package(?:-lock)?\.json$|src\/(?:$|\*\*$)|migrations\/(?:$|\*\*$)|integration\/(?:$|native-check\.js$))|src\/(?:$|domain\/(?:$|validation\.js$|errors\.js$)))$/);
  assert.equal(compose.services.api.build.context, '..');
  assert.equal(compose.services.api.build.dockerfile, 'portable/Dockerfile');
});

test('credentials are provisioned random files and runtime database role cannot migrate', async () => {
  for (const [name, secret] of Object.entries(compose.secrets)) assert.equal(secret.file, `./secrets/${name}`);
  const generator = await read('ops/init-secrets.js');
  assert.match(generator, /randomBytes\(32\)/);
  assert.match(generator, /'wx', 0o600/);
  assert.doesNotMatch(generator, /console\.log\([^\n]*(?:randomBytes|value|token)/);
  const init = await read('ops/init-db.sh');
  assert.match(init, /murmingle_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION/);
  assert.match(init, /murmingle_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION/);
  assert.match(init, /REVOKE ALL ON SCHEMA public FROM PUBLIC/);
  assert.doesNotMatch(init, /ALTER DEFAULT PRIVILEGES.*GRANT/);
  assert.doesNotMatch(init, /GRANT (?:ALL|CREATE).*TO murmingle_app/);
  const serialized = JSON.stringify(compose);
  assert.doesNotMatch(serialized, /DPAPI|local-service\/data|oauth|provider|smtp|MAIL_|OPENAI_/i);
});

test('backup refuses replacement and restore hardcodes an independent fresh target', async () => {
  const backup = await read('ops/backup.js');
  assert.match(backup, /'wx', 0o600/);
  assert.match(backup, /--format=custom/);
  const restore = await read('ops/restore.js');
  assert.match(restore, /'restore-db'/);
  assert.match(restore, /murmingle_synthetic_restore/);
  assert.match(restore, /count\.trim\(\) !== '0'/);
  assert.match(restore, /--single-transaction/);
  assert.match(restore, /--no-comments/);
  assert.doesNotMatch(restore, /DROP\s+(?:DATABASE|SCHEMA)|down.*--volumes|--clean/);
});
