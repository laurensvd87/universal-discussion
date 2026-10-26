import { spawn } from 'node:child_process';
import { lstatSync } from 'node:fs';
import path from 'node:path';

const ROLE_FILES = Object.freeze({
  postgres: 'postgres-admin.dpapi',
  murmingle_owner: 'murmingle-owner.dpapi',
  murmingle_app: 'murmingle-app.dpapi',
  murmingle_crawler_submitter: 'murmingle-crawler.dpapi',
  murmingle_ingest_worker: 'murmingle-worker.dpapi',
});
const MAX_OUTPUT = 1024;

// The path is selected in JavaScript from a fixed role allow-list. PowerShell
// receives it through stdin and returns only base64 over a private pipe; the
// clear password is never placed in an argument, URL, file, or environment.
const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$clearBytes = $null
$pointer = [IntPtr]::Zero
try {
  [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
  $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
  $file = [IO.Path]::GetFullPath([string]$request.path)
  if (-not [IO.File]::Exists($file)) { throw 'missing' }
  $item = Get-Item -LiteralPath $file -Force
  if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
      $item.Length -lt 32 -or $item.Length -gt 8192) { throw 'invalid' }
  $cipher = [IO.File]::ReadAllText($file)
  if ($cipher.Length -lt 32 -or $cipher.Length -gt 8192) { throw 'invalid' }
  $secure = ConvertTo-SecureString -String $cipher
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  $clear = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  if ($clear.Length -lt 32 -or $clear.Length -gt 256 -or $clear -match '[\x00-\x1f\x7f]') { throw 'invalid' }
  $clearBytes = [Text.Encoding]::UTF8.GetBytes($clear)
  [Console]::Out.Write([Convert]::ToBase64String($clearBytes))
} catch { exit 1 }
finally {
  if ($null -ne $clearBytes) { [Array]::Clear($clearBytes,0,$clearBytes.Length) }
  if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}`;
// Windows' native argv quoting is not a lossless carrier for a multiline
// PowerShell command. Encode the static, non-secret helper as UTF-16LE so
// PowerShell receives the exact script; the credential path still travels
// only over stdin and the clear value only over the private stdout pipe.
const ENCODED_SCRIPT = Buffer.from(SCRIPT, 'utf16le').toString('base64');

function unavailable() {
  return new Error('Protected PostgreSQL credential unavailable');
}

function checkedFile(role, localAppData) {
  const leaf = ROLE_FILES[role];
  if (!leaf || typeof localAppData !== 'string' || !path.win32.isAbsolute(localAppData)) throw unavailable();
  const root = path.win32.resolve(localAppData);
  const directory = path.win32.join(root, 'Murmingle', 'PostgreSQL17');
  const filename = path.win32.join(directory, leaf);
  if (path.win32.dirname(filename) !== directory || path.win32.basename(filename) !== leaf) throw unavailable();
  try {
    for (const candidate of [root, path.win32.join(root, 'Murmingle'), directory, filename]) {
      const stat = lstatSync(candidate);
      if (stat.isSymbolicLink() || (candidate === filename ? !stat.isFile() : !stat.isDirectory())) throw unavailable();
    }
  } catch { throw unavailable(); }
  return filename;
}

function invoke({ executable, filename, spawnImpl, timeoutMs }) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnImpl(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', ENCODED_SCRIPT], {
        windowsHide: true,
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch { reject(unavailable()); return; }
    let settled = false;
    const chunks = [];
    let size = 0;
    const finish = (failed) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const output = Buffer.concat(chunks, size);
      for (const chunk of chunks) chunk.fill(0);
      if (failed) { output.fill(0); reject(unavailable()); return; }
      let decoded;
      try {
        const encoded = output.toString('ascii');
        if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(encoded)) throw unavailable();
        decoded = Buffer.from(encoded, 'base64');
        if (decoded.length < 32 || decoded.length > 256 || decoded.toString('base64') !== encoded) throw unavailable();
        const password = new TextDecoder('utf-8', { fatal: true }).decode(decoded);
        if (/[\u0000-\u001f\u007f]/u.test(password)) throw unavailable();
        resolve(password);
      } catch { reject(unavailable()); }
      finally { output.fill(0); decoded?.fill(0); }
    };
    const stop = () => {
      try { child.kill(); } catch {}
      finish(true);
    };
    const timer = setTimeout(stop, timeoutMs);
    child.once('error', stop);
    child.once('close', code => finish(code !== 0));
    child.stdin.once('error', stop);
    child.stdout.on('data', chunk => {
      if (settled || !Buffer.isBuffer(chunk) || size + chunk.length > MAX_OUTPUT) { stop(); return; }
      chunks.push(Buffer.from(chunk)); size += chunk.length;
    });
    child.stderr.resume();
    child.stdin.end(JSON.stringify({ path: filename }), 'utf8');
  });
}

export function createWindowsDpapiPasswordProvider({ role, platform = process.platform,
  localAppData = process.env.LOCALAPPDATA, systemRoot = process.env.SystemRoot,
  spawnImpl = spawn, timeoutMs = 10_000 } = {}) {
  if (platform !== 'win32' || typeof systemRoot !== 'string' || !path.win32.isAbsolute(systemRoot) ||
      typeof spawnImpl !== 'function' || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 30_000)
    throw unavailable();
  const filename = checkedFile(role, localAppData);
  const executable = path.win32.join(path.win32.resolve(systemRoot), 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  try {
    const stat = lstatSync(executable);
    if (!stat.isFile() || stat.isSymbolicLink()) throw unavailable();
  } catch { throw unavailable(); }
  return Object.freeze(() => invoke({ executable, filename, spawnImpl, timeoutMs }));
}

export const WINDOWS_POSTGRESQL_ROLE_FILES = ROLE_FILES;
