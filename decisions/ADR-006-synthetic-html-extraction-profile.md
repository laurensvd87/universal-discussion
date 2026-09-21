# ADR-006: Use a bounded synthetic HTML profile for the first extraction spike

Status: Proposed; offline implementation has Trust/Quality ACCEPT, owner
acceptance remains required

Date: 2026-09-20

Owners: Platform and Client, Semantic Resolution, Trust, Quality

## Context

P1.1 accepts a resolver observation but deliberately does not say how a page
becomes that observation. P1.3 needs the smallest reproducible experiment that
can extract a title, record non-authoritative canonical metadata, and compute a
versioned fingerprint without authorizing live browsing, page egress, copied
article collection, or a production parsing dependency.

HTML is adversarial input. Browser error recovery, active/raw-text elements,
encoding sniffing, base-URL mutation, duplicate attributes, entity decoding,
and unbounded structures make a partial general parser easy to misdescribe.
Canonical links are publisher assertions and cannot safely become automatic
Source or Topic identity.

The existing resolver also treats `synthetic-fixture` fingerprint evidence as
a caller assertion, not attestation. Extraction must not silently strengthen
that claim or let page content create gold labels and provenance.

## Decision

For P1.3a, implement a dependency-free, in-memory extractor for a narrow,
fail-closed synthetic HTML profile under
`spikes/topic-resolution/extraction/`. Keep it outside the frozen P1.1 `src/`
kernel while including it in the same static and restricted capability checks.

The profile requires fatal UTF-8, an explicit doctype/html/head structure,
exactly one plain title, bounded comments and quoted attributes, and an
explicit closing head. It permits only `title`, `meta`, and `link` within that
head and rejects base/active/raw-text or unknown head elements. Content after
the head is opaque to extraction. Resource limits are part of the versioned
contract and must accept the exact boundary and reject the next unit.

Normalize the observed HTTP(S) URL through the existing conservative URL
policy and always preserve that observed URL as the Source URL. Treat one
valid, same-origin canonical declaration only as a normalized hint. Missing,
invalid, cross-origin, duplicate, and conflicting candidates receive explicit
statuses; no canonical candidate can replace an observed URL or become a
resolver merge key.

Compute an exact SHA-256 fingerprint over the original validated byte sequence
with no HTML or text normalization. Name it an exact synthetic document-byte
fingerprint, not a semantic content fingerprint. Record parser, fingerprint,
and contract versions plus a canonical digest of the extraction report.

Emit a resolver-compatible Source projection, but keep Source ID, cluster
label, fact summary, publication time, and provenance outside extraction. Mark
fixture identity and synthetic status as caller-declared and explicitly state
that fixture provenance was not verified. The checked-in manifest and pinned
fixture test are repository review evidence, not runtime attestation.

The extractor accepts only bytes supplied in memory and has no filesystem,
network, DNS, process, browser, logging, persistence, secret, or provider
capability.

## Alternatives considered

- Use a standards-complete third-party HTML parser immediately: deferred. It
  would be the safer basis for general web compatibility, but selecting and
  reviewing a dependency is unnecessary for a single controlled synthetic
  grammar and would still not solve provenance, live-fetch, or fingerprint
  trust.
- Parse with regular expressions: rejected because quoting, comments,
  boundaries, and nested markup need explicit state and predictable failure.
- Use a browser DOM: rejected because it introduces browser error recovery,
  origin/navigation behavior, permissions, and a much larger capability
  boundary before the browser slice is approved.
- Use canonical URL as Source identity: rejected because it is untrusted,
  sometimes absent or conflicting, and can join unrelated coverage.
- Normalize HTML or hash extracted text: deferred because normalization can
  create hidden equivalence and collision classes that require labeled
  evaluation. Exact bytes are conservative and reproducible.
- Bind runtime output to a compiled fixture allowlist: deferred. It would make
  this test helper less useful for generated adversarial inputs and would not
  define production observation trust. A later trusted receipt design must
  solve that boundary explicitly.

## Consequences

- One reviewed local fixture can now produce deterministic resolver fields
  that also integrate into a separately completed P1.2 Source record, without
  any connected behavior.
- Exact byte identity allows only conservative synthetic joins. Harmless
  reformatting, line-ending changes, and equivalent syndication split by
  design.
- The custom profile is intentionally incompatible with much valid real-world
  HTML and may reject browser-accepted documents. It must never be advertised
  as browser DOM parity or reused for live pages without a new decision.
- Same-origin canonical metadata remains visible for later research while
  having no authority in current resolution.
- Caller-declared fixture evidence preserves the known P1.1 trust gap rather
  than hiding it. Production fingerprints still require a trusted observation
  and attestation design.

## Security/privacy/cost impact

Inputs, outputs, parser work, and collection sizes are bounded. Proxies,
accessors, inherited behavior, non-owned byte views, shared/resizable buffers,
invalid UTF-8, controls, active head elements, duplicate attributes, malformed
entities, and oversized structures fail closed. Raw HTML and rejected hrefs do
not enter reports or logs. Static checks and the restricted process harness
deny connected or process capabilities.

The checked-in HTML is project-created synthetic text on reserved example
domains and is inventoried for copied text, personal data, private URLs,
secrets, and minimum-data use. There is no cash spend or provider account.

This does not address copyright/privacy review for public pages, DNS rebinding,
authenticated content, browser permissions, logging/retention, or client
egress. Those remain separate stop gates.

## Validation / rollback

Acceptance evidence must include deterministic pinned fixture output;
resolver and corpus-schema integration; exact-byte sensitivity; one-pass
entity behavior; canonical absent/accepted/rejected/ambiguous cases; deceptive
comments/meta/body content; malformed and active head rejection; exact limits;
hostile object/typed-array/proxy inputs; generic non-echoing errors; the static
capability audit; the network-denied full suite; fixture inventory; secret
scan; and independent Trust/Quality review.

One independent read-only reviewer applied both Trust and Quality lenses and
issued ACCEPT / ACCEPT for this bounded offline implementation on 2026-09-21;
this was one reviewer, not two independent people. Owner acceptance is still
unrecorded, so this ADR remains a proposal and the code remains an offline
experiment. The review record is `research/P1_3A_GATE_REVIEW.md`. Rollback is
deletion of the isolated extraction module, fixture, tests, contract, and
manifest entry; there is no external state or migration.
