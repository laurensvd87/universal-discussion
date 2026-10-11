import assert from "node:assert/strict";
import test from "node:test";
import { inspectPageUrl, inspectPageNavigationUrl, inspectRetainedSourceDtoUrl, PAGE_CONTENT_LIMITS, PAGE_CONTENT_EXTRACTOR_VERSION } from "../browser/core/page-content-policy.js";

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
  for (const state of ["state", "State", "STATE", "st-ate"]) {
    assert.equal(inspectPageUrl(`https://example.com/articles?code=secret&${state}=nonce`).supported, false);
  }
  assert.equal(inspectPageUrl("https://example.com/articles?code=SKU12").supported, true);
});

test("navigation removes normalized session keys across public sites without relaxing canonical gates", () => {
  for (const host of ["shop.example.com", "news.example.org", "docs.example.net"]) {
    for (const key of ["session", "SESSION", "sessionid", "s-e_s.sion_ID", "sid", "S.I-D", "%73essionid"]) {
      const raw = `https://${host}/articles/public?${key}=opaque&id=42#top`;
      const result = inspectPageNavigationUrl(raw);
      assert.deepEqual(result, {
        supported: true, url: `https://${host}/articles/public?id=42`,
        documentUrl: raw.split("#")[0], origin: `https://${host}`,
      });
      assert.ok(Object.isFrozen(result));
      assert.equal(inspectPageUrl(raw).supported, false);
      assert.equal(inspectRetainedSourceDtoUrl(raw).supported, false);
    }
  }
  assert.equal(inspectPageNavigationUrl("https://example.com/article?sid=eyJhbGciOiJub25lIn0.payload.signature").url,
    "https://example.com/article");
});

test("navigation removes only explicit tracking keys while preserving content parameters and exact encoding", () => {
  const tracking = ["utm_source", "UTM_campaign", "utm_custom", "fbclid", "GCLID", "dclid", "msclkid", "gbraid", "wbraid", "mc_cid", "mc_eid"];
  const functional = "id=first%2fpart&id=second%2Fpart&q=a%20b&variant=blue+green&code=SKU12&key=short&ref=story&utm=content&utm-source=keep&sessionize=keep";
  const raw = `https://EXAMPLE.com:443/products?${tracking.map((key) => `${key}=campaign`).join("&")}&${functional}&sessionid=discard#details`;
  const result = inspectPageNavigationUrl(raw);
  assert.equal(result.supported, true);
  assert.equal(result.url, `https://example.com/products?${functional}`);
  assert.equal(result.documentUrl, new URL(raw.split("#")[0]).toString());
  assert.equal(inspectPageUrl(result.url).supported, true);
  assert.equal(inspectPageUrl("https://example.com/article?utm_source=campaign").url,
    "https://example.com/article?utm_source=campaign");
  assert.equal(inspectPageNavigationUrl("https://example.com/article?sid=discard&?id=1&utm_source=campaign").url,
    "https://example.com/article??id=1");
});

test("navigation retains unchanged functional query serialization and duplicate order", () => {
  for (const query of ["?q=a%20b&id=1&id=2&x=%7e", "?q=a+b&empty=&flag", "?", "?id=1&&id=2&"]) {
    const raw = `https://EXAMPLE.com:443/articles${query}#top`;
    const result = inspectPageNavigationUrl(raw);
    assert.equal(result.supported, true);
    assert.equal(result.url, new URL(raw.split("#")[0]).toString());
    assert.equal(result.documentUrl, result.url);
  }
});

test("navigation witnesses remain distinct even when their canonical Sources match", () => {
  const first = inspectPageNavigationUrl("https://example.com/article?id=1&sid=first&utm_source=alpha#top");
  const second = inspectPageNavigationUrl("https://example.com/article?id=1&sid=second&utm_source=beta#bottom");
  assert.equal(first.url, second.url);
  assert.notEqual(first.documentUrl, second.documentUrl);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(second));
  assert.notEqual(first.url, inspectPageNavigationUrl("https://example.com/article?id=2&sid=first").url);
});

test("navigation rejects secret parameters and tracking JWT values before stripping tracking", () => {
  for (const query of [
    "password=secret", "passwd=secret", "pwd=secret", "token=secret", "access_token=secret",
    "refresh-token=secret", "id.token=secret", "auth=secret", "authorization=secret", "api_key=secret",
    "clientsecret=secret", "secret=secret", "jwt=secret", "signature=secret", "sig=secret",
    "key=verylongsecretvalue", "code=secret&st-ate=nonce", "Code=secret&STATE=nonce",
    "utm_source=eyJhbGciOiJub25lIn0.payload.signature", "fbclid=eyJhbGciOiJub25lIn0.payload.signature",
    "id=eyJhbGciOiJub25lIn0.payload.signature", "%74oken=secret",
  ]) {
    const result = inspectPageNavigationUrl(`https://example.com/article?sid=discard&${query}&utm_campaign=remove`);
    assert.deepEqual(result, { supported: false, reason: "credential-query" }, query);
    assert.ok(Object.isFrozen(result));
  }
});

test("navigation validates original bounds and structure before any removal", () => {
  const query64 = Array.from({ length: 64 }, () => "sid=x").join("&");
  assert.equal(inspectPageNavigationUrl(`https://example.com/article?${query64}`).supported, true);
  for (const raw of [
    null, {}, "", " https://example.com/", "https://example.com/article?sid=x\n",
    `https://example.com/article?sid=${"a".repeat(2048)}`,
    `https://example.com/article?${query64}&utm_source=x`,
    `https://example.com/${"é".repeat(350)}?sid=x`,
    "https://user:password@example.com/article?sid=x", "http://example.com/article?sid=x",
    "https://example.com:8443/article?sid=x", "https://127.0.0.1/article?sid=x",
    "https://printer/article?sid=x", "https://portal.internal/article?sid=x",
    "https://auth.example.com/article?sid=x", "https://mail.example.com/article?sid=x",
    "https://example.com/%61ccount/article?sid=x", "https://example.com/checkout?sid=x",
    "https://example.com/%ZZ?sid=x", "http://127.0.0.1:4173/private?sid=x",
    "http://127.0.0.1:4174/background-fixture/article?sid=x",
  ]) {
    const result = inspectPageNavigationUrl(raw);
    assert.equal(result.supported, false, String(raw));
    assert.deepEqual(Object.keys(result), ["supported", "reason"]);
    assert.ok(Object.isFrozen(result));
  }
  assert.equal(inspectPageNavigationUrl("http://127.0.0.1:4173/background-fixture/article?sid=x&id=1").url,
    "http://127.0.0.1:4173/background-fixture/article?id=1");
});

test("navigation fails closed for literal semicolon credential fields without reinterpreting functional values", () => {
  for (const key of [
    "session", "sessionid", "sid", "SESSION_ID", "s.i-d", "%73id", "si%64", "password", "passwd", "pwd",
    "token", "accessToken", "refresh-token", "id_token", "auth", "authorization", "api.key",
    "clientsecret", "secret", "jwt", "signature", "sig", "key", "code", "state",
  ]) {
    for (const prefix of ["aid=123;label=fixture", "sid=discard", "utm_source=fixture"]) {
      const raw = `https://example.com/article?${prefix};${key}=synthetic`;
      const result = inspectPageNavigationUrl(raw);
      assert.deepEqual(result, { supported: false, reason: "credential-query" }, key);
      assert.ok(Object.isFrozen(result));
    }
  }
  for (const query of [
    "aid=123;label=fixture;variant=blue", "value=public%3Bsid=literal", "value=public%3bsid%3Dliteral",
    "value=public;%2573id=literal", "value=public;sessionize=literal", "value=public;label=fixture",
  ]) {
    const raw = `https://example.com/article?${query}`;
    const result = inspectPageNavigationUrl(raw);
    assert.equal(result.supported, true, query);
    assert.equal(result.url, raw);
    assert.equal(result.documentUrl, raw);
  }
  assert.equal(inspectPageUrl("https://example.com/article?aid=123;sid=synthetic").supported, true);
});
