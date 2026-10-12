// Synthetic load check only: forbid even the owner's normal service port4174.
import childProcess from "node:child_process";
import dns from "node:dns";
import dnsPromises from "node:dns/promises";
import dgram from "node:dgram";
import net from "node:net";
import tls from "node:tls";
import https from "node:https";
import http2 from "node:http2";
import { syncBuiltinESMExports } from "node:module";
function denied() { throw new Error("Synthetic concurrency capability denied"); }
function block(target, names) {
  for (const name of names) if (typeof target?.[name] === "function")
    Object.defineProperty(target, name, { configurable: true, writable: true, value: denied });
}
block(childProcess, ["exec", "execFile", "execSync", "execFileSync", "spawn", "spawnSync", "fork"]);
const dnsMethods = ["lookup", "lookupService", "resolve", "resolve4", "resolve6", "resolveAny", "resolveCaa", "resolveCname", "resolveMx", "resolveNaptr", "resolveNs", "resolvePtr", "resolveSoa", "resolveSrv", "resolveTxt", "reverse", "setServers"];
for (const target of [dns, dnsPromises, dns.Resolver?.prototype, dnsPromises.Resolver?.prototype]) block(target, dnsMethods);
dns.lookup = (hostname, options, callback) => {
  if (hostname !== "127.0.0.1") denied();
  const done = typeof options === "function" ? options : callback;
  if (typeof done !== "function") denied();
  process.nextTick(() => options?.all ? done(null, [{ address: "127.0.0.1", family: 4 }]) : done(null, "127.0.0.1", 4));
};
block(dgram, ["createSocket"]); block(https, ["get", "request", "createServer"]);
block(http2, ["connect", "createServer", "createSecureServer"]); block(tls, ["connect", "createServer"]);
block(tls.TLSSocket?.prototype, ["connect"]);
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  let options = args[0]; if (Array.isArray(options)) options = options[0];
  if (!options || typeof options !== "object" || options.path || (options.host ?? options.hostname) !== "127.0.0.1" ||
      Number(options.port) !== 4175 || options.localAddress && options.localAddress !== "127.0.0.1") denied();
  return connect.apply(this, args);
};
const listen = net.Server.prototype.listen;
net.Server.prototype.listen = function (...args) {
  const options = args[0];
  if (!options || typeof options !== "object" || options.path || options.fd !== undefined ||
      options.host !== "127.0.0.1" || options.port !== 4175) denied();
  return listen.apply(this, args);
};
Object.defineProperty(globalThis, "fetch", { configurable: true, writable: false, value: denied });
if (typeof globalThis.WebSocket === "function") Object.defineProperty(globalThis, "WebSocket", {
  configurable: true, writable: false, value: class { constructor() { denied(); } },
});
syncBuiltinESMExports();
