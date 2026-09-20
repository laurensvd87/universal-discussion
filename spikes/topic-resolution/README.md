# Offline topic-resolution spike

This package is a deliberately small, dependency-free experiment for the core
mapping:

`Source -> Topic -> Discussion`

It tests domain behavior before choosing a web framework, browser client,
database, vector store, AI provider, or hosting platform. The runtime kernel in
`src/` performs no network, filesystem, or database I/O; the test, evaluation,
and verification tooling reads only local package files.

## Run

From this directory with Node.js 24 or newer:

```sh
npm test
npm run test:restricted
npm run check:secrets
```

The tests use Node's built-in `node:test` runner in non-isolated mode, so the
runner does not need child-process permissions. There is no install step and
the package has no dependencies. The restricted command preloads a process
guard that makes socket, DNS, HTTP, subprocess, global fetch, and WebSocket
attempts throw, then runs the full suite and a guard self-test. This is stronger
than an ordinary passing unit run, though it is still a process-level harness
rather than an operating-system network namespace.

The secret check first exercises every supported detector with an in-memory
synthetic sample, then scans all JavaScript, JSON, and Markdown in this package
for a small versioned set of high-confidence credential formats. It reports
only pattern names and locations, never matched values. It complements the
no-dependency/no-environment-access checks; it is not a substitute for host
repository secret scanning or incident response.

The URL property suite covers a deterministic 768-case matrix across schemes,
public host forms, default and non-default ports, encoded paths, query shapes,
and fragments. It checks determinism, idempotence, and security-origin
preservation. Boundary tests also require both input and normalized URLs to fit
the 8,192-byte limit.

## Phase 0 labeling pilot

The `evaluation/` directory contains the owner-approved time-bounded
story-cluster schema and a project-created synthetic pilot: 24 pair decisions
across 20 gold clusters, with the required 8/8/4/4 case mix. An independent
reviewer labeled six blinded cases (25% coverage); both labels are retained and
the current pilot has no disagreements.

Run the schema validation and deterministic exact-signal baseline with:

```sh
npm run evaluate:pilot
```

The expected dry-run matrix is TP=4, FP=0, TN=16, FN=4. The four false
negatives are deliberate rewritten reports without exact URL/fingerprint
evidence. This demonstrates evaluator plumbing and the conservative baseline,
not semantic quality or readiness for automatic joins.

The versioned report also includes two-sided 95% Wilson intervals, binary
coverage/abstentions, automatic-join evidence counts, and offline cost/provider
accounting. The CLI adds environment-dependent in-process timing and runtime
metadata separately from the deterministic evaluator result. On this pilot,
the precision interval's lower bound is about 0.51 despite point precision of
1.0, and only four predicted joins touch four gold clusters. The report marks
the evidence insufficient because it is not held out and is below the
predeclared 60-decision/20-cluster minimum.

Story-cluster bootstrap sensitivity is deliberately not fabricated for this
pilot: it has no cluster-separated tuning/held-out split. That analysis, the
200-pair/50-cluster corpus, and its provenance/review gate remain P1.2 work.

## Contract

```js
import { createTopicResolver } from "./src/index.js";

const resolver = createTopicResolver();
const result = resolver.resolve({
  url: "https://news.example.com/story?utm_source=email",
  title: "Example story",
  contentFingerprint: "sha256:<64 hex digits>",
  fingerprintEvidence: {
    kind: "synthetic-fixture",
    fixtureId: "example-story",
  },
});
```

`resolve` returns immutable `source`, `topic`, `discussion`,
`sourceTopicLink`, and `publicActivity` objects. IDs are deterministic hashes
of normalized keys. Timestamps come from an injectable clock so tests and
audits are reproducible.

`sourceTopicLink.auditedAt` is the mapping-creation time. Resolving an already
known normalized URL returns that immutable mapping rather than pretending a
new audit decision occurred.

Resolution is intentionally conservative:

1. Normalize a syntactically public HTTP(S) URL, removing fragments and a
   small documented set of tracking parameters (`utm_*`, `fbclid`, `gclid`,
   `dclid`, `msclkid`, `mc_cid`, `mc_eid`, `gbraid`, `wbraid`, `_ga`, `_gl`).
   Other query segments and their order are preserved; malformed percent
   encodings are never replacement-decoded.
2. Group different Sources only when their caller-supplied SHA-256 content
   fingerprints match exactly and each observation carries explicit
   `synthetic-fixture` evidence.
3. Without a fingerprint, create a URL-scoped provisional Topic. Titles are
   display metadata and never clustering evidence.
4. Record resolution method, confidence, resolver version, and audit time on
   every `SourceTopicLink`.

The evidence field makes the test boundary auditable; it is an assertion, not
cryptographic attestation or trusted proof suitable for a production/client
boundary. All checked-in fixtures are synthetic and use reserved example
domains. Extraction, attestation, collision policy, and resolver upgrades need
separate design work.

`fixtures/manifest.json` inventories the executable observation and evaluation
fixtures, their project-created synthetic provenance, privacy/secret review,
and minimum-data purpose. This is fixture evidence, not a claim that future
public corpora are licensed or privacy-reviewed.

## Activity counts

The optional constructor `activityRecords` input accepts metadata-only fixture
records selected by an exact synthetic content fingerprint. URL-scoped records
are rejected because a later fingerprint resolution could otherwise detach the
count from its Topic. Only records that are both `public` and moderation-state
`visible` affect counts. Human and AI/agent contributions are reported
separately; private AI and removed contributions never affect public counts.
The resolver keeps only aggregate public counts, not contribution content.

## Safety boundaries and non-goals

The package rejects malformed URLs, non-HTTP(S) schemes, URL credentials,
single-label/local hostnames, and literal local/private network addresses
without performing DNS lookup. This deterministic check is useful but is not
a complete production SSRF defense; a network-capable service would also need
resolution-time and connection-time address enforcement.

Inputs are bounded to 8,192 URL bytes, 100 query segments, 512 UTF-16 code
units for a raw title, and 1,000 activity fixture records. Bare query delimiters
are rejected; retained query order is not changed because duplicate parameter
order can be meaningful. Trailing-dot hostnames are rejected rather than
collapsed across browser origins.

Observation and activity inputs use strict field allowlists. Raw bodies, HTML,
prompts, and AI output are rejected instead of stored.

Out of scope: live fetching, browser APIs, persistence, authentication,
posting, moderation workflows, AI calls, embeddings, probabilistic matching,
and Topic merge/split operations. A Source resolved without a fingerprint is
not silently remapped later; doing so requires the future audited merge/split
model.

This normalizer is fixture-spike code, not the browser eligibility or SSRF
control for a connected client/service. DNS names can resolve to private
addresses, and special-use rules evolve; the connected flow requires the
separate controls and tests in `docs/PHASE_1_THREAT_MODEL.md`.
