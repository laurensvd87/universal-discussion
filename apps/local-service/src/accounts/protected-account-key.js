import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, statSync, chmodSync } from "node:fs";
import path from "node:path";

const SCRIPT = String.raw`
$ErrorActionPreference='Stop'
try {
  Add-Type -AssemblyName System.Security
  $r = ConvertFrom-Json ([Console]::In.ReadToEnd())
  $b = [Convert]::FromBase64String($r.value)
  if ($r.operation -eq 'protect') {
    if ($b.Length -ne 32) { throw 'invalid key' }
    $b = [System.Security.Cryptography.ProtectedData]::Protect($b,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser)
  } elseif ($r.operation -eq 'unprotect') {
    if ($b.Length -gt 1024) { throw 'invalid key' }
    $b = [System.Security.Cryptography.ProtectedData]::Unprotect($b,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser)
    if ($b.Length -ne 32) { throw 'invalid key' }
  } else { throw 'invalid operation' }
  [Console]::Out.Write([Convert]::ToBase64String($b))
} catch { exit 1 }
`;
const unavailable = () => new Error("Protected local account key unavailable");
function dpapi(operation, value) {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", SCRIPT],
      { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let output = "", done = false;
    const finish = (error) => { if (done) return; done = true; clearTimeout(timer);
      if (error || !/^[A-Za-z0-9+/]+={0,2}$/u.test(output)) reject(unavailable());
      else resolve(Buffer.from(output, "base64")); };
    const timer = setTimeout(() => { child.kill(); finish(true); }, 5_000);
    child.on("error", () => finish(true)); child.stdin.on("error", () => finish(true));
    child.stdout.on("data", chunk => { output += chunk.toString("utf8"); if (output.length > 2048) { child.kill(); finish(true); } });
    child.stderr.on("data", () => {}); child.on("close", code => finish(code !== 0));
    child.stdin.end(JSON.stringify({ operation, value: value.toString("base64") }));
  });
}

// Local-only HMAC key, never an OAuth credential. No import-time I/O. The
// Windows blob is DPAPI CurrentUser protected; POSIX requires owner-only mode.
export async function loadProtectedAccountKey({ dataDir, platform = process.platform, crypt = dpapi }) {
  const filename = path.join(dataDir, "account-key.protected");
  const decode = async bytes => {
    if (bytes.length > 1024 || bytes.length < 1) throw unavailable();
    if (platform !== "win32" && (statSync(filename).mode & 0o077)) throw unavailable();
    let key;
    try { key = platform === "win32" ? await crypt("unprotect", bytes) : bytes; }
    catch { throw unavailable(); }
    if (!Buffer.isBuffer(key) || key.length !== 32) throw unavailable();
    return key;
  };
  try { return await decode(readFileSync(filename)); }
  catch (error) { if (error.code !== "ENOENT") throw unavailable(); }
  const key = randomBytes(32);
  let encoded;
  try { encoded = platform === "win32" ? await crypt("protect", key) : key; }
  catch { throw unavailable(); }
  if (!Buffer.isBuffer(encoded) || encoded.length > 1024 || !encoded.length) throw unavailable();
  try { writeFileSync(filename, encoded, { flag: "wx", mode: 0o600 });
    if (platform !== "win32") chmodSync(filename, 0o600); }
  catch (error) { if (error.code === "EEXIST") return decode(readFileSync(filename)); throw unavailable(); }
  return key;
}
