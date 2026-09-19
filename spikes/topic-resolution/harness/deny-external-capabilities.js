import childProcess from "node:child_process";
import dgram from "node:dgram";
import dns from "node:dns";
import dnsPromises from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net";
import tls from "node:tls";

const guardSymbol = Symbol.for("universal-discussion.offline-capability-guard");

function denied(capability) {
  const error = new Error(`Offline test denied ${capability}`);
  error.code = "OFFLINE_CAPABILITY_DENIED";
  throw error;
}

function denyFunction(target, name, capability = name) {
  if (target && typeof target[name] === "function") {
    Object.defineProperty(target, name, {
      configurable: true,
      value: () => denied(capability),
      writable: true,
    });
  }
}

for (const name of [
  "exec",
  "execFile",
  "execFileSync",
  "execSync",
  "fork",
  "spawn",
  "spawnSync",
]) {
  denyFunction(childProcess, name, `subprocess.${name}`);
}

for (const name of [
  "getDefaultResultOrder",
  "getServers",
  "lookup",
  "lookupService",
  "resolve",
  "resolve4",
  "resolve6",
  "resolveAny",
  "resolveCaa",
  "resolveCname",
  "resolveMx",
  "resolveNaptr",
  "resolveNs",
  "resolvePtr",
  "resolveSoa",
  "resolveSrv",
  "resolveTxt",
  "reverse",
  "setDefaultResultOrder",
  "setServers",
]) {
  denyFunction(dns, name, `dns.${name}`);
  denyFunction(dnsPromises, name, `dns.promises.${name}`);
}

for (const name of ["connect", "createConnection", "createServer"]) {
  denyFunction(net, name, `net.${name}`);
}
denyFunction(net.Socket?.prototype, "connect", "net.Socket.connect");

for (const name of ["connect", "createServer"]) {
  denyFunction(tls, name, `tls.${name}`);
}
denyFunction(tls.TLSSocket?.prototype, "connect", "tls.TLSSocket.connect");

denyFunction(dgram, "createSocket", "dgram.createSocket");
for (const module of [http, https]) {
  for (const name of ["get", "request", "createServer"]) {
    denyFunction(module, name, `${module === http ? "http" : "https"}.${name}`);
  }
}

Object.defineProperty(globalThis, "fetch", {
  configurable: true,
  value: () => denied("global.fetch"),
  writable: false,
});
if (typeof globalThis.WebSocket === "function") {
  Object.defineProperty(globalThis, "WebSocket", {
    configurable: true,
    value: class DeniedWebSocket {
      constructor() {
        denied("global.WebSocket");
      }
    },
    writable: false,
  });
}

syncBuiltinESMExports();
Object.defineProperty(globalThis, guardSymbol, {
  configurable: false,
  enumerable: false,
  value: Object.freeze({ version: "offline-capability-guard/1.0.0" }),
  writable: false,
});
