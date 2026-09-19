import assert from "node:assert/strict";
import test from "node:test";

import { normalizePublicHttpUrl, ResolutionError } from "../src/index.js";

test("normalizes URL variants and removes only approved tracking parameters", () => {
  const normalized = normalizePublicHttpUrl(
    "HTTPS://Example.COM:443/articles/../story/?b=2&utm_source=newsletter&a=1&FBCLID=abc#comments",
  );

  assert.equal(normalized, "https://example.com/story/?b=2&a=1");
  assert.equal(
    normalizePublicHttpUrl("https://example.com/story/?utm_medium=email&b=2&a=1"),
    normalized,
  );
});

test("preserves retained query order and malformed encoded values", () => {
  assert.notEqual(
    normalizePublicHttpUrl("https://example.com/dispatch?action=preview&action=delete"),
    normalizePublicHttpUrl("https://example.com/dispatch?action=delete&action=preview"),
  );
  assert.notEqual(
    normalizePublicHttpUrl("https://example.com/dispatch?x=%C0"),
    normalizePublicHttpUrl("https://example.com/dispatch?x=%EF%BF%BD"),
  );
});

test("normalizes percent-escape hex case without decoding path or query data", () => {
  assert.equal(
    normalizePublicHttpUrl("https://example.com/%7euser?next=%2fprivate"),
    "https://example.com/%7Euser?next=%2Fprivate",
  );
});

test("normalization is idempotent for representative accepted URLs", () => {
  const candidates = [
    "HTTPS://Example.COM:443/articles/../story/?b=2&utm_source=newsletter&a=1#comments",
    "http://news.example.org:8080/%7eauthor?next=%2fpublic&next=%2Farchive",
    "https://[2606:4700:4700::1111]/path?x=%C0",
  ];

  for (const candidate of candidates) {
    const normalized = normalizePublicHttpUrl(candidate);
    assert.equal(normalizePublicHttpUrl(normalized), normalized);
  }
});

test("normalization is idempotent across bounded query-segment combinations", () => {
  const segments = ["", "a=1", "a=2", "utm_source=test", "fbclid=x", "x=%C0"];

  for (const firstSegment of segments) {
    for (const secondSegment of segments) {
      for (const thirdSegment of segments) {
        const candidate = `https://example.com/story?${[
          firstSegment,
          secondSegment,
          thirdSegment,
        ].join("&")}`;

        let normalized;
        try {
          normalized = normalizePublicHttpUrl(candidate);
        } catch (error) {
          assert.ok(
            error instanceof ResolutionError && error.code === "AMBIGUOUS_QUERY",
            `unexpected failure for ${candidate}: ${error}`,
          );
          continue;
        }

        assert.equal(normalizePublicHttpUrl(normalized), normalized, candidate);
      }
    }
  }
});

test("preserves scheme and non-default port as source-identity boundaries", () => {
  assert.notEqual(
    normalizePublicHttpUrl("http://example.com/story"),
    normalizePublicHttpUrl("https://example.com/story"),
  );
  assert.notEqual(
    normalizePublicHttpUrl("https://example.com/story"),
    normalizePublicHttpUrl("https://example.com:8443/story"),
  );
});

const rejectedUrls = [
  ["not a URL", "INVALID_URL"],
  ["file:///etc/passwd", "UNSUPPORTED_SCHEME"],
  ["ftp://example.com/file", "UNSUPPORTED_SCHEME"],
  ["https://user:secret@example.com/story", "CREDENTIALS_NOT_ALLOWED"],
  ["http://localhost/story", "NON_PUBLIC_HOST"],
  ["http://service.internal/story", "NON_PUBLIC_HOST"],
  ["http://intranet/story", "NON_PUBLIC_HOST"],
  ["http://127.0.0.1/story", "NON_PUBLIC_HOST"],
  ["http://2130706433/story", "NON_PUBLIC_HOST"],
  ["http://10.0.0.8/story", "NON_PUBLIC_HOST"],
  ["http://172.16.0.8/story", "NON_PUBLIC_HOST"],
  ["http://192.168.0.8/story", "NON_PUBLIC_HOST"],
  ["http://169.254.169.254/latest/meta-data", "NON_PUBLIC_HOST"],
  ["http://[::1]/story", "NON_PUBLIC_HOST"],
  ["http://[::ffff:127.0.0.1]/story", "NON_PUBLIC_HOST"],
  ["http://[fd00::1]/story", "NON_PUBLIC_HOST"],
  ["http://[fe80::1]/story", "NON_PUBLIC_HOST"],
  ["http://198.51.100.1/story", "NON_PUBLIC_HOST"],
  ["http://203.0.113.1/story", "NON_PUBLIC_HOST"],
  ["http://[2001:db8::1]/story", "NON_PUBLIC_HOST"],
  ["http://[2001:10::1]/story", "NON_PUBLIC_HOST"],
  ["http://[2001:20::1]/story", "NON_PUBLIC_HOST"],
  ["http://[2002:7f00:1::]/story", "NON_PUBLIC_HOST"],
  ["http://[3ffe::1]/story", "NON_PUBLIC_HOST"],
  ["http://[3fff::1]/story", "NON_PUBLIC_HOST"],
  ["http://example.com./story", "AMBIGUOUS_HOST"],
  ["http://service.onion/story", "NON_PUBLIC_HOST"],
  ["https://example.com/story?", "AMBIGUOUS_QUERY"],
  ["https://example.com/story?utm_source=test&", "AMBIGUOUS_QUERY"],
];

for (const [url, expectedCode] of rejectedUrls) {
  test(`rejects ${url} deterministically`, () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      assert.throws(
        () => normalizePublicHttpUrl(url),
        (error) => error instanceof ResolutionError && error.code === expectedCode,
      );
    }
  });
}

test("allows syntactically public HTTP(S) hosts without resolving DNS", () => {
  assert.equal(normalizePublicHttpUrl("https://Example.COM"), "https://example.com/");
  assert.equal(
    normalizePublicHttpUrl("https://[2606:4700:4700::1111]/path"),
    "https://[2606:4700:4700::1111]/path",
  );
});

test("bounds URL bytes and query segments", () => {
  assert.throws(
    () => normalizePublicHttpUrl(`https://example.com/${"x".repeat(8_192)}`),
    (error) => error instanceof ResolutionError && error.code === "INPUT_TOO_LARGE",
  );

  const query = Array.from({ length: 101 }, (_, index) => `p${index}=1`).join("&");
  assert.throws(
    () => normalizePublicHttpUrl(`https://example.com/?${query}`),
    (error) => error instanceof ResolutionError && error.code === "INPUT_TOO_LARGE",
  );
});
