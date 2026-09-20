# P1.1 offline resolution gate review

Date: 2026-09-20

Reviewed code commit: `d33f010`

Reviewer provenance: one independent, read-only reviewer task
`p11_gate_audit_v2`, commissioned by the Lead/orchestrator. The same reviewer
applied the Trust and Quality lenses and issued two role-specific dispositions;
this was not two independent people. The Lead reconciled and recorded the gate
outcome but did not perform the independent review.

## Scope

The review covers `spikes/topic-resolution/` source, tests, harnesses, fixtures,
evaluator, and package metadata at `d33f010`. It covers only the deterministic,
dependency-free, synthetic-fixture, offline P1.1 kernel. Documentation changes
after that commit do not alter the reviewed code.

## Increment A1 matrix

| Control | Result | Principal evidence |
| --- | --- | --- |
| A-NET-01 | PASS | Restricted full-suite process guard denies sockets, DNS, HTTP(S), subprocess, fetch, and WebSocket; static capability audit and zero dependencies pass. |
| A-DATA-01 | PASS | Checked manifest inventories both project-created synthetic fixture corpora and asserts no copied text, personal data, private URL, or secret. |
| A-PARSE-01 | PASS | Empty, malformed, exact/+1 size, 512-level nested/cyclic, accessor, mixed-encoding, confusable, hostile-title, and duplicate cases pass without unintended traversal or state mutation. |
| A-URL-01 | PASS | Scheme, credentials, fragment, ports, case, percent encoding, internationalized names, tracking keys, and meaningful/duplicate query order are table-tested. |
| A-URL-02 | PASS | 216 bounded query combinations plus a 768-case scheme/host/port/path/query/fragment matrix prove tested-case determinism, idempotence, and origin preservation. |
| A-RESOLVE-01 | PASS | Every link carries source/topic IDs, method, confidence, resolver version, audit time, and immutable evidence. |
| A-RESOLVE-02 | PASS | Title-only and conflicting evidence fail separate; rejected conflicts do not mutate prior state. |
| A-SECRET-01 | PASS | Six detectors self-test before a 21-file package scan with zero findings; kernel has no secret, environment, provider, or paid-service dependency. |

Result: **8 PASS / 0 PARTIAL / 0 FAIL**.

## Reproduction evidence

Environment: Node 24.19.0 and npm 12.0.2.

- `npm run test:restricted`: 70/70 pass, including the active guard self-test.
- `npm test`: 69 pass, one expected guard-only skip, zero failures.
- `npm run check:secrets`: 21 files scanned, six detectors self-tested, zero findings.
- `npm run evaluate:pilot`: TP=4, FP=0, TN=16, FN=4; evaluation plumbing only.
- JavaScript syntax, JSON parsing, and `git show --check d33f010`: pass.
- The reviewed tree carried resolver marker `topic-resolution-spike/1.0.1`.

## Dispositions

Trust: **ACCEPT — offline P1.1 only.** The fixture-only kernel stays inside the
reviewed local boundary, rejects ambiguity conservatively, and has auditable,
versioned outputs plus enforced process-level capability denial.

Quality: **ACCEPT — P1.1 at `d33f010`.** The documented commands reproduce the
contract, boundary, property, isolation, provenance, and evaluator checks.

The Lead accepts these dispositions and marks P1.1 complete only at the reviewed
code revision.

## Accepted residuals and exclusions

- Capability denial is process-level, not an OS network namespace or second-OS
  CI matrix.
- Secret scanning is package-local and high-confidence-pattern based, not host
  scanning or incident response.
- `synthetic-fixture` evidence is a caller assertion, not production extraction
  attestation; fingerprint collision and extraction trust remain undesigned.
- Syntactic public-host filtering makes no DNS query and is not production
  SSRF/rebinding protection.
- Finite deterministic matrices do not prove every Unicode, parser, or future
  runtime behavior.
- Fixture provenance acceptance covers only the current project-created
  synthetic corpora and inline synthetic vectors.
- A-EVAL-01/P1.2/P1.4, semantic quality, automatic joins, merge/split execution,
  rendering/prompt safety, every browser/service B control, real data,
  persistence, identity, public writes, providers, deployment, and spending are
  outside this acceptance.

Any code-bearing change to the reviewed package reopens Trust and Quality
review. New fixtures require their own provenance check even if code is
unchanged.
