# Offline topic-resolution spike

This package is a deliberately small, dependency-free experiment for the core
mapping:

`Source -> Topic -> Discussion`

It tests domain behavior before choosing a web framework, browser client,
database, vector store, AI provider, or hosting platform. Runtime modules in
`src/`, `extraction/`, and the browser-neutral indicator core perform no
network, filesystem, or database I/O; the test, evaluation, and verification
tooling reads only local package files.

## Run

From this directory with Node.js 24 or newer:

```sh
npm test
npm run test:restricted
npm run check:secrets
npm run indicator:test
```

The tests use Node's built-in `node:test` runner in non-isolated mode, so the
runner does not need child-process permissions. There is no install step and
the package has no dependencies. The restricted command preloads a process
guard that makes socket, DNS, HTTP, subprocess, global fetch, and WebSocket
attempts throw, then runs the full suite and a guard self-test. This is stronger
than an ordinary passing unit run, though it is still a process-level harness
rather than an operating-system network namespace.

The secret check first exercises every supported detector with an in-memory
synthetic sample, then scans all CSS, HTML, JavaScript, JSON, Markdown, and
checked-in TSV in this package for a small versioned set of high-confidence credential formats. It
reports only pattern names and locations, never matched values. It complements the
no-dependency/no-environment-access checks; it is not a substitute for host
repository secret scanning or incident response. Ignored local review state is
excluded because it may contain owner work and must not affect repository scan
evidence.

The URL property suite covers a deterministic 768-case matrix across schemes,
public host forms, default and non-default ports, encoded paths, query shapes,
and fragments. It checks determinism, idempotence, and security-origin
preservation. Boundary tests also require both input and normalized URLs to fit
the 8,192-byte limit.

## User-invoked browser indicator

`browser/` now contains the separate P1.5b and P1.5c Chromium popup paths.
Load that directory as an unpacked extension or follow its own
`browser/README.md`. Its current manifest requests exactly `activeTab` and
`scripting`, requires Chrome 106+, and has no standing host permission.

On the P1.5b URL action, the adapter projects only the active/current tab ID
and address-bar URL, accepts exactly the queryless `example.com` and
`example.org` demonstration roots after fragment removal, and performs a
bundled exact-normalized-URL Source lookup. A second fresh tab read must match
the same tab ID and normalized URL before rendering.

The browser-neutral contracts separately bind URL-to-Source provenance and the
exact-fingerprint Source-to-Topic mapping, plus Topic, Discussion,
topic-scoped human/agent activity, and freshness. The P1.5a bundled scenarios
remain available. Automated checks and the historical owner-run Chromium
permission/traffic/storage/console/keyboard smoke pass for this exact URL-only
slice; evidence is in `../../research/P1_5B_MANUAL_SMOKE.md`.

On the separate P1.5c metadata action, the adapter accepts only the exact
project loopback fixture and pinned MDN route, injects one packaged collector
into isolated top-level frame 0, and projects only bounded direct-head title,
description, canonical, publication, and supported control metadata. It binds
the result to a Chrome document ID and final active-tab read. It reads no body,
JSON-LD, frame, cookie, storage, authentication, or paywall state and has no
network, logging, telemetry, model, fingerprint, resolver, Topic decision, or
AI capability. Both paths render only with text DOM operations.

The curated and semantic-suggestion paths required by the larger ADR-009 PoC
remain future local work. `scripting` is authorized only for the exact P1.5c
boundary. Stop before broader URLs/fields/selectors, body or WebView extraction,
service egress, persistence, deployment, store submission, or publication.
Those need separate platform-policy, rights, privacy, security, and owner
decisions.

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

Validate the dependency-block split structure separately with:

```sh
npm run validate:split
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
The versioned dry-run split manifest binds the exact pilot and proves that all
pairs stay within four disjoint dependency blocks, but both balanced partitions
are marked `dry-run` and the report is always ineligible as quality evidence.
See `evaluation/CORPUS_SPLIT_CONTRACT.md` for the leakage and future freeze
rules.

The package also contains a deterministic whole-dependency-block bootstrap
engine with synthetic matrix tests. It is not wired to the pilot command: doing
so would create a precise-looking interval from four retrospective blocks, not
held-out semantic evidence.

`evaluation/CORPUS_SCHEMA.md` defines the strict boundary for the future P1.2
set. Generated in-memory tests exercise the exact 200-pair/50-cluster/20%
review boundary, all six required cases, unresolved-disagreement exclusion,
independent adjudication, provenance inventory, bounded hostile inputs, and a
resolved-label projection compatible with dependency-block splitting. No
future corpus data is checked in, and the validator always remains
gate-ineligible on its own.

### Offline owner-review dry run

`evaluation/REVIEW_WORKFLOW_CONTRACT.md` defines the separate workflow that
precedes that corpus. It reads strict TSV metadata, commits an immutable task
digest, deterministically orders opaque review items, and preselects 20% for a
later secondary review before any labels exist. The reviewer sees only the
topic definition plus normalized URL, title, fact summary, and publication time
for each side. Case types, cluster/fingerprint/provenance internals, planned
secondary membership, and prior answers stay out of the presentation.

Try the inventoried six-pair project-created dry run with:

```sh
npm run review:prepare
npm run review:status
npm run review:owner
```

`prepare` creates ignored local state under `review/work/`, prints a digest and
safe summary, then stops. `owner` asks only for same-topic, different-topic, or
uncertain and durably appends each answer before showing the next item.
`status` exposes counts, digests, blockers, and scope but no Source metadata or
rationales. Preparation never overwrites an existing workspace, and there is
intentionally no reset, finalize, corpus-export, split, or evaluation command.

The checked-in task has only six synthetic pairs. It demonstrates mechanics,
not the actual roadmap owner checkpoint, 200-pair/50-cluster corpus, independent
review, provenance gate, held-out split, semantic quality, or automatic joins.
Reviewer identity and timestamps are caller/local declarations, and unkeyed
digests prove consistency rather than authenticity. A local administrator can
fully recompute a replacement history or truncate a valid suffix unless the
result is compared with an independently retained digest. The workflow has no
automatic/general anchor; the completed six-pair run's final digest is now
recorded in version-controlled project evidence as a manual anchor for that
run only. See accepted ADR-007 for that boundary. The
generated-preflight-approved headroom,
acquisition-plan/provenance digests,
precommitted secondary coverage reserve, uncertainty archive, adjudication,
and completion-receipt design is in
`../../plans/P1_2_COLLECTION_AND_COMPLETION.md`; it authorizes no collection.
The first generated-only preflight increment implements immutable
acquisition-plan, provenance-inventory, and completion-task envelopes without
changing the v1 owner workflow. A second pure increment binds a completed v1
primary ledger, records the task-precommitted initial coverage snapshot, and
can append the first ordered synthetic secondary pass through a blinded view.
It preserves uncertainty and disagreement. A generated-only successor journal
now freezes that prefix, adds one bounded synthetic evidence supplement and
same-role rereview for each uncertainty, derives unresolved exclusions, and
continues the initial secondary queue. It stops at the first adjudication need
or initial-resolution completion and deliberately has no adjudication, reserve,
finalization, persistence, or real-independence path; see
`evaluation/REVIEW_COMPLETION_CONTRACT.md`.

An independent read-only reviewer applied both Trust and Quality lenses to
final implementation tree `d3818ab` and issued ACCEPT / ACCEPT for this bounded
synthetic-only workflow. This was one reviewer, not two independent people or
owner acceptance. See `../../research/P1_2A_GATE_REVIEW.md` for reproduction
evidence and accepted residuals.

`evaluation/EVALUATION_POLICY_CONTRACT.md` adds the next pre-result boundary.
It strictly binds a future corpus, resolved projection, split manifest, and
offline candidate artifact to fixed-point join/abstention rules, the normative
quality gate, and a seeded block-bootstrap policy. Generated tests evaluate the
contract only; no receipt or held-out result has been created.

`evaluation/PREDICTION_CONTRACT.md` defines the unevaluated candidate-output
boundary. It requires one sorted retrieval/score record for every declared
held-out pair and transitively binds those records to the policy, split,
dataset, and candidate artifact. It rejects labels and result-like fields and
never thresholds scores or computes metrics. There is no real bundle or CLI.

`evaluation/RESULT_EVALUATOR_CONTRACT.md` exercises thresholding and quality
math only on project-created synthetic Sources. It reports reconciled global,
per-case, and per-block matrices, Wilson intervals, coverage, error queues, and
bootstrap sensitivity. It has no CLI or checked-in report, rejects real-source
provenance, and cannot choose a gate branch.

## Synthetic HTML extraction experiment

`extraction/html-extraction.js` begins P1.3 with a pure in-memory operation over
caller-declared synthetic UTF-8 bytes. It recognizes only an explicit bounded
HTML head, requires one plain title, records an optional canonical link as
non-authoritative metadata, and computes a SHA-256 fingerprint over the exact
input bytes. It does not fetch the observed URL or read the fixture path.

```js
import { extractSyntheticHtml } from "./extraction/html-extraction.js";
import { createTopicResolver } from "./src/index.js";

const output = extractSyntheticHtml({
  fixtureId: "html/harbor-barrier",
  observedUrl: "https://publisher.example.com/city/observed",
  mediaType: "text/html; charset=utf-8",
  htmlBytes,
});

const resolved = createTopicResolver().resolve(output.report.sourceProjection);
```

The parser rejects active/base/unknown head elements, malformed structures,
invalid encodings, behavioral inputs, and explicit resource-limit violations.
The content after `</head>` is opaque to extraction. The normalized observed
URL always remains the Source URL; even an accepted same-origin canonical is a
hint and never a merge signal.

The fingerprint is an exact synthetic document-byte fingerprint, not a
semantic content fingerprint. Line-ending, metadata, or other byte changes
produce a different value. Its `synthetic-fixture` evidence and fixture ID are
caller assertions: the runtime does not verify them against the fixture
manifest. The checked-in fixture is separately inventoried and pinned by its
test. See `EXTRACTION_CONTRACT.md` and proposed ADR-006 for the full grammar,
limits, provenance boundary, and non-claims.

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
domains. The P1.3a extractor now exercises only exact synthetic document bytes;
production observation, attestation, collision policy, semantic equivalence,
and resolver upgrades still need separate design work.

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

Resolver observation and activity inputs use strict field allowlists. Raw
bodies, HTML, prompts, and AI output are rejected instead of stored. The
separate extractor accepts only bounded in-memory synthetic HTML bytes and
returns no raw content.

Out of scope: live fetching, browser APIs, persistence, authentication,
posting, moderation workflows, AI calls, embeddings, probabilistic matching,
and Topic merge/split operations. A Source resolved without a fingerprint is
not silently remapped later; doing so requires the future audited merge/split
model.

This normalizer is fixture-spike code, not the browser eligibility or SSRF
control for a connected client/service. DNS names can resolve to private
addresses, and special-use rules evolve; the connected flow requires the
separate controls and tests in `docs/PHASE_1_THREAT_MODEL.md`.
