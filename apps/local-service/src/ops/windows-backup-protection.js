import { spawn } from 'node:child_process';
import { win32 as path } from 'node:path';

const FAILURE = 'Windows backup protection failed';
const MAX_BLOB = 2048;
const MAX_OUTPUT = 4096;

// This script is constant. Paths and key material enter only through JSON stdin.
const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$clear = $null
try {
  $inputData = [Console]::In.ReadToEnd() | ConvertFrom-Json
  if ($inputData.op -eq 'prepare') {
    $folder = [string]$inputData.folder
    if ($folder.Length -gt 1024 -or $folder -notmatch '^[A-Za-z]:\\' -or
        [IO.Path]::GetFileName($folder) -cne 'canonical-migration-backups' -or
        [IO.Path]::GetFileName([IO.Path]::GetDirectoryName($folder)) -cne 'data' -or
        [IO.Path]::GetFullPath($folder) -cne $folder) { throw 'invalid' }
    $parent = [IO.Path]::GetDirectoryName($folder)
    $cursor = $parent
    while ($cursor) {
      $item = Get-Item -LiteralPath $cursor -Force
      if (-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'invalid' }
      $cursor = [IO.Path]::GetDirectoryName($cursor)
    }
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $systemSid = New-Object Security.Principal.SecurityIdentifier('S-1-5-18')
    $inherit = [Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'
    $exists = Test-Path -LiteralPath $folder
    if ($exists) {
      $item = Get-Item -LiteralPath $folder -Force
      if (-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'invalid' }
    } else {
      $acl = New-Object Security.AccessControl.DirectorySecurity
      $acl.SetOwner($sid)
      $acl.SetAccessRuleProtection($true, $false)
      foreach ($identity in @($sid, $systemSid)) {
        $rule = New-Object Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', $inherit, 'None', 'Allow')
        [void]$acl.AddAccessRule($rule)
      }
      [void][IO.Directory]::CreateDirectory($folder, $acl)
    }
    $item = Get-Item -LiteralPath $folder -Force
    if (-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'invalid' }
    $verified = Get-Acl -LiteralPath $folder
    if (-not $verified.AreAccessRulesProtected -or $verified.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid.Value) { throw 'invalid' }
    $rules = @($verified.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
    if ($rules.Count -ne 2) { throw 'invalid' }
    $seen = @{}
    foreach ($rule in $rules) {
      $id = $rule.IdentityReference.Value
      if (($id -ne $sid.Value -and $id -ne $systemSid.Value) -or $seen.ContainsKey($id) -or
          $rule.IsInherited -or $rule.AccessControlType -ne 'Allow' -or
          $rule.FileSystemRights -ne 'FullControl' -or $rule.InheritanceFlags -ne $inherit -or
          $rule.PropagationFlags -ne 'None') { throw 'invalid' }
      $seen[$id] = $true
    }
    [Console]::Out.Write('{"ok":true}')
  } elseif ($inputData.op -eq 'wrap' -or $inputData.op -eq 'unwrap') {
    Add-Type -AssemblyName System.Security
    $encoded = [string]$inputData.key
    if ($encoded.Length -gt 2732 -or $encoded -notmatch '^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$') { throw 'invalid' }
    $bytes = [Convert]::FromBase64String($encoded)
    if ([Convert]::ToBase64String($bytes) -cne $encoded) { throw 'invalid' }
    if ($inputData.op -eq 'wrap') {
      $clear = $bytes
      if ($clear.Length -ne 32) { throw 'invalid' }
      $result = [Security.Cryptography.ProtectedData]::Protect($clear, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
      if ($result.Length -lt 1 -or $result.Length -gt 2048) { throw 'invalid' }
    } else {
      if ($bytes.Length -lt 1 -or $bytes.Length -gt 2048) { throw 'invalid' }
      $clear = [Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
      if ($clear.Length -ne 32) { throw 'invalid' }
      $result = $clear
    }
    [Console]::Out.Write('{"key":"' + [Convert]::ToBase64String($result) + '"}')
  } else { throw 'invalid' }
} catch { exit 1 }
finally { if ($null -ne $clear) { [Array]::Clear($clear, 0, $clear.Length) } }
`;

function fail() { return new Error(FAILURE); }

function absoluteLocalPath(value) {
  return typeof value === 'string' && value.length <= 1024 &&
    /^[A-Za-z]:\\/.test(value) && !/[\x00-\x1f<>"|?*]/.test(value) &&
    !value.endsWith('\\') &&
    !value.slice(2).includes(':') && value === path.normalize(value) &&
    value.split('\\').slice(1).every((part) => !/[. ]$/.test(part));
}

export function createWindowsBackupProtection(options = {}) {
  try {
    const { platform = process.platform, systemRoot = process.env.SystemRoot,
      spawnImpl = spawn, timeoutMs = 15_000 } = options;
    if (platform !== 'win32') return null;
    if (!absoluteLocalPath(systemRoot) || typeof spawnImpl !== 'function' ||
        !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) throw fail();
    const executable = path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

    async function invoke(input) {
      let wire;
      try {
        wire = Buffer.from(JSON.stringify(input), 'utf8');
        const output = await new Promise((resolve, reject) => {
          let child;
          let failed = false;
          let killed = false;
          let size = 0;
          const chunks = [];
          let timer;
          const stop = () => {
            failed = true;
            if (killed) return;
            killed = true;
            try { child.kill(); } catch { /* Close remains the completion boundary. */ }
          };
          try {
            child = spawnImpl(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', SCRIPT], {
              windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'],
            });
            child.on('error', () => { failed = true; });
            child.stdin.on('error', stop);
            child.stderr.on('data', () => { /* Never retain provider/OS detail. */ });
            child.stdout.on('data', (chunk) => {
              try {
                if (failed) return;
                if (!Buffer.isBuffer(chunk)) { stop(); return; }
                size += chunk.length;
                if (size > MAX_OUTPUT) { stop(); return; }
                chunks.push(Buffer.from(chunk));
              } catch { stop(); }
            });
            child.once('close', (code) => {
              clearTimeout(timer);
              const bytes = Buffer.concat(chunks);
              for (const chunk of chunks) chunk.fill(0);
              if (failed || code !== 0) { bytes.fill(0); reject(fail()); }
              else resolve(bytes);
            });
            timer = setTimeout(stop, timeoutMs);
            child.stdin.end(wire);
          } catch {
            clearTimeout(timer);
            for (const chunk of chunks) chunk.fill(0);
            if (child) { stop(); } else reject(fail());
          }
        });
        try {
          return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(output));
        } finally { output.fill(0); }
      } catch { throw fail(); }
      finally { wire?.fill(0); }
    }

    async function keyOperation(op, key, length) {
      let copy;
      let decoded;
      try {
        if (!Buffer.isBuffer(key) || (op === 'wrap' ? key.length !== 32 : key.length < 1 || key.length > MAX_BLOB)) throw fail();
        copy = Buffer.from(key);
        const result = await invoke({ op, key: copy.toString('base64') });
        if (!result || Object.keys(result).length !== 1 || typeof result.key !== 'string' ||
            result.key.length > 2732 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(result.key)) throw fail();
        decoded = Buffer.from(result.key, 'base64');
        if (decoded.toString('base64') !== result.key || (length ? decoded.length !== length : decoded.length < 1 || decoded.length > MAX_BLOB)) throw fail();
        const accepted = decoded;
        decoded = null;
        return accepted;
      } catch { throw fail(); }
      finally { copy?.fill(0); decoded?.fill(0); }
    }

    return Object.freeze({
      async prepareDirectory(absoluteFolder) {
        try {
          if (!absoluteLocalPath(absoluteFolder) || path.basename(absoluteFolder) !== 'canonical-migration-backups' ||
              path.basename(path.dirname(absoluteFolder)) !== 'data') throw fail();
          const result = await invoke({ op: 'prepare', folder: absoluteFolder });
          if (!result || Object.keys(result).length !== 1 || result.ok !== true) throw fail();
        } catch { throw fail(); }
      },
      wrapKey(key) { return keyOperation('wrap', key, null); },
      unwrapKey(key) { return keyOperation('unwrap', key, 32); },
    });
  } catch { throw fail(); }
}
