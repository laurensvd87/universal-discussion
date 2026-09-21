# P1.2a Offline Owner-Review Workflow Gate Review

Date: 2026-09-21

Final reviewed tree: `d3818abc48cc5e01ae567a5e6b14e04b5e4db7de`

Implementation commits: `935e2bf` and `d3818ab`

Reviewer: independent read-only agent `/root/p12a_code_audit`, applying both
Trust and Quality lenses. This is one reviewer applying two lenses, not two
independent people and not a human owner decision.

## Scope reviewed

The review covered only the synthetic, offline P1.2a increment:

- fatal UTF-8 and exact-schema TSV intake;
- corpus-compatible Source, provenance, scope, and chronology bounds;
- canonical task binding, deterministic opaque ordering, and separately seeded
  pre-label 20% secondary-review selection;
- exact reviewer-presentation allowlisting and inert terminal rendering;
- primary `same-topic` / `different-topic` / `uncertain` event capture;
- digest-chain, task/session binding, append/restart/concurrency behavior, and
  local workspace recovery checks;
- `prepare`, `owner`, and safe `status` CLI behavior;
- fixture inventory, secret scan, capability separation, contract, ADR, threat
  controls, roadmap/status wording, and explicit stop boundaries; and
- final source visibility after replacing literal regex control bytes with
  escaped notation and adding a regression check.

The review did not cover a real/public collection, licensing a future corpus,
secondary review, adjudication, gold-cluster assignment, corpus
materialization, split freeze, held-out evaluation, semantic-model quality,
automatic joins, connected behavior, authentication, or deployment.

## Review provenance and reproduction

The reviewer inspected the shared working tree throughout implementation,
reported findings without editing files, and rechecked the committed final
tree. Final hash verification found `HEAD` and `origin/main` both at
`d3818abc48cc5e01ae567a5e6b14e04b5e4db7de` with a clean worktree.

Final independently reported checks:

- `npm run test:restricted`: **147 / 147 passed**;
- `npm run check:secrets`: **60 files scanned, zero findings, all six detector
  self-tests passed**;
- `git diff 935e2bf d3818ab --check`: clean; and
- `review-tsv.js`: zero NUL bytes, visible escaped control notation, with a
  boundary regression preventing invisible review-module controls.

The orchestrator separately reproduced:

- 25 focused review workflow, workspace, CLI, and capability checks: all pass;
- ordinary full suite: 147 total, 146 pass, one expected restricted-guard
  self-test skip;
- restricted full suite: 147 / 147 pass;
- secret scan: 60 files, zero findings, six detector self-tests;
- unchanged pilot evaluation and structural split dry run: pass; and
- CLI prepare/status/non-interactive-owner smoke: deterministic six-pair task,
  two secondary items preselected, truthful blockers, and zero decisions
  written without an explicit relationship.

## Findings resolved during review

The implementation was revised before acceptance to:

- make all review metadata and synthetic provenance a strict subset of
  `labeled-story-corpus/1.0.0` bounds;
- escape C1 and bidirectional terminal controls;
- make ledger validation linear rather than repeatedly scanning the pair list;
- distinguish the 200-pair threshold from six-case coverage;
- reject Source/task/provenance chronology contradictions;
- require distinct ordering and secondary-selection seeds;
- test wrong-order, replay, backdate, stale-session, reorder, and tamper paths;
- describe reviewer blinding, session binding, and caller declarations without
  overstating them;
- disclose that deleting a valid event suffix is undetectable without an
  external anchor; and
- remove literal C0 bytes from the parser source and require visible escape
  notation in the capability boundary test.

No critical, high, or medium finding remains for the reviewed scope.

## Control summary

| Area | Evidence | Result |
| --- | --- | --- |
| Intake/provenance | Exact UTF-8 TSV grammar, public normalized URLs, frozen corpus bounds, reviewed synthetic manifest | PASS |
| Blinding | Exact view allowlist; no case, cluster, provenance, fingerprint, seed, selection, reviewer, or prior-decision field | PASS |
| Ordering/review plan | Canonical task digest, distinct seeded ranks, pre-label `ceil(20%)` selection | PASS |
| Ledger integrity | Fixed sequence, task/session binding, prior-event digest, exclusive hard-link publication, tamper/replay/concurrency tests | PASS within local residuals |
| Untrusted display | JSON rendering plus C0/DEL/C1/Arabic-letter-mark/bidi escape checks; no provider/tool call | PASS |
| Capability boundary | Pure contract/TSV tier separated from bounded local filesystem/CLI adapters; no network/DNS/subprocess/browser/provider path | PASS |
| Stop boundary | No secondary/adjudicate/finalize/export/split/evaluate command; checkpoint always gate-ineligible | PASS |
| Regression/reproduction | Focused, normal, restricted, scanner, pilot, split, and CLI smoke evidence | PASS |

## Disposition

- **Trust: ACCEPT** for the bounded synthetic-only offline P1.2a increment.
- **Quality: ACCEPT** for the bounded synthetic-only offline P1.2a increment.

This accepts implementation evidence only. ADR-007 remains proposed pending
owner disposition, and the roadmap's real owner checkpoint has not been
reached.

## Accepted residuals and non-claims

- Reviewer identity is caller-declared; no authentication occurs.
- Decision times use the local system clock and are not externally attested.
- Provenance status and Source facts are declarations; this workflow cannot
  prove licensing, authorship, public availability, or absence of personal
  data.
- Blinding is an interface property. Anyone who reads task files or repository
  fixtures can inspect hidden case/provenance/selection internals.
- Exclusive event publication requires same-volume local hard-link support and
  fails closed without it.
- A changed retained event and middle gap are detected, but deleting a valid
  suffix—including all decisions—looks like an earlier valid ledger. Without
  an external last-session anchor it may re-present answered items.
- Local administrators can rewrite or delete state; this is not an
  authenticated append-only audit service.
- The six project-created pairs prove tooling only. They do not satisfy the
  200-pair/50-cluster target, real provenance review, secondary-review,
  adjudication, corpus, held-out, quality, or automatic-join gates.
- No real/public metadata collection, network egress, provider call,
  deployment, spending, or product behavior is authorized by this review.

Any code-bearing change to the reviewed workflow reopens the technical review.
The next implementation may design secondary review, adjudication, cluster
consistency, and corpus materialization, but it must preserve every primary
event and stop at the recorded owner checkpoint before split freeze or held-out
evaluation.
