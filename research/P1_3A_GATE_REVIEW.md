# P1.3a synthetic HTML extraction gate review

Date: 2026-09-21

Reviewed code commit: `bef972d`

Reviewer provenance: one independent, read-only reviewer task
`p13a_final_review`, commissioned by the Lead/orchestrator. The same reviewer
applied the Trust and Quality lenses and issued two role-specific dispositions;
this was not two independent people. A separate earlier implementation audit
reported parser, input-preflight, resource-bound, and provenance-claim issues,
which were corrected before `bef972d`. The Lead reconciled and recorded the
outcome but did not perform the independent final review.

## Scope

The review covers the bounded extractor, synthetic fixture, manifest, tests,
capability audit, secret scanner, contract, ADR, threat-model updates, package
documentation, and plan/status reconciliation at `bef972d`. It covers only
in-memory caller-declared synthetic HTML and exact document-byte fingerprints.
It does not cover live pages, browser observation, general HTML, production
fingerprint trust, or the owner acceptance of proposed ADR-006.

The user's P1.2 review-queue and owner-checkpoint roadmap refinement is present
in the reviewed commit and was checked for consistency, but it is not evidence
for this extraction gate.

## Increment A3 matrix

| Control | Result | Principal evidence |
| --- | --- | --- |
| A-EXTRACT-01 | PASS | Fatal UTF-8, explicit head structure, case/quoting, one-pass entities, malformed/active/base rejection, unclosed-head rejection, and deceptive comment/meta/body cases pass. |
| A-BOUND-01 | PASS | Exact and next-unit tests cover HTML/head bytes, tags, attributes, comments, names, values, titles, canonical declarations, and fixture IDs; a 4 MiB input rejects before indexed-key enumeration. |
| A-FP-01 | PASS | The 580-byte LF fixture has pinned SHA-256 `d7e467751f52579c2019088f221d3db0004d2a519daeb609e1b60091064fda9f`; byte, line-ending, and ignored-metadata changes produce distinct fingerprints. |
| A-CANON-01 | PASS | Absent, accepted same-origin, invalid/private/credentialed/non-HTTP, cross-origin, and ambiguous cases pass; observed URL remains Source identity and canonical hints alone never join Topics. |
| A-INPUT-01 | PASS | Accessor, proxy, inherited, symbol, subclass, shared, resizable, decorated-buffer, fake-brand, sliced-view, invalid media/URL, and empty-byte cases reject without executing traps or echoing hostile values. |
| A-CAP-01 | PASS | The static audit closes over the exact six-file transitive runtime set and rejects unaudited relative imports, network/filesystem/process/logging/dynamic-code capabilities; the restricted suite passes. |
| A-PROV-01 | PASS | Manifest inventories the minimum project-created fixture and the test pins its bytes; reports explicitly mark fixture provenance unverified and synthetic identity caller-declared. |

Result: **7 PASS / 0 PARTIAL / 0 FAIL**.

## Reproduction evidence

Environment: Node 24.19.0.

- Focused restricted extraction/boundary suite: 12/12 pass.
- `npm run test:restricted`: 125/125 pass, including the active guard self-test.
- `npm test`: 124 pass, one expected guard-only skip, zero failures.
- `npm run check:secrets`: 49 files scanned, six detectors self-tested, zero findings.
- `npm run evaluate:pilot`: pass; still retrospective, non-held-out evaluator plumbing only.
- `npm run validate:split`: pass; still a dry run with no held-out partition.
- JavaScript syntax: 36 files pass; JSON parsing: four files pass.
- `git diff --check` and `git show --check bef972d`: pass, apart from expected local autocrlf notices before commit.

## Dispositions

Trust: **ACCEPT — bounded offline P1.3a only.** The profile is deterministic,
bounded, fail-closed for its declared grammar, non-authoritative about canonical
metadata, explicit about unverified provenance, and has no connected or logging
capability in its audited runtime graph.

Quality: **ACCEPT — P1.3a at `bef972d`.** The documented focused and full
commands reproduce the fixture, integration, adversarial, resource, isolation,
provenance, and exact-byte checks with no failure.

The Lead records these dispositions as completion of the technical review for
this narrow increment. ADR-006 remains Proposed until owner disposition, and
the broader P1.3 task remains in progress.

## Accepted residuals and exclusions

- `fixtureId` and `synthetic-fixture` evidence are caller assertions, not a
  manifest-bound receipt or attestation. Consumers must not detach the Source
  projection from the report's `fixtureProvenanceVerified: false` scope.
- The custom profile is synthetic-only and intentionally lacks browser DOM
  parity, error recovery, charset sniffing, main-content extraction, and
  general-page compatibility.
- Exact bytes conservatively split harmlessly reformatted, dynamically
  rendered, translated, rewritten, or syndicated equivalents; no semantic
  equivalence or collision policy is established.
- Capability denial is process-level rather than an OS network namespace, and
  exact-object metadata enumeration is suitable only for this bounded local
  in-memory boundary, not arbitrary remote deserialization.
- Raw document bytes are neither returned nor persisted, but the normalized
  title and accepted normalized canonical hint are intentionally returned.
- No live fetch, DNS decision, browser permission, public-page copyright or
  privacy review, production observation, persistence, semantic quality,
  automatic-join branch, provider, deployment, or spending is authorized.

New parser behavior, fixtures, trusted-receipt semantics, live inputs, or a
change to the audited runtime graph reopens Trust and Quality review.
