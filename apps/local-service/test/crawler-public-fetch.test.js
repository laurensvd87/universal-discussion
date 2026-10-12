import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import test from "node:test";
import { brotliCompressSync, deflateSync, gzipSync } from "node:zlib";
import {
  CRAWLER_USER_AGENT,
  PublicFetchError,
  createPublicFetcher,
  isGlobalPublicAddress,
  resolvePublicAddresses
} from "../src/crawler/public-fetch.js";

const PUBLIC_V4 = "93.184.216.34";

function headerPairs(headers) {
  return Object.entries(headers).flatMap(([name, value]) =>
    (Array.isArray(value) ? value : [value]).flatMap(item => [name, item]));
}

function transportFixture({
  body = Buffer.from("<html><main>A sufficiently bounded crawler response.</main></html>"),
  status = 200,
  headers = { "content-type": "text/html; charset=utf-8" },
  headersDistinct = undefined,
  remoteAddress = PUBLIC_V4,
  neverRespond = false
} = {}) {
  const calls = [];
  const requestImpl = (options, onResponse) => {
    calls.push(options);
    const request = new EventEmitter();
    let destroyed = false;
    request.setTimeout = () => request;
    request.destroy = error => {
      if (destroyed) return request;
      destroyed = true;
      if (error) queueMicrotask(() => request.emit("error", error));
      return request;
    };
    request.end = () => {
      if (neverRespond) return;
      options.lookup(options.hostname, { all: false }, (lookupError, address, family) => {
        if (lookupError) { request.destroy(lookupError); return; }
        const socket = new EventEmitter();
        socket.connecting = false;
        socket.remoteAddress = remoteAddress;
        socket.remoteFamily = family === 6 ? "IPv6" : "IPv4";
        request.emit("socket", socket);
        queueMicrotask(() => {
          if (destroyed) return;
          const response = new PassThrough();
          response.statusCode = status;
          response.headers = headers;
          response.headersDistinct = headersDistinct;
          response.rawHeaders = headerPairs(headers);
          response.socket = socket;
          onResponse(response);
          response.end(body);
        });
      });
    };
    return request;
  };
  return { requestImpl, calls };
}

function lookupFixture(records = [{ address: PUBLIC_V4, family: 4 }]) {
  const calls = [];
  return {
    calls,
    dnsLookup: async (hostname, options) => { calls.push({ hostname, options }); return records; }
  };
}

function rejectsCode(code) {
  return error => error instanceof PublicFetchError && error.code === code;
}

test("public address classification refuses private, metadata, documentation, mapped and transition space", () => {
  for (const address of [PUBLIC_V4, "8.8.8.8", "2606:2800:220:1:248:1893:25c8:1946", "2001:4860:4860::8888"])
    assert.equal(isGlobalPublicAddress(address), true, address);
  for (const address of [
    "0.0.0.1", "10.0.0.1", "100.64.0.1", "127.0.0.1", "169.254.169.254", "172.16.0.1",
    "192.0.0.1", "192.0.2.1", "192.168.0.1", "198.18.0.1", "198.51.100.1", "203.0.113.1",
    "168.63.129.16", "224.0.0.1", "240.0.0.1", "255.255.255.255", "::", "::1",
    "::ffff:8.8.8.8", "64:ff9b::808:808", "100::1", "2001::1", "2001:2::1", "2001:db8::1",
    "2001:100::1", "2001:4860:1:2:0:5efe:808:808", "2002:0808:0808::1", "3ffe::1", "3fff::1", "4000::1", "5f00::1", "fc00::1",
    "fe80::1", "fec0::1", "ff02::1"
  ]) assert.equal(isGlobalPublicAddress(address), false, address);
});

test("DNS resolution requests every answer and rejects the whole set if one answer is non-public", async () => {
  const mixed = lookupFixture([{ address: PUBLIC_V4, family: 4 }, { address: "127.0.0.1", family: 4 }]);
  await assert.rejects(resolvePublicAddresses("news.example", mixed), rejectsCode("dns-non-public"));
  assert.deepEqual(mixed.calls, [{ hostname: "news.example", options: { all: true, verbatim: true, family: 0, hints: 0 } }]);

  const safe = lookupFixture([
    { address: PUBLIC_V4, family: 4 },
    { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    { address: PUBLIC_V4, family: 4 }
  ]);
  assert.deepEqual(await resolvePublicAddresses("news.example", safe), [
    { address: PUBLIC_V4, family: 4 },
    { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 }
  ]);
});

test("fetch pins DNS, verifies the peer and sends a fixed credential-free HTTPS GET", async () => {
  const dns = lookupFixture();
  const transport = transportFixture();
  const fetchPublic = createPublicFetcher({ dnsLookup: dns.dnsLookup, requestImpl: transport.requestImpl });
  const result = await fetchPublic("https://news.example/articles/one?q=2#ignored");
  assert.equal(result.kind, "content");
  assert.equal(result.status, 200);
  assert.equal(result.mimeType, "text/html");
  assert.equal(result.charset, "utf-8");
  assert.match(result.text, /bounded crawler/u);
  assert.equal(result.url, "https://news.example/articles/one?q=2");
  assert.equal(result.finalUrl, result.url);
  assert.deepEqual(result.network, { dnsAddresses: [{ address: PUBLIC_V4, family: 4 }],
    selectedAddress: PUBLIC_V4, selectedFamily: 4, remoteAddress: PUBLIC_V4 });

  assert.equal(transport.calls.length, 1);
  const options = transport.calls[0];
  assert.equal(options.protocol, "https:");
  assert.equal(options.hostname, "news.example");
  assert.equal(options.port, 443);
  assert.equal(options.path, "/articles/one?q=2");
  assert.equal(options.method, "GET");
  assert.equal(options.agent, false);
  assert.equal(options.servername, "news.example");
  assert.equal(options.rejectUnauthorized, true);
  assert.equal(options.family, 4);
  assert.equal(options.headers["user-agent"], CRAWLER_USER_AGENT);
  assert.equal(options.headers.accept, "text/html, application/xhtml+xml");
  assert.equal(options.headers.authorization, undefined);
  assert.equal(options.headers.cookie, undefined);
  assert.equal(options.headers.referer, undefined);
  assert.equal(options.headers.origin, undefined);
  assert.equal(options.headers.connection, "close");
});

test("invalid schemes, ports, credentials and IP literals fail before DNS or transport", async () => {
  const dns = lookupFixture();
  const transport = transportFixture();
  const fetchPublic = createPublicFetcher({ dnsLookup: dns.dnsLookup, requestImpl: transport.requestImpl });
  for (const url of [
    "http://news.example/", "https://news.example:444/", "https://user:pass@news.example/",
    "https://127.0.0.1/", "data:text/html,test"
  ]) await assert.rejects(fetchPublic(url), rejectsCode("invalid-url"));
  assert.equal(dns.calls.length, 0);
  assert.equal(transport.calls.length, 0);
});

test("redirects are surfaced without following and only safe HTTPS redirect targets are returned", async () => {
  const dns = lookupFixture();
  const redirect = transportFixture({ status: 302, headers: { location: "https://next.example/new" }, body: Buffer.alloc(0) });
  const fetchPublic = createPublicFetcher({ dnsLookup: dns.dnsLookup, requestImpl: redirect.requestImpl });
  const result = await fetchPublic("https://news.example/old");
  assert.equal(result.kind, "redirect");
  assert.equal(result.resourceKind, "page");
  assert.equal(result.status, 302);
  assert.equal(result.url, "https://news.example/old");
  assert.equal(result.redirectUrl, "https://next.example/new");
  assert.equal(result.network.remoteAddress, PUBLIC_V4);
  assert.equal(redirect.calls.length, 1);

  const fragment = transportFixture({ status: 302, headers: { location: "/new#policy-fragment" }, body: Buffer.alloc(0) });
  const fragmentResult = await createPublicFetcher({ dnsLookup: dns.dnsLookup, requestImpl: fragment.requestImpl })(
    "https://news.example/old");
  assert.equal(fragmentResult.redirectUrl, "https://news.example/new#policy-fragment");

  const downgrade = transportFixture({ status: 301, headers: { location: "http://next.example/" }, body: Buffer.alloc(0) });
  await assert.rejects(createPublicFetcher({ dnsLookup: dns.dnsLookup, requestImpl: downgrade.requestImpl })("https://news.example/"),
    rejectsCode("redirect-location"));
});

test("remote-address rebinding and unsupported response types fail closed", async () => {
  const dns = lookupFixture();
  const rebound = transportFixture({ remoteAddress: "8.8.8.8" });
  await assert.rejects(createPublicFetcher({ dnsLookup: dns.dnsLookup, requestImpl: rebound.requestImpl })("https://news.example/"),
    rejectsCode("remote-address"));

  for (const headers of [
    {},
    { "content-type": "text/plain" },
    { "content-type": "application/json" },
    { "content-type": "application/xml" },
    { "content-type": "text/html", "content-encoding": "gzip, br" },
    { "content-type": "text/html", "content-encoding": "compress" }
  ]) {
    const transport = transportFixture({ headers });
    await assert.rejects(createPublicFetcher({ dnsLookup: dns.dnsLookup, requestImpl: transport.requestImpl })("https://news.example/"),
      error => error instanceof PublicFetchError && ["content-type", "content-encoding"].includes(error.code));
  }
});

test("resource kinds have exact MIME allowlists and do not widen the default page surface", async () => {
  const dns = lookupFixture();
  const robots = transportFixture({ body: Buffer.from("User-agent: *\nDisallow: /private"),
    headers: { "content-type": "text/plain; charset=utf-8" } });
  const fetchRobots = createPublicFetcher({ dnsLookup: dns.dnsLookup, requestImpl: robots.requestImpl });
  const robotsResult = await fetchRobots("https://news.example/robots.txt", { resourceKind: "robots" });
  assert.equal(robotsResult.resourceKind, "robots");
  assert.match(robotsResult.text, /Disallow/u);
  assert.equal(robots.calls[0].headers.accept, "text/plain");
  await assert.rejects(fetchRobots("https://news.example/robots.txt"), rejectsCode("content-type"));

  const tdm = transportFixture({ body: Buffer.from('[{"location":"/","tdm-reservation":1}]'),
    headers: { "content-type": "application/json" } });
  const tdmResult = await createPublicFetcher({ dnsLookup: dns.dnsLookup, requestImpl: tdm.requestImpl })(
    "https://news.example/.well-known/tdmrep.json", { resourceKind: "tdmrep" });
  assert.equal(tdmResult.resourceKind, "tdmrep");
  assert.equal(tdm.calls[0].headers.accept, "application/json");

  const fakeJson = transportFixture({ body: Buffer.from("{}"), headers: { "content-type": "text/html" } });
  await assert.rejects(createPublicFetcher({ dnsLookup: dns.dnsLookup, requestImpl: fakeJson.requestImpl })(
    "https://news.example/.well-known/tdmrep.json", { resourceKind: "tdmrep" }), rejectsCode("content-type"));
});

test("only absent or unambiguous UTF-8 charsets and well-formed UTF-8 bodies are accepted", async () => {
  const dns = lookupFixture();
  for (const contentType of ["text/html; charset=iso-8859-1", "text/html; charset=utf-8; charset=utf8"] ) {
    const transport = transportFixture({ headers: { "content-type": contentType } });
    await assert.rejects(createPublicFetcher({ dnsLookup: dns.dnsLookup, requestImpl: transport.requestImpl })(
      "https://news.example/"), error => error instanceof PublicFetchError &&
        ["character-encoding", "content-type"].includes(error.code));
  }
  const malformed = transportFixture({ body: Buffer.from([0xc3, 0x28]), headers: { "content-type": "text/html" } });
  await assert.rejects(createPublicFetcher({ dnsLookup: dns.dnsLookup, requestImpl: malformed.requestImpl })(
    "https://news.example/"), rejectsCode("character-encoding"));

  const repeated = transportFixture({ headers: { "content-type": "text/html", "x-robots-tag": ["noindex", "nofollow"] },
    headersDistinct: { "x-robots-tag": ["noindex", "nofollow"] } });
  const result = await createPublicFetcher({ dnsLookup: dns.dnsLookup, requestImpl: repeated.requestImpl })("https://news.example/");
  assert.deepEqual(result.headers.xRobotsTag, ["noindex", "nofollow"]);
});

test("gzip is decoded within compressed, decompressed and compression-ratio bounds", async () => {
  const dns = lookupFixture();
  const html = Buffer.from("<html><main>Compact article body.</main></html>");
  const encoded = gzipSync(html);
  const transport = transportFixture({ body: encoded, headers: {
    "content-type": "text/html", "content-encoding": "gzip", "content-length": String(encoded.length)
  } });
  const result = await createPublicFetcher({ dnsLookup: dns.dnsLookup, requestImpl: transport.requestImpl })("https://news.example/");
  assert.equal(result.text, html.toString());
  assert.equal(result.compressedBytes, encoded.length);

  for (const [contentEncoding, encode] of [["br", brotliCompressSync], ["deflate", deflateSync]]) {
    const compressed = encode(html);
    const fixture = transportFixture({ body: compressed,
      headers: { "content-type": "text/html", "content-encoding": contentEncoding } });
    const decoded = await createPublicFetcher({ dnsLookup: dns.dnsLookup, requestImpl: fixture.requestImpl })("https://news.example/");
    assert.equal(decoded.text, html.toString());
  }

  const bombBody = Buffer.from("x".repeat(1_000));
  const bomb = transportFixture({ body: gzipSync(bombBody), headers: { "content-type": "text/html", "content-encoding": "gzip" } });
  const bounded = createPublicFetcher({ dnsLookup: dns.dnsLookup, requestImpl: bomb.requestImpl,
    limits: { maxCompressedBytes: 1_024, maxDecompressedBytes: 1_024, maxCompressionRatio: 4 } });
  await assert.rejects(bounded("https://news.example/"), rejectsCode("compression-ratio"));
});

test("header, body, declared-length, timeout and caller-abort bounds stop requests", async () => {
  const dns = lookupFixture();
  const longHeader = transportFixture({ headers: { "content-type": "text/html", "x-long": "x".repeat(80) } });
  const headerBounded = createPublicFetcher({ dnsLookup: dns.dnsLookup, requestImpl: longHeader.requestImpl,
    limits: { maxHeaderBytes: 64 } });
  await assert.rejects(headerBounded("https://news.example/"), rejectsCode("headers-too-large"));

  const large = transportFixture({ body: Buffer.alloc(65), headers: { "content-type": "text/html" } });
  const bodyBounded = createPublicFetcher({ dnsLookup: dns.dnsLookup, requestImpl: large.requestImpl,
    limits: { maxCompressedBytes: 64, maxDecompressedBytes: 64 } });
  await assert.rejects(bodyBounded("https://news.example/"), rejectsCode("body-too-large"));

  const lied = transportFixture({ body: Buffer.from("short"), headers: { "content-type": "text/html", "content-length": "12" } });
  await assert.rejects(createPublicFetcher({ dnsLookup: dns.dnsLookup, requestImpl: lied.requestImpl })("https://news.example/"),
    rejectsCode("content-length"));

  const hanging = transportFixture({ neverRespond: true });
  await assert.rejects(createPublicFetcher({ dnsLookup: dns.dnsLookup, requestImpl: hanging.requestImpl })(
    "https://news.example/", { timeoutMs: 10 }), rejectsCode("timeout"));

  const controller = new AbortController();
  const aborted = createPublicFetcher({ dnsLookup: dns.dnsLookup, requestImpl: hanging.requestImpl })(
    "https://news.example/", { signal: controller.signal });
  controller.abort();
  await assert.rejects(aborted, rejectsCode("aborted"));
});
