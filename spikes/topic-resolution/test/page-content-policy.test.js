import assert from "node:assert/strict";
import test from "node:test";
import { inspectPageUrl, PAGE_CONTENT_LIMITS, PAGE_CONTENT_EXTRACTOR_VERSION } from "../browser/core/page-content-policy.js";

test("eligible public URLs preserve functional queries while removing fragments", () => {
  for (const raw of ["https://www.example.com/articles/sensors?q=public+search&id=product-2#section", "https://EXAMPLE.com:443/products?code=SKU12&variant=blue", "https://news.example.org/story?utm_source=test"]) {
    const result = inspectPageUrl(raw); assert.equal(result.supported, true);
    assert.equal(result.url, new URL(raw.split("#")[0]).toString()); assert.ok(Object.isFrozen(result));
  }
  assert.deepEqual(PAGE_CONTENT_LIMITS, { url: 2048, title: 200, text: 4096 });
  assert.equal(PAGE_CONTENT_EXTRACTOR_VERSION, "main-text-prefix/v1");
});

test("policy rejects credential, local/IP/intranet/internal/sensitive contexts", () => {
  for (const raw of ["chrome://settings/", "file:///C:/private", "http://example.com/", "https://user:password@example.com/",
    "https://127.0.0.1/", "https://[::1]/", "https://2130706433/", "https://0x7f000001/", "https://192.168.0.1/",
    "https://10.1.2.3/", "https://printer/", "https://server.local/", "https://portal.internal/", "https://mail.example.com/",
    "https://example.com/account/overview", "https://example.com/%61ccount/", "https://example.com/articles?access_token=sensitive",
    "https://example.com/articles?api-key=sensitive", "https://example.com/articles?password=sensitive", "https://example.com/auth?code=sensitive&state=csrf",
    "https://example.com/articles?sessionid=sensitive", "https://example.com:8443/articles", "https://private.invalid/article"]) {
    const result = inspectPageUrl(raw); assert.equal(result.supported, false, raw);
    assert.equal(Object.hasOwn(result, "url"), false); assert.equal(Object.hasOwn(result, "origin"), false);
  }
});

test("credential and account host labels are excluded without blocking public articles", () => {
  for (const host of ["passwords", "password", "account", "accounts", "auth", "login", "signin", "sign-in", "sso"]) {
    for (const prefix of ["", "www."]) {
      const result = inspectPageUrl(`https://${prefix}${host}.example.com/articles/public-story`);
      assert.equal(result.supported, false, `${prefix}${host}`);
      assert.equal(result.reason, "unsupported-host");
    }
  }
  for (const raw of [
    "https://www.example.com/articles/account-security-guide",
    "https://passwords-guide.example.com/articles/public-story",
    "https://www.example.com/articles/public-story",
  ]) assert.equal(inspectPageUrl(raw).supported, true, raw);
});

test("owned fixture exception is exact host/port/path without opening arbitrary loopback", () => {
  assert.equal(inspectPageUrl("http://127.0.0.1:4173/background-fixture/article-a.html?id=2#top").supported, true);
  for (const raw of ["http://127.0.0.1:4174/background-fixture/article-a.html", "http://localhost:4173/background-fixture/article-a.html",
    "http://127.0.0.1:4173/p1-5c.html", "http://127.0.0.1:4173/background-fixture/../private.html",
    "http://127.0.0.1:4173/background-fixture/%2fprivate.html"]) assert.equal(inspectPageUrl(raw).supported, false, raw);
});

test("policy bounds URL/query shape and rejects coercion or credential-like JWT values", () => {
  for (const raw of [null, {}, "", " https://example.com/", "https://example.com/\n", `https://example.com/${"a".repeat(2048)}`,
    `https://example.com/?${Array.from({ length: 65 }, (_, id) => `p${id}=value`).join("&")}`,
    "https://example.com/?q=eyJhbGciOiJub25lIn0.payload.signature", "https://example.com/?key=verylongsecretvalue"]) {
    assert.equal(inspectPageUrl(raw).supported, false);
  }
});
