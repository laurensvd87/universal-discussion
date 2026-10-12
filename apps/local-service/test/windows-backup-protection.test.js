import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createWindowsBackupProtection } from '../src/ops/windows-backup-protection.js';

const FAILURE = { message: 'Windows backup protection failed' };
const KEY = Buffer.alloc(32, 17);

function fakeSpawn(reply, { code = 0, hang = false, stderr = '', onKill } = {}) {
  const calls = [];
  const spawnImpl = (executable, args, options) => {
    const child = new EventEmitter();
    child.stdin = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => { onKill?.(); setImmediate(() => child.emit('close', null)); return true; };
    child.stdin.end = (input) => {
      calls.push({ executable, args, options, input: Buffer.from(input), wireReference: input, child });
      if (!hang) setImmediate(() => {
        child.stderr.emit('data', Buffer.from(stderr));
        child.stdout.emit('data', Buffer.isBuffer(reply) ? reply : Buffer.from(JSON.stringify(reply)));
        child.emit('close', code);
      });
    };
    return child;
  };
  return { spawnImpl, calls };
}

function adapter(fake, extra = {}) {
  return createWindowsBackupProtection({ platform: 'win32', systemRoot: 'C:\\Windows', spawnImpl: fake.spawnImpl, ...extra });
}

test('unsupported platforms return null without running a process', () => {
  assert.equal(createWindowsBackupProtection({ platform: 'linux', spawnImpl() { assert.fail(); } }), null);
});

test('constant hidden absolute PowerShell wraps an independent 32-byte key through stdin', async () => {
  const blob = Buffer.alloc(128, 41);
  const fake = fakeSpawn({ key: blob.toString('base64') });
  assert.deepEqual(await adapter(fake).wrapKey(KEY), blob);
  assert.deepEqual(KEY, Buffer.alloc(32, 17));
  const [call] = fake.calls;
  assert.equal(call.executable, 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
  assert.deepEqual(call.options, { windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
  assert.deepEqual(call.args.slice(0, 4), ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command']);
  assert.match(call.args[4], /DataProtectionScope\]::CurrentUser/);
  assert.ok(!call.args[4].includes(KEY.toString('base64')));
  assert.deepEqual(JSON.parse(call.input), { op: 'wrap', key: KEY.toString('base64') });
  assert.ok(call.wireReference.every((byte) => byte === 0));
});

test('unwrap returns exactly 32 bytes and operation scripts never interpolate input', async () => {
  const fake = fakeSpawn({ key: KEY.toString('base64') });
  const protection = adapter(fake);
  assert.deepEqual(await protection.unwrapKey(Buffer.alloc(128)), KEY);
  await protection.wrapKey(KEY);
  assert.equal(fake.calls[0].args[4], fake.calls[1].args[4]);
});

test('directory permission script checks ancestors, reparse attributes, owner and exact ACL', async () => {
  const fake = fakeSpawn({ ok: true });
  const folder = 'D:\\project\\data\\canonical-migration-backups';
  assert.equal(await adapter(fake).prepareDirectory(folder), undefined);
  assert.deepEqual(JSON.parse(fake.calls[0].input), { op: 'prepare', folder });
  const script = fake.calls[0].args[4];
  for (const expected of ['ReparsePoint', 'GetOwner', 'SetAccessRuleProtection($true, $false)', 'S-1-5-18', 'GetAccessRules', 'CreateDirectory($folder, $acl)']) {
    assert.ok(script.includes(expected), expected);
  }
  assert.ok(!script.includes(folder));
  assert.ok(!script.includes('Remove-Item'));
});

test('repeated directory preparation verifies existing ACL without permission rewrites', async () => {
  const fake = fakeSpawn({ ok: true });
  const protection = adapter(fake);
  const folder = 'D:\\project\\data\\canonical-migration-backups';
  await protection.prepareDirectory(folder);
  await protection.prepareDirectory(folder);
  const script = fake.calls[0].args[4];
  assert.equal(fake.calls[1].args[4], script);
  assert.ok(!script.includes('Set-Acl'));
  const existingBranch = script.slice(script.indexOf('if ($exists) {'), script.indexOf('} else {', script.indexOf('if ($exists) {')));
  assert.ok(!existingBranch.includes('SetOwner'));
  assert.ok(!existingBranch.includes('CreateDirectory'));
  assert.match(script, /\} else \{\s+\$acl = New-Object Security.AccessControl.DirectorySecurity/);
  assert.ok(script.indexOf('$verified = Get-Acl') > script.indexOf('CreateDirectory($folder, $acl)'));
  assert.ok(script.includes('$rules.Count -ne 2'));
  assert.ok(script.includes('-not $verified.AreAccessRulesProtected'));
});

test('invalid configuration, paths and hostile getters fail with fixed text', async () => {
  for (const systemRoot of ['Windows', '\\\\server\\Windows', 'C:\\Windows\\..\\Other', 'C:\\Windows\n', 'C:\\Windows\\', `C:\\${'a'.repeat(1024)}`]) {
    assert.throws(() => createWindowsBackupProtection({ platform: 'win32', systemRoot }), FAILURE);
  }
  assert.throws(() => createWindowsBackupProtection({ get platform() { throw new Error('secret'); } }), FAILURE);
  const fake = fakeSpawn({ ok: true });
  for (const folder of ['D:\\project\\other\\canonical-migration-backups', 'D:\\project\\data\\other', 'D:\\project\\data\\..\\data\\canonical-migration-backups', '\\\\server\\data\\canonical-migration-backups', { get length() { throw new Error('secret'); } }]) {
    await assert.rejects(adapter(fake).prepareDirectory(folder), FAILURE);
  }
  for (const value of [null, new Uint8Array(32), Buffer.alloc(31), Buffer.alloc(33), { get length() { throw new Error('secret'); } }]) {
    await assert.rejects(adapter(fake).wrapKey(value), FAILURE);
  }
  for (const value of [Buffer.alloc(0), Buffer.alloc(2049)]) await assert.rejects(adapter(fake).unwrapKey(value), FAILURE);
  assert.equal(fake.calls.length, 0);
});

test('invalid, noncanonical, wrong-size and oversized output fails closed', async () => {
  for (const reply of [null, { key: 'AA==' }, { key: 'AB==' }, { key: KEY.toString('base64'), extra: true }, { key: 'AAAA\n' }, Buffer.from('{"key":"secret"}'), Buffer.from([0xff]), Buffer.alloc(4097), { key: Buffer.alloc(2049).toString('base64') }]) {
    const protection = adapter(fakeSpawn(reply));
    await assert.rejects(protection.unwrapKey(Buffer.alloc(128)), FAILURE);
  }
  await assert.rejects(adapter(fakeSpawn({ key: '' })).wrapKey(KEY), FAILURE);
  await assert.rejects(adapter(fakeSpawn({ ok: true, extra: true })).prepareDirectory('D:\\project\\data\\canonical-migration-backups'), FAILURE);
});

test('PowerShell failure and spawn errors never expose stdout or stderr', async () => {
  await assert.rejects(adapter(fakeSpawn(Buffer.from('private stdout'), { code: 1, stderr: 'private stderr' })).wrapKey(KEY), FAILURE);
  await assert.rejects(adapter({ spawnImpl() { throw new Error('secret spawn detail'); } }).wrapKey(KEY), FAILURE);
});

test('timeout kills the child and awaits close before rejecting', async () => {
  let killed = false;
  const fake = fakeSpawn({}, { hang: true, onKill() { killed = true; } });
  await assert.rejects(adapter(fake, { timeoutMs: 5 }).wrapKey(KEY), FAILURE);
  assert.equal(killed, true);
});

test('timeout does not settle or scrub the stdin buffer before child close', async () => {
  const child = new EventEmitter();
  child.stdin = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  let wire;
  let killed;
  const killReached = new Promise((resolve) => { killed = resolve; });
  child.kill = () => { killed(); return true; };
  child.stdin.end = (input) => { wire = input; };
  let settled = false;
  const operation = adapter({ spawnImpl: () => child }, { timeoutMs: 5 }).wrapKey(KEY);
  operation.then(() => { settled = true; }, () => { settled = true; });
  await killReached;
  assert.equal(settled, false);
  assert.ok(wire.some((byte) => byte !== 0));
  child.emit('close', null);
  await assert.rejects(operation, FAILURE);
  assert.ok(wire.every((byte) => byte === 0));
});
