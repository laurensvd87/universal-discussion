// Separate integration process. The default offline guard is unchanged.
import childProcess from "node:child_process";
import dgram from "node:dgram";
import dns from "node:dns";
import dnsPromises from "node:dns/promises";
import https from "node:https";
import http2 from "node:http2";
import net from "node:net";
import tls from "node:tls";
import { syncBuiltinESMExports } from "node:module";

function denied() {
  const error = new Error("Loopback integration denied an unapproved capability");
  error.code = "LOOPBACK_CAPABILITY_DENIED";
  throw error;
}
function denyMethods(target, names) {
  for (const name of names) {
    if (typeof target?.[name] === "function") Object.defineProperty(target, name, { configurable: true, value: denied, writable: true });
  }
}
denyMethods(childProcess, ["exec", "execFile", "execFileSync", "execSync", "fork", "spawn", "spawnSync"]);
const dnsMethods = ["lookup", "lookupService", "resolve", "resolve4", "resolve6", "resolveAny", "resolveCaa", "resolveCname", "resolveMx", "resolveNaptr", "resolveNs", "resolvePtr", "resolveSoa", "resolveSrv", "resolveTxt", "reverse", "setServers"];
denyMethods(dns, dnsMethods);
denyMethods(dnsPromises, dnsMethods);
denyMethods(dns.Resolver?.prototype, dnsMethods);
denyMethods(dnsPromises.Resolver?.prototype, dnsMethods);
// Node's server.listen invokes dns.lookup even for a numeric IPv4 bind. Resolve
// only the approved literal locally; never invoke the DNS implementation.
dns.lookup = (hostname, options, callback) => {
  if (hostname !== "127.0.0.1") denied();
  const done = typeof options === "function" ? options : callback;
  if (typeof done !== "function") denied();
  process.nextTick(() => options?.all
    ? done(null, [{ address: "127.0.0.1", family: 4 }])
    : done(null, "127.0.0.1", 4));
};
denyMethods(dgram, ["createSocket"]);
denyMethods(https, ["get", "request", "createServer"]);
denyMethods(http2, ["connect", "createServer", "createSecureServer"]);
denyMethods(tls, ["connect", "createServer"]);
denyMethods(tls.TLSSocket?.prototype, ["connect"]);

const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  let options = args[0];
  // Node internally passes normalized [options, callback] arrays.
  if (Array.isArray(options)) options = options[0];
  if (!options || typeof options !== "object" || options.path ||
      (options.host ?? options.hostname) !== "127.0.0.1" || Number(options.port) !== 4174 ||
      (options.localAddress && options.localAddress !== "127.0.0.1")) denied();
  return connect.apply(this, args);
};
const listen = net.Server.prototype.listen;
net.Server.prototype.listen = function (...args) {
  const options = args[0];
  if (!options || typeof options !== "object" || options.path || options.fd !== undefined ||
      options.host !== "127.0.0.1" || options.port !== 4174) denied();
  return listen.apply(this, args);
};
Object.defineProperty(globalThis, "fetch", { configurable: true, value: denied, writable: false });
if (typeof globalThis.WebSocket === "function") {
  Object.defineProperty(globalThis, "WebSocket", {
    configurable: true, value: class { constructor() { denied(); } }, writable: false,
  });
}
syncBuiltinESMExports();
Object.defineProperty(globalThis, Symbol.for("universal-discussion.loopback-capability-guard"), {
  value: Object.freeze({ version: "loopback-capability-guard/1.0.0", host: "127.0.0.1", port: 4174 }),
});
