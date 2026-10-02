import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

const MAX_RECORD_BYTES = 32_768;
const MAX_OUTPUT_BYTES = 65_536;
const DEFAULT_TIMEOUT_MS = 5_000;

// This script is constant. Paths and credentials are passed through stdin, never
// through an argument, environment variable, URL, or diagnostic stream.
const DPAPI_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
try {
  Add-Type -AssemblyName System.Security
  $inputText = [Console]::In.ReadToEnd()
  $request = ConvertFrom-Json -InputObject $inputText
  $path = [string]$request.path
  if ([string]::IsNullOrWhiteSpace($path)) { throw 'invalid path' }
  $temporary = "$path.tmp"
  $backup = "$path.bak"
  if ($request.operation -eq 'read') {
    if ([System.IO.File]::Exists($temporary)) { [System.IO.File]::Delete($temporary) }
    if ([System.IO.File]::Exists($backup)) { [System.IO.File]::Delete($backup) }
    if (-not [System.IO.File]::Exists($path)) { [Console]::Out.Write('null'); exit 0 }
    $cipher = [System.IO.File]::ReadAllBytes($path)
    if ($cipher.Length -lt 1 -or $cipher.Length -gt 65536) { throw 'invalid blob' }
    $clear = [System.Security.Cryptography.ProtectedData]::Unprotect(
      $cipher, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
    if ($clear.Length -lt 1 -or $clear.Length -gt 32768) { throw 'invalid record' }
    [Console]::Out.Write([System.Text.Encoding]::UTF8.GetString($clear))
    exit 0
  }
  if ($request.operation -eq 'write') {
    $clear = [System.Text.Encoding]::UTF8.GetBytes([string]$request.record)
    if ($clear.Length -lt 1 -or $clear.Length -gt 32768) { throw 'invalid record' }
    $cipher = [System.Security.Cryptography.ProtectedData]::Protect(
      $clear, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
    $directory = [System.IO.Path]::GetDirectoryName($path)
    [System.IO.Directory]::CreateDirectory($directory) | Out-Null
    if ([System.IO.File]::Exists($temporary)) { [System.IO.File]::Delete($temporary) }
    if ([System.IO.File]::Exists($backup)) { [System.IO.File]::Delete($backup) }
    try {
      [System.IO.File]::WriteAllBytes($temporary, $cipher)
      if ([System.IO.File]::Exists($path)) {
        [System.IO.File]::Replace($temporary, $path, $backup)
      } else {
        [System.IO.File]::Move($temporary, $path)
      }
    } finally {
      if ([System.IO.File]::Exists($temporary)) { [System.IO.File]::Delete($temporary) }
      if ([System.IO.File]::Exists($backup)) { [System.IO.File]::Delete($backup) }
    }
    exit 0
  }
  if ($request.operation -eq 'clear') {
    if ([System.IO.File]::Exists($path)) { [System.IO.File]::Delete($path) }
    if ([System.IO.File]::Exists($temporary)) { [System.IO.File]::Delete($temporary) }
    if ([System.IO.File]::Exists($backup)) { [System.IO.File]::Delete($backup) }
    exit 0
  }
  throw 'invalid operation'
} catch {
  exit 1
}`;

function validRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).sort().join(",") !== "clientId,refreshToken,subject") return false;
  return ["clientId", "subject", "refreshToken"].every((key) =>
    typeof value[key] === "string" && value[key].length > 0 && value[key].length <= 20_000 &&
    !/[\u0000-\u001f]/u.test(value[key]));
}

function protectedStoreError() {
  return new Error("Protected ChatGPT credential storage unavailable");
}

function invokePowerShell(executable, request, spawnImpl, timeoutMs) {
  return new Promise((resolvePromise, rejectPromise) => {
    let child;
    try {
      child = spawnImpl(executable, ["-NoProfile", "-NonInteractive", "-Command", DPAPI_SCRIPT],
        { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    } catch { rejectPromise(protectedStoreError()); return; }
    let settled = false;
    let output = "";
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) rejectPromise(protectedStoreError());
      else resolvePromise(output);
    };
    const timer = setTimeout(() => { child.kill(); finish(true); }, timeoutMs);
    child.on("error", () => finish(true));
    child.on("close", (code) => finish(code !== 0));
    child.stdout.on("data", (chunk) => {
      output += chunk.toString("utf8");
      if (Buffer.byteLength(output, "utf8") > MAX_OUTPUT_BYTES) { child.kill(); finish(true); }
    });
    // Never surface PowerShell stderr: it may include a protected value.
    child.stderr.resume();
    child.stdin.on("error", () => finish(true));
    child.stdin.end(JSON.stringify(request), "utf8");
  });
}

export function createProtectedRefreshStore({
  hostId,
  platform = process.platform,
  localAppData = process.env.LOCALAPPDATA,
  systemRoot = process.env.SystemRoot,
  spawnImpl = spawn,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (platform !== "win32" || typeof hostId !== "string" ||
      !/^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(hostId) ||
      !localAppData || !systemRoot ||
      !isAbsolute(localAppData) || !isAbsolute(systemRoot)) return null;
  const hostKey = createHash("sha256").update(hostId).digest("hex").slice(0, 32);
  const filePath = join(resolve(localAppData), "UniversalDiscussionLayer", `chatgpt-refresh-${hostKey}.dpapi`);
  const executable = join(resolve(systemRoot), "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  if (!existsSync(executable)) return null;
  const deadline = Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 30_000
    ? timeoutMs : DEFAULT_TIMEOUT_MS;
  let pending = Promise.resolve();
  const serial = (operation) => {
    const current = pending.then(operation);
    pending = current.catch(() => {});
    return current;
  };
  return {
    read: () => serial(async () => {
      const output = await invokePowerShell(executable, { operation: "read", path: filePath }, spawnImpl, deadline);
      let record;
      try { record = JSON.parse(output); } catch { throw protectedStoreError(); }
      if (record === null) return null;
      if (!validRecord(record) || Buffer.byteLength(output, "utf8") > MAX_RECORD_BYTES) throw protectedStoreError();
      return record;
    }),
    write: (record) => serial(async () => {
      if (!validRecord(record)) throw protectedStoreError();
      const serialized = JSON.stringify(record);
      if (Buffer.byteLength(serialized, "utf8") > MAX_RECORD_BYTES) throw protectedStoreError();
      await invokePowerShell(executable, { operation: "write", path: filePath, record: serialized }, spawnImpl, deadline);
    }),
    clear: () => serial(async () => {
      await invokePowerShell(executable, { operation: "clear", path: filePath }, spawnImpl, deadline);
    }),
  };
}
