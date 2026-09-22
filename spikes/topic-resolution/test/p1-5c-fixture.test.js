import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const fixturePath = path.join(
  packageDirectory,
  "fixtures",
  "html",
  "p1-5c.html",
);
const serverPath = path.join(
  packageDirectory,
  "harness",
  "serve-p1-5c-fixture.js",
);

test("controlled fixture is synthetic, script-free, and exercises only approved head fields", async () => {
  const html = await readFile(fixturePath, "utf8");
  assert.match(html, /<meta property="og:title"/u);
  assert.match(html, /<meta name="twitter:title"/u);
  assert.match(html, /<meta property="og:description"/u);
  assert.match(html, /<meta name="description"/u);
  assert.match(html, /<meta property="article:published_time"/u);
  assert.match(html, /<meta name="robots" content="index, follow">/u);
  assert.match(html, /<meta name="tdm-reservation" content="0">/u);
  assert.match(
    html,
    /<link rel="canonical" href="http:\/\/127\.0\.0\.1:4173\/p1-5c\.html">/u,
  );
  assert.match(html, /body decoy must never appear/u);
  assert.doesNotMatch(html, /<script\b|<iframe\b|<img\b|<form\b/iu);
  assert.doesNotMatch(
    html.replace('href="http://127.0.0.1:4173/p1-5c.html"', ""),
    /\b(?:src|href)="https?:\/\//iu,
  );
});

test("fixture server binds one loopback address and one exact route with defensive headers", async () => {
  const source = await readFile(serverPath, "utf8");
  assert.match(source, /const ADDRESS = "127\.0\.0\.1";/u);
  assert.match(source, /const PORT = 4_173;/u);
  assert.match(source, /const ROUTE = "\/p1-5c\.html";/u);
  assert.match(source, /request\.headers\.host !== EXPECTED_HOST/u);
  assert.match(source, /request\.url !== ROUTE/u);
  assert.match(source, /\["GET", "HEAD"\]\.includes\(request\.method\)/u);
  assert.match(source, /"Cache-Control": "no-store"/u);
  assert.match(source, /"X-Content-Type-Options": "nosniff"/u);
  assert.match(source, /default-src 'none'/u);
  assert.match(source, /server\.listen\(PORT, ADDRESS/u);
  assert.doesNotMatch(source, /\b(?:fetch|request|get|connect)\s*\(/u);
});
