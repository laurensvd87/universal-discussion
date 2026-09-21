# Generated Review-Completion Preflight Contract

Versioned implementation boundary:

- `story-acquisition-plan/1.0.0`
- `story-source-provenance-inventory/1.0.0`
- `story-review-completion-task/1.0.0`

Status: the immutable pre-review artifact chain is implemented for generated
fixtures only. Completion journals, secondary/adjudication interfaces, cluster
projection, corpus materialization, completion receipts, and downstream
receipt-bound wrappers remain unimplemented.

Owner authorization: P1.2b-1 generated-fixture preflight only. Real/public
metadata acquisition and real review activity remain unauthorized.

## Purpose

The accepted v1 owner workflow proves primary-review mechanics but contains
only declaration-level provenance and an exact 20% preselection. It must not be
repurposed as a real benchmark by supplying more rows. This preflight adds a
strict immutable chain before any later completion logic:

```text
generated acquisition-plan envelope
        -> generated provenance-inventory envelope
        -> accepted v1 primary-task envelope
        -> generated completion-task envelope
```

Every arrow is checked by exact canonical SHA-256 bindings. The implementation
is a pure in-memory contract with no filesystem, process, network, DNS,
browser, provider, credential, or AI capability.

## Acquisition plan

The acquisition-plan envelope is:

```text
{ digestAlgorithm, acquisitionPlanDigest, acquisitionPlan }
```

The plan records:

- the generated-only decision reference, scope-decision digest, and explicit
  caller-declared owner/Trust actors and acceptance times;
- four distinct caller-declared `synthetic-fixture-role` identities for
  primary, secondary, adjudication, and provenance;
- exactly one opaque acquisition stratum per candidate Source;
- exact pair endpoints, hidden case quota, and positive-construction flag;
- derived Source, pair, stratum, positive, and per-case counts; and
- a committed coverage nonce plus fixed 30% initial and 20% eligible coverage
  fractions.

Assignments are sorted before hashing. All six case-count fields are present,
including zeroes. Positive-construction flags are permitted only for duplicate
and syndication cases, and their endpoints must share a planning stratum.
Strata are collection-planning inputs, not gold clusters or relationship
labels.

This contract derives and verifies counts; it does not claim that a small
generated fixture meets the later 250-pair/60-stratum preparation target.

## Provenance inventory

The provenance-inventory envelope is:

```text
{ digestAlgorithm, provenanceInventoryDigest, provenanceInventory }
```

It binds the acquisition-plan digest and contains exactly one record for every
planned Source, including `accepted`, `rejected`, and `pending` dispositions.
This implementation permits only project-created metadata on normalized,
query-free reserved example domains. Each record fixes:

- the exact owner-visible Source projection—ID, URL, title, fact summary,
  publication time, and provenance—and its canonical digest;
- `project-created` rights and a null external origin/evidence URL;
- the exact retained metadata field allowlist;
- no copied article text, no personal data, repository approval, and
  minimum-data necessity declarations;
- a deterministic digest of the declaration record and exact Source
  projection;
- a caller-declared binding to the checked fixture-manifest version/digest,
  explicitly without runtime file verification;
- capture/review chronology; and
- the committed synthetic provenance reviewer and bounded rationale.

The declaration-record assurance is
`caller-declared-project-created-not-externally-verified`; it is not provenance
proof. Public availability, a URL, a self-hash, or a global `accepted` string
cannot satisfy a real inventory. Supporting real metadata requires a
separately approved successor contract and exact rights/privacy evidence; it is
intentionally rejected here.

## Completion task

The completion-task envelope is:

```text
{ digestAlgorithm, completionTaskDigest, completionTask }
```

It embeds and revalidates the unchanged `story-review-task/1.0.0` envelope,
then binds:

- the acquisition-plan digest;
- the provenance-inventory digest; and
- the primary-task digest.

Every accepted owner-visible Source field, pair ID/endpoint/case type, the
three v1 reviewer IDs, and the accepted provenance reviewer must agree across
the artifacts. Rejected and pending Sources and their affected pairs remain in
an auditable selection/exclusion projection and cannot enter the task. The
required chronology is publication <= evidence capture <= record review <=
inventory creation <= global provenance acceptance <= task preparation. Every
Source must still have safe project-created synthetic provenance.

The full secondary coverage priority is derived by domain-separated canonical
hash ranking over the plan digest, committed nonce, and pair ID. The first
`ceil(pairCount * 300000 / 1000000)` IDs form the initial coverage set; every
remaining ID is retained in rank order as the reserve. This supersedes neither
the v1 file nor its local owner interface. Later activation must be recorded by
the not-yet-implemented completion journal.

The completion-task scope explicitly reports all of the following as false:

- independent human review verified;
- owner checkpoint reached;
- primary, secondary, or adjudication completion;
- corpus materialization;
- held-out or split-frozen state;
- evaluation or gate eligibility; and
- real-metadata authorization.

## Solo-builder and identity boundary

The owner currently develops the project alone. Different strings used by one
person are not independent reviewers. Therefore this increment requires every
exercised role to identify itself as a synthetic fixture role and reports
`independentHumanReviewVerified: false`.

These identities validate schema and separation mechanics only. They are not
human labels, AI labels, Trust approval, adjudication, or evidence that the
future 20% independent-review requirement has been met. Human and AI roles in
any successor must remain explicitly typed and provenance-distinct.

## Safety and validation

All three contracts reject unknown fields, inherited or accessor-bearing data,
sparse arrays, cycles, unsupported values, oversized structures, malformed
identifiers/digests/timestamps, duplicate IDs/pairs, unsafe URLs, reviewer
collisions, false target counts, digest rebinding, and cross-artifact drift.

Run the focused checks with:

```powershell
node --test --test-isolation=none test/boundary.test.js test/review-completion-task.test.js
```

The full ordinary and restricted suites plus the local secret scanner remain
required before this increment can pass its technical gate.

## Still open

This increment does not provide a CLI or write any artifact. It does not add:

- append-only coverage activation, secondary, re-review, or adjudication;
- uncertainty supplements or projected-decision chronology;
- fixed-point reserve activation;
- exclusions, gold-cluster consistency, or corpus projection;
- a review archive or completion receipt; or
- receipt-bound split or evaluation-policy successor wrappers.

Those are subsequent generated-only P1.2b-1 increments. Real collection and
review remain separately gated by the accepted plan.
