import assert from "node:assert/strict";
import childProcess from "node:child_process";
import dns from "node:dns";
import http from "node:http";
import net from "node:net";
import test from "node:test";

const guard = globalThis[Symbol.for("universal-discussion.offline-capability-guard")];

test(
  "restricted harness actively denies sockets, DNS, HTTP, subprocesses, and fetch",
  { skip: guard ? false : "run with npm run test:restricted" },
  () => {
    assert.equal(guard.version, "offline-capability-guard/1.0.0");
    const denied = (error) => error?.code === "OFFLINE_CAPABILITY_DENIED";

    assert.throws(() => net.connect({ host: "127.0.0.1", port: 9 }), denied);
    assert.throws(() => dns.lookup("example.com", () => {}), denied);
    assert.throws(() => http.get("http://127.0.0.1:9"), denied);
    assert.throws(() => childProcess.spawn("node", ["--version"]), denied);
    assert.throws(() => fetch("https://example.com"), denied);
  },
);
