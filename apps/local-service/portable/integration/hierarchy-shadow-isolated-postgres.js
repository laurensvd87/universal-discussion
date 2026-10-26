// Explicit scratch-process rehearsal only. Import/default execution is inert.
// No existing server, service, HBA, database, protected credential or owner data.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { lstat, realpath, mkdir, mkdtemp, writeFile, readFile, statfs } from 'node:fs/promises';
import { freemem } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'node:net';
import { createPgDatabase } from '../src/database.js';

const BIN = 'D:\\PostgreSQL\\17\\bin';
const RUN_PARENT = 'D:\\GITProjekts\\universal-discussion-bootstrap\\apps\\local-service\\portable\\data\\hierarchy-shadow-native';
const POWERSHELL = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
const MIB = 1024 * 1024;
const WALL_MS = 180_000;
const CLEANUP_RESERVE_MS = 30_000;
const FILE_SCRIPT = String.raw`
$ErrorActionPreference='Stop'
try {
  $paths=[Console]::In.ReadToEnd() | ConvertFrom-Json
  foreach($p in $paths) {
    $item=Get-Item -LiteralPath ([string]$p) -Force
    if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { exit 1 }
  }
  [Console]::Out.Write('checked')
} catch { exit 1 }
`;
const FILE_SCRIPT_BASE64 = Buffer.from(FILE_SCRIPT, 'utf16le').toString('base64');
const samePath = (a, b) => path.win32.resolve(a).toLowerCase() === path.win32.resolve(b).toLowerCase();
const failure = code => Object.assign(Error('Isolated PostgreSQL safeguard failed'), { code });

function remaining(deadline, cap, cleanup = false) {
  const value = Math.floor(deadline - performance.now() - (cleanup ? 0 : CLEANUP_RESERVE_MS));
  if (value < 1) throw failure('WALL_DEADLINE');
  return Math.min(cap, value);
}
function bounded(promise, milliseconds) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(failure('PHASE_DEADLINE')), milliseconds);
  })]).finally(() => clearTimeout(timer));
}
function environment() {
  // Do not forward credential environment variables into native utilities.
  return Object.fromEntries(['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'PATH', 'PATHEXT', 'ComSpec']
    .filter(key => typeof process.env[key] === 'string').map(key => [key, process.env[key]]));
}

/** Pure diagnostic labels only. Raw utility output never escapes this module. */
export function classifyIsolatedPostgresUtilityFailure({ stdout = '', stderr = '', exitCode = null,
  timedOut = false, startErrorCode = null, outputLimit = false } = {}) {
  const text = `${typeof stderr === 'string' ? stderr.slice(-8192) : ''}\n${typeof stdout === 'string' ? stdout.slice(-8192) : ''}`;
  let classification = 'unknown';
  if (timedOut) classification = 'timeout';
  else if (outputLimit) classification = 'output-limit';
  else if (/administrative permissions|(?:cannot|must not|not allowed|not permitted)[^\n]{0,100}(?:administrator|root)|(?:administrator|root)[^\n]{0,100}(?:not permitted|not allowed|cannot)/iu.test(text)) classification = 'administrator-or-root-refusal';
  else if (/could not open file ["']-["'] for reading|(?:password|pwfile)[^\n]{0,100}(?:could not|cannot|empty|read|open)|(?:could not|cannot)[^\n]{0,80}(?:read password|password file)/iu.test(text)) classification = 'password-stdin-read-failure';
  else if (startErrorCode === 'ENOENT' || [3221225781, -1073741515, 3221225595, -1073741701].includes(exitCode) ||
      /(?:postgres|executable|program|dll|library)[^\n]{0,120}(?:not found|could not be found|missing|not the same version|different version|version mismatch)|(?:could not|cannot|unable to)[^\n]{0,80}(?:load|find|execute)[^\n]{0,80}(?:postgres|dll|library|executable)/iu.test(text)) classification = 'executable-library-or-version';
  else if (/invalid locale|locale[^\n]{0,100}(?:invalid|not found|not supported)|(?:could not|cannot|failed)[^\n]{0,80}(?:locale|lc_collate|lc_ctype)/iu.test(text)) classification = 'locale';
  else if (startErrorCode === 'EACCES' || /permission denied|access is denied|access denied|operation not permitted|zugriff verweigert/iu.test(text)) classification = 'permission-or-access';
  return { classification, exitCode: Number.isInteger(exitCode) ? exitCode : -1 };
}

function outputTail() {
  const data = Buffer.alloc(8192); let length = 0;
  return {
    add(chunk) {
      if (chunk.length >= data.length) { chunk.copy(data, 0, chunk.length - data.length); length = data.length; }
      else {
        const keep = Math.min(length, data.length - chunk.length);
        if (keep) data.copy(data, 0, length - keep, length);
        chunk.copy(data, keep); length = keep + chunk.length;
      }
    },
    text: () => data.subarray(0, length).toString('utf8'),
    clear() { data.fill(0); length = 0; },
  };
}
function utility(executable, args, { input = '', timeoutMs, collect = false } = {}) {
  return new Promise((resolve, reject) => {
    let child, timer, timedOut = false, settled = false, stdoutBytes = 0;
    const stdout = outputTail(), stderr = outputTail();
    const finish = (exitCode, startErrorCode = null) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      const excessive = collect && stdoutBytes > 1024;
      if (timedOut || excessive || startErrorCode !== null || exitCode !== 0) {
        const diagnostic = classifyIsolatedPostgresUtilityFailure({ stdout: stdout.text(), stderr: stderr.text(),
          exitCode, timedOut, startErrorCode, outputLimit: excessive });
        stdout.clear(); stderr.clear();
        const error = failure(timedOut ? 'UTILITY_DEADLINE' : startErrorCode !== null ? 'UTILITY_START' : 'UTILITY_FAILED');
        error.utilityFailure = diagnostic;
        reject(error);
      } else {
        const output = collect ? stdout.text() : '';
        stdout.clear(); stderr.clear(); resolve(output);
      }
    };
    try { child = spawn(executable, args, { shell: false, windowsHide: true,
      env: environment(), stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch (error) { finish(null, error?.code ?? 'SPAWN_FAILED'); return; }
    // Kill only this captured short-lived utility child on timeout. The
    // postmaster is handled separately and is never killed by this helper.
    timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    child.once('error', error => finish(null, error?.code ?? 'SPAWN_FAILED'));
    child.stdout.on('data', chunk => {
      if (settled) return;
      stdoutBytes += chunk.length; stdout.add(chunk);
    });
    child.stderr.on('data', chunk => { if (!settled) stderr.add(chunk); });
    child.stdin.on('error', () => {});
    child.once('close', code => finish(code));
    child.stdin.end(input);
  });
}
function ancestors(filename) {
  const result = []; let cursor = path.win32.resolve(filename);
  while (true) {
    result.push(cursor);
    const parent = path.win32.dirname(cursor);
    if (parent === cursor) return result.reverse();
    cursor = parent;
  }
}
async function noReparse(paths, deadline, cleanup = false) {
  const unique = [...new Set(paths.flatMap(ancestors))];
  for (const name of unique) {
    const stat = await lstat(name);
    if (stat.isSymbolicLink() || !samePath(await realpath(name), name)) throw failure('REPARSE_TARGET');
  }
  const result = await utility(POWERSHELL, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', FILE_SCRIPT_BASE64],
    { input: JSON.stringify(unique), timeoutMs: remaining(deadline, 10_000, cleanup), collect: true });
  if (result !== 'checked') throw failure('REPARSE_TARGET');
}
async function binaries(deadline) {
  const files = ['postgres.exe', 'initdb.exe', 'pg_ctl.exe'].map(name => path.win32.join(BIN, name));
  for (const file of [...files, POWERSHELL]) if (!(await lstat(file)).isFile()) throw failure('BINARY_NOT_REGULAR');
  await noReparse([...files, POWERSHELL], deadline);
  return { postgres: files[0], initdb: files[1], pgCtl: files[2] };
}
async function resources() {
  const [c, d] = await Promise.all([statfs('C:\\', { bigint: true }), statfs('D:\\', { bigint: true })]);
  const cFree = c.bavail * c.bsize, dFree = d.bavail * d.bsize;
  if (cFree < BigInt(768 * MIB) || dFree < BigInt(256 * MIB) || freemem() < 1024 * MIB) throw failure('RESOURCE_PREFLIGHT');
  return { cFreeMiB: Number(cFree / BigInt(MIB)), dFreeMiB: Number(dFree / BigInt(MIB)),
    physicalFreeMiB: Math.floor(freemem() / MIB) };
}
async function freePort(deadline) {
  const server = createServer();
  try {
    await bounded(new Promise((resolve, reject) => {
      server.once('error', reject); server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, resolve);
    }), remaining(deadline, 5_000));
    const port = server.address()?.port;
    if (!Number.isInteger(port) || port === 55432 || port < 1024 || port > 65535) throw failure('PORT_PREFLIGHT');
    return port;
  } finally {
    if (server.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}
function guarded(database, deadline, alive) {
  const check = () => { if (!alive.value || performance.now() >= deadline - CLEANUP_RESERVE_MS) throw failure('WALL_DEADLINE'); };
  const wrap = db => ({ dialect: db.dialect,
    query: (...args) => { check(); return db.query(...args); },
    exec: (...args) => { check(); return db.exec(...args); },
    ...(db.transaction ? { transaction: callback => { check(); return db.transaction(tx => callback(wrap(tx))); } } : {}) });
  return wrap(database);
}
async function ownership(runDirectory, dataDirectory, marker, pid, port, expectedStart, deadline, cleanup = false) {
  if (!samePath(path.win32.dirname(runDirectory), RUN_PARENT) ||
      !/^adr132-[a-zA-Z0-9]+$/u.test(path.win32.basename(runDirectory)) ||
      !samePath(dataDirectory, path.win32.join(runDirectory, 'pgdata'))) throw failure('OWNERSHIP_PATH');
  await noReparse([runDirectory, dataDirectory, path.win32.join(runDirectory, 'ownership.json'),
    path.win32.join(dataDirectory, 'postmaster.pid')], deadline, cleanup);
  const markerPath = path.win32.join(runDirectory, 'ownership.json');
  if ((await lstat(markerPath)).size > 4096) throw failure('OWNERSHIP_MARKER');
  const stored = JSON.parse(await readFile(markerPath, 'utf8'));
  if (stored.schema !== 'adr132-isolated-postgres/v1' || stored.nonce !== marker.nonce ||
      stored.runDirectory !== runDirectory) throw failure('OWNERSHIP_MARKER');
  const pidfile = path.win32.join(dataDirectory, 'postmaster.pid');
  if ((await lstat(pidfile)).size > 4096) throw failure('OWNERSHIP_PID');
  const lines = (await readFile(pidfile, 'utf8')).split(/\r?\n/u);
  if (Number(lines[0]) !== pid || !samePath(lines[1], dataDirectory) || Number(lines[3]) !== port ||
      !Number.isSafeInteger(Number(lines[2])) || Number(lines[2]) < 1 ||
      expectedStart !== null && Number(lines[2]) !== expectedStart) throw failure('OWNERSHIP_PID');
  return Number(lines[2]);
}

/** Only the hard-coded harness callback is used. No connection/path overrides. */
export async function runWithIsolatedHierarchyShadowPostgres(runChecks) {
  if (process.argv.slice(2).length !== 1 || process.argv[2] !== '--run-isolated-server')
    return { status: 'not-run', requires: '--run-isolated-server', databaseAccess: false };
  const started = performance.now(), deadline = started + WALL_MS;
  const report = { status: 'failed', syntheticOnly: true, mode: 'isolated-postgres-process',
    runDirectory: null, cleanup: { stopped: true, directoryRetained: false } };
  let phase = 'preflight', native, runDirectory, dataDirectory, marker, password, child, exited = false;
  let childExit, database, checks, proof = null, port, databaseClosed = true;
  const alive = { value: true };
  try {
    if (process.platform !== 'win32' || typeof runChecks !== 'function') throw failure('PLATFORM_OR_CALLBACK');
    report.resources = await resources(); native = await binaries(deadline);
    const dataParent = path.win32.dirname(RUN_PARENT);
    await noReparse([path.win32.dirname(dataParent)], deadline);
    // The fixed portable/data parent may not exist yet. Create one checked
    // component at a time; no recursive mkdir or caller-selected path.
    try { await mkdir(dataParent); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    if (!(await lstat(dataParent)).isDirectory()) throw failure('DATA_PARENT');
    await noReparse([dataParent], deadline);
    try { await mkdir(RUN_PARENT); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    if (!(await lstat(RUN_PARENT)).isDirectory()) throw failure('RUN_PARENT');
    await noReparse([RUN_PARENT], deadline);
    runDirectory = await mkdtemp(path.win32.join(RUN_PARENT, 'adr132-'));
    dataDirectory = path.win32.join(runDirectory, 'pgdata');
    report.runDirectory = runDirectory; report.cleanup.directoryRetained = true;
    marker = { schema: 'adr132-isolated-postgres/v1', nonce: randomBytes(24).toString('hex'), runDirectory };
    await writeFile(path.win32.join(runDirectory, 'ownership.json'), `${JSON.stringify(marker)}\n`, { flag: 'wx' });
    await noReparse([runDirectory, path.win32.join(runDirectory, 'ownership.json')], deadline);
    const random = randomBytes(32); password = random.toString('base64url'); random.fill(0);
    phase = 'initdb';
    // PostgreSQL 17 treats --pwfile=- as a literal filename. No trust window or
    // password file: local auth rejects, TCP requires SCRAM but has no password
    // until the next strictly offline single-user step succeeds.
    await utility(native.initdb, ['-D', dataDirectory, '--username=postgres',
      '--auth-local=reject', '--auth-host=scram-sha-256', '--encoding=UTF8', '--no-locale', '--no-instructions'],
    { timeoutMs: remaining(deadline, 60_000) });
    await noReparse([dataDirectory], deadline);
    phase = 'offline-own-cluster-password';
    if (!/^[A-Za-z0-9_-]{43}$/u.test(password)) throw failure('GENERATED_PASSWORD_ALPHABET');
    try {
      await lstat(path.win32.join(dataDirectory, 'postmaster.pid'));
      throw failure('UNEXPECTED_OWN_CLUSTER_POSTMASTER');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    // --single is the first argument and postgres the last. Never use -E
    // (command echo), -r (log file), shell interpolation or a password argument.
    await utility(native.postgres, ['--single', '-D', dataDirectory, '-c', 'shared_buffers=16MB',
      '-c', 'max_connections=8', '-c', 'max_worker_processes=0', '-c', 'max_wal_senders=0',
      '-c', 'password_encryption=scram-sha-256', '-c', 'logging_collector=off',
      '-c', 'log_statement=none', '-c', 'log_min_error_statement=panic', '-c', 'exit_on_error=on', 'postgres'],
    { input: `ALTER USER postgres WITH PASSWORD '${password}';\n`, timeoutMs: remaining(deadline, 30_000) });
    port = await freePort(deadline);
    phase = 'owned-postmaster-start';
    child = spawn(native.postgres, ['-D', dataDirectory, '-h', '127.0.0.1', '-p', String(port),
      '-c', 'shared_buffers=16MB', '-c', 'work_mem=1MB', '-c', 'maintenance_work_mem=8MB',
      '-c', 'temp_buffers=1MB', '-c', 'wal_buffers=1MB', '-c', 'min_wal_size=32MB', '-c', 'max_wal_size=64MB',
      '-c', 'max_connections=8', '-c', 'max_worker_processes=0', '-c', 'max_parallel_workers=0',
      '-c', 'max_wal_senders=0', '-c', 'autovacuum=off', '-c', 'jit=off', '-c', 'logging_collector=off'],
    { shell: false, windowsHide: true, env: environment(), stdio: ['ignore', 'ignore', 'ignore'] });
    let childFailed = false;
    childExit = new Promise(resolve => {
      child.once('error', () => { childFailed = true; exited = true; resolve(); });
      child.once('close', () => { exited = true; resolve(); });
    });
    database = await createPgDatabase({ config: { host: '127.0.0.1', port, user: 'postgres', password, ssl: false,
      database: 'postgres', max: 1, connectionTimeoutMillis: 1_000, idleTimeoutMillis: 1_000,
      application_name: 'murmingle-adr132-isolated-shadow', options: '-c statement_timeout=10000 -c lock_timeout=10000' } });
    databaseClosed = false;
    phase = 'owned-server-proof';
    const readyUntil = performance.now() + remaining(deadline, 25_000);
    let ready;
    while (performance.now() < readyUntil) {
      if (exited || childFailed) throw failure('OWNED_POSTMASTER_EXITED');
      try {
        ready = (await database.query(`SELECT current_setting('data_directory') AS directory,
          current_setting('port') AS port,current_setting('listen_addresses') AS listen,
          current_setting('server_version_num') AS version,
          extract(epoch FROM pg_postmaster_start_time()) AS started`)).rows[0];
        break;
      } catch { await delay(100); }
    }
    if (!ready || !Number.isSafeInteger(child.pid) || !samePath(ready.directory, dataDirectory) ||
        Number(ready.port) !== port || ready.listen !== '127.0.0.1' || Number(ready.version) < 170000 ||
        Number(ready.version) >= 180000) throw failure('OWNED_SERVER_PROOF');
    const start = await ownership(runDirectory, dataDirectory, marker, child.pid, port, null, deadline);
    if (Math.abs(Number(ready.started) - start) > 1) throw failure('OWNED_SERVER_START');
    proof = { pid: child.pid, start };
    report.server = { port, postmasterPid: child.pid, version: Number(ready.version), ownershipVerified: true };
    phase = 'own-server-scratch-database';
    // This name is reserved by the existing checks. It is created exclusively
    // inside this freshly initialized, SQL/PID-proven server; no connection to
    // the installed service or its same-named database is made.
    const occupied = (await database.query("SELECT 1 FROM pg_database WHERE datname='murmingle_v4_native_test'")).rows;
    if (occupied.length) throw failure('OWN_SCRATCH_ALREADY_EXISTS');
    await database.query('CREATE DATABASE murmingle_v4_native_test OWNER postgres TEMPLATE template0');
    await database.close(); databaseClosed = true; database = null;
    database = await createPgDatabase({ config: { host: '127.0.0.1', port, user: 'postgres', password, ssl: false,
      database: 'murmingle_v4_native_test', max: 3, connectionTimeoutMillis: 1_000, idleTimeoutMillis: 1_000,
      application_name: 'murmingle-adr132-isolated-shadow', options: '-c statement_timeout=10000 -c lock_timeout=10000' } });
    databaseClosed = false;
    const scratchIdentity = (await database.query(`SELECT current_database() AS database,
      current_setting('data_directory') AS directory,current_setting('port') AS port,
      extract(epoch FROM pg_postmaster_start_time()) AS started`)).rows[0];
    if (scratchIdentity.database !== 'murmingle_v4_native_test' || !samePath(scratchIdentity.directory, dataDirectory) ||
        Number(scratchIdentity.port) !== port || Math.abs(Number(scratchIdentity.started) - proof.start) > 1)
      throw failure('OWN_SCRATCH_SERVER_PROOF');
    phase = 'synthetic-native-checks';
    checks = Promise.resolve().then(() => runChecks(guarded(database, deadline, alive)));
    checks.catch(() => {});
    report.metrics = await bounded(checks, remaining(deadline, 90_000));
    report.status = 'passed';
  } catch (error) {
    report.failure = { phase, code: typeof error?.code === 'string' && /^[A-Z0-9_]{1,32}$/u.test(error.code) ? error.code : 'ISOLATED_CHECK_FAILED' };
    if (error?.utilityFailure) report.failure.utilityFailure = error.utilityFailure;
  } finally {
    alive.value = false;
    // After a deadline the guarded callback cannot start another query. Existing
    // queries retain their bounded session timeouts and transaction rollbacks.
    if (checks) await checks.catch(() => {});
    if (database) {
      try { await database.close(); databaseClosed = true; }
      catch { report.cleanup.reason = 'own-pool-close-failed'; }
    }
    if (child && !exited) {
      report.cleanup.stopped = false;
      if (!databaseClosed || !proof) report.cleanup.reason = !proof ? 'no-verified-server-proof-no-stop' : 'own-pool-open-no-stop';
      else {
        try {
          await ownership(runDirectory, dataDirectory, marker, proof.pid, port, proof.start, deadline, true);
          await utility(native.pgCtl, ['-D', dataDirectory, 'stop', '-m', 'smart', '-w', '-t', '15'],
            { timeoutMs: remaining(deadline, 20_000, true) });
          await bounded(childExit, remaining(deadline, 5_000, true));
          report.cleanup.stopped = exited; report.cleanup.reason = exited ? 'verified-own-server-smart-stopped' : 'own-server-still-running';
        } catch { report.cleanup.reason = 'verified-smart-stop-refused-or-timed-out-no-kill'; }
      }
    } else report.cleanup.stopped = true;
    // Deliberately retain generated files, including the ownership marker and
    // stopped cluster, for root review. No recursive removal exists here.
    if (!report.cleanup.stopped || !databaseClosed) report.status = 'failed';
    // A refused stop leaves only this owned server for explicit root review.
    // It must not keep the reporting CLI alive; no signal is sent to it.
    if (child && !exited && !report.cleanup.stopped) child.unref();
    password = null;
    report.elapsedMilliseconds = Math.round(performance.now() - started);
    if (runDirectory) {
      // A fixed leaf in this fresh owned directory is written once, before the
      // caller emits stdout. The result contains no password or connection config.
      const resultFile = path.win32.join(runDirectory, 'native-result.json');
      try {
        await noReparse([runDirectory, path.win32.join(runDirectory, 'ownership.json')], deadline, true);
        const stored = JSON.parse(await readFile(path.win32.join(runDirectory, 'ownership.json'), 'utf8'));
        if (stored.schema !== marker.schema || stored.nonce !== marker.nonce || stored.runDirectory !== runDirectory)
          throw failure('OWNERSHIP_MARKER');
        report.resultFile = resultFile;
        await writeFile(resultFile, `${JSON.stringify(report)}\n`, { flag: 'wx' });
      } catch {
        report.status = 'failed'; report.resultFile = null;
        report.resultPersistence = 'refused-or-failed-no-overwrite';
      }
    }
  }
  return report;
}
