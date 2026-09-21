# Synthetic HTML extraction contract

Version: `synthetic-html-extraction/1.0.0`

Status: offline P1.3a experiment over caller-declared, project-created
synthetic bytes. It is not a general HTML parser, fixture attestation, or live
page extraction design.

## Purpose and boundary

`extraction/html-extraction.js` provides a dependency-free bridge from a
reviewed local HTML fixture to the existing resolver and to fields that can be
combined with separately reviewed metadata in a complete P1.2 Source record.
It accepts bytes already held by its caller. It never reads a file, fetches a
URL, resolves DNS, uses a browser API, logs content, persists data, or calls a
provider.

The API is:

```js
extractSyntheticHtml({
  fixtureId,
  observedUrl,
  mediaType: "text/html; charset=utf-8",
  htmlBytes,
});
```

The input must be an exact plain data object. `htmlBytes` must be an exact,
fixed, non-shared, whole-buffer `Uint8Array`; accessors, proxies, symbols,
subclasses, named properties, inherited application data, sliced views, and
unknown fields are rejected before parsing. The bytes are cloned before they
are decoded or hashed.

The result contains an immutable `report`, a canonical-JSON SHA-256 digest of
that report, and the digest algorithm. `report.sourceProjection` has exactly
the `url`, `title`, `contentFingerprint`, and `fingerprintEvidence` fields the
offline resolver accepts. Corpus-only truth such as Source ID, gold cluster,
fact summary, publication time, and provenance remains outside the extractor.
HTML therefore cannot manufacture an evaluation label or provenance record.

## Provenance is declared, not attested

`fixtureId` and `fingerprintEvidence.kind: "synthetic-fixture"` are caller
assertions inside this offline experiment. The extractor neither reads
`fixtures/manifest.json` nor proves that supplied bytes match an inventoried
file. Every report consequently states:

```json
{
  "callerDeclaredSynthetic": true,
  "fixtureProvenanceVerified": false
}
```

The checked-in fixture has a separately reviewed inventory entry and a pinned
test fingerprint. That repository evidence does not turn arbitrary calls into
trusted attestations. A production boundary would need a separately designed
manifest/receipt or trusted observation mechanism before exact fingerprints
could be treated as resolver evidence.

## Bounded HTML profile

The parser is an indexed, linear scanner for a deliberately narrow synthetic
fixture grammar:

1. decode the complete input as fatal UTF-8 and reject a UTF-8 BOM or control
   characters outside the allowed HTML whitespace set;
2. require an HTML doctype, a non-self-closing `html` start tag, and a
   non-self-closing `head` start tag;
3. inside `head`, allow bounded comments, exactly one plain `title`, `meta`,
   and `link` start tags with quoted attributes;
4. reject duplicate attributes, head text, mismatched/end tags, and `base`,
   `script`, `style`, `template`, or `noscript` content;
5. require a closing `head`; and
6. treat all content after that closing tag as opaque for extraction.

Tag and attribute names are ASCII-case-insensitive. Extracted title, `rel`, and
canonical `href` values decode exactly one pass of decimal/hex numeric
references plus `amp`, `quot`, `apos`, `lt`, and `gt`. Unsupported or malformed
references fail the title/rel field or reject the canonical candidate. This
single pass prevents double-encoded markup from becoming active metadata.

The title is NFC-normalized, Unicode whitespace is collapsed, surrounding
whitespace is removed, and an empty or oversized result is rejected. It is
display metadata, never an instruction or a similarity signal.

This profile does not implement browser error recovery, DOM construction,
raw-text elements, charset sniffing, readability, or HTML-standard parity.

## Resource limits

| Resource | Limit |
| --- | ---: |
| Complete HTML | 262,144 bytes |
| Parsed head through `</head>` | 65,536 bytes |
| Parsed tags, including relevant end tags | 512 |
| Attributes on one tag | 32 |
| Attributes in the head | 1,024 |
| Comments in the head | 256 |
| One comment | 8,192 UTF-16 code units |
| Tag or attribute name | 64 UTF-16 code units |
| One attribute value | 8,192 UTF-16 code units |
| Raw title | 1,024 UTF-16 code units |
| Normalized title | 256 UTF-16 code units |
| Canonical declarations | 4 |

Every exact boundary and the next unit are exercised by tests. An over-limit
byte array is rejected by its intrinsic byte length before indexed properties
are enumerated.

## Observed URL and canonical evidence

The existing public HTTP(S) normalizer processes `observedUrl`; its normalized
result always becomes `sourceProjection.url`. The extractor never substitutes
page-declared canonical metadata for the observed Source URL.

Zero canonical declarations produce `absent`. Exactly one declaration is
decoded once, resolved only against the normalized observed URL, normalized by
the existing URL policy, and accepted only if its origin exactly matches the
observed origin. Its status is then `same-origin-hint` and its normalized URL is
included as `candidateUrl`. Missing, malformed, credentialed, non-HTTP,
non-public, control-bearing, or unsupported candidates are
`rejected-invalid`; a valid other-origin candidate is
`rejected-cross-origin`. Two through four declarations are `ambiguous` even
when identical. Rejected raw hrefs are never returned or echoed in errors.

Canonical metadata is informational only. It is not copied into the resolver
input and cannot merge Sources or Topics.

## Fingerprint semantics

`contentFingerprint` is `sha256:` plus the lowercase SHA-256 digest of the
exact validated input byte sequence cloned at the boundary. No newline,
Unicode, HTML, title, whitespace, or metadata normalization precedes hashing.
Line-ending, ignored-body, attribute, or single-byte changes therefore change
the fingerprint.

This is an exact synthetic document-byte fingerprint. It intentionally has
high false-negative behavior for syndicated, reformatted, or dynamically
rendered equivalents and makes no semantic-equivalence claim. SHA-256 use here
does not define production collision, attestation, or trust policy.

## Error and disclosure behavior

Failures use `HtmlExtractionError` with stable category codes and bounded,
generic messages. Messages do not include supplied HTML, URL, title, href, or
fixture content. Runtime modules contain no logging capability.
`rawContentRetained: false` means the raw document bytes are neither returned
nor persisted; the normalized title and accepted normalized canonical evidence
are intentionally returned. A rejected canonical retains only its declaration
count and status.

## Explicit non-claims

This increment establishes no live/public-page, copyright, authenticated-page,
browser, SSRF, privacy, or egress safety; no main-content or semantic
fingerprint; no canonical authority; no filesystem or network observation; no
persistence; no P1.2 held-out evidence; no semantic AUTO/ASSISTED branch; and
no product-quality or production-readiness claim.
