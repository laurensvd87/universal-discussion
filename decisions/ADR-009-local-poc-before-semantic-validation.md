# ADR-009: Build the local proof of concept before corpus-scale semantic validation

Status: Accepted for local fixture-driven proof-of-concept sequencing;
connected use and automatic semantic joins remain unauthorized

Date: 2026-09-21

Owners: Lead / Product Orchestrator, Semantic Resolution, Trust, Quality

Owner disposition: the owner directed on 2026-09-21 that this project is a
proof of concept and that semantic-matching logic should be revisited after a
minimal working product makes its usefulness observable. This decision records
that sequencing. It does not waive any later real-data, security, privacy,
provider, deployment, spending, or publication gate.

## Context

The repository can already test deterministic Source-to-Topic resolution and
the mechanics of review, but the six completed owner pairs and other synthetic
labels are project-created/LLM-assisted fixtures. They verify plumbing, not
real-world semantic accuracy. A provenance-approved 200-to-250-pair task with
independent human review would support a defensible automatic-join decision,
but preparing it now would delay learning whether the surrounding product flow
is useful at all.

The roadmap already permits a NO-AUTO branch: deterministic or explicitly
curated mappings can drive the product while semantic candidates abstain or act
only as reviewer suggestions. That branch is sufficient to build a local,
fixture-driven page-to-discussion proof of concept without making a quality
claim or exposing users to silent false merges.

## Decision

Prioritize the shortest fully local proof of concept before corpus-scale
semantic validation.

Until a later P1.4 gate records adequate evidence, use **NO AUTO** as the
runtime policy:

- exact normalized-URL and trusted exact-fingerprint matches may resolve
  automatically within their already accepted offline scope;
- explicitly curated or manually confirmed mappings may choose a Topic and
  Discussion with provenance;
- an experimental semantic candidate may appear only as a local
  developer/reviewer suggestion with its score/evidence and an abstain option;
- a candidate alone must not merge Topics, route users into a shared
  Discussion, or be presented as validated matching; and
- every resolved mapping remains traceable and compatible with later
  correction semantics.

Proceed with local fixture UI, local/mock browser flow, and local integration
work whose dependencies and offline gates are satisfied. Do not manufacture a
P1.4 AUTO or ASSISTED result from synthetic fixtures. Preserve the
provenance-approved 200-to-250-pair review task as a later validation gate. If
that task becomes the next required step for an automatic-join claim or
external test, stop and request the exact acquisition/retention approvals and
give the solo owner a bounded assignment for the independent person needed.

Feedback from a future working product may motivate new cases, thresholds, or
matching logic, but ordinary browsing/use data is not silently converted into
training or evaluation data. Any real-user observation, collection, telemetry,
or tester workflow still needs its recorded privacy/security/owner approvals.

## Alternatives considered

- Require the full human-reviewed corpus before building any product flow:
  rejected for the PoC because it validates matching before testing whether
  the surrounding interaction is useful.
- Enable unvalidated automatic semantic joins and repair mistakes later:
  rejected because a false merge can route people into the wrong discussion
  and contaminate the very feedback intended to evaluate the idea.
- Treat the six synthetic owner decisions as sufficient semantic evidence:
  rejected because fixture generation and labeling share the same synthetic
  assumptions and do not sample ambiguous real-world cases independently.
- Permanently remove human evaluation: rejected. It remains necessary before
  making a reliable automatic-join claim or scaling that behavior.

## Consequences

- Product mechanics and usefulness can be tested locally without waiting for a
  benchmark-scale review task.
- The first PoC may appear less magical because semantic candidates require
  confirmation or abstain; this is an intentional trust boundary.
- Observed failures can inform the later labeled set, but they cannot be counted
  as benchmark evidence unless separately consented, provenance-reviewed,
  frozen, and independently labeled.
- The 200-to-250-pair review is deferred, not completed or cancelled.
- The default branch remains human-only and provider-neutral. No hosted model,
  account, secret, external service, or cash spend is introduced.

## Security/privacy/cost impact

This decision authorizes only local fixture/mock work with external
capabilities denied. It authorizes no browsing-data egress, real URL fetch,
user identity, telemetry, real metadata retention, AI/provider call,
deployment, tester recruitment, announcement, store submission, or purchase.

Suggested matches and Source text remain untrusted input. A later UI must make
the mapping mode and provenance visible, preserve abstention, and prevent a
suggestion from becoming an automatic public routing decision.

## Implementation evidence

The first P1.5a increment implements only the safest leading edge of this
decision: a zero-permission Chromium popup selects bundled synthetic scenarios
and validates resolver-derived exact-fingerprint mappings through a
browser-neutral contract. The view exposes mapping ID/method/evidence, binds
Source, Topic, Discussion, and topic-scoped freshness/counts, preserves
separate human/agent totals, renders hostile text inertly, and fails closed for
unmapped, unsupported, malformed, stale, or superseded results. It has no tab,
page, network, storage, write, AI, or telemetry capability.

This is not the complete local PoC described below. Exact normalized-URL and
curated/confirmed paths, reviewer-only semantic suggestions, real fixture page
observation/extraction, correction behavior, and end-to-end local integration
remain unimplemented or separately gated. No P1.4 evidence or semantic-quality
claim follows from the popup.

## Validation / rollback

The local PoC must test happy, exact-match, curated/confirmed, suggested,
abstain/unmapped, ambiguous, stale-navigation, and malformed cases with
network/DNS denied. Every resulting Topic/Discussion mapping must expose its
method and evidence in testable state, and no test may relabel a suggestion as
an automatic semantic join.

Rollback is a roadmap sequencing change: return P1.2/P1.4 corpus validation to
the critical path before further UI/integration work. No data migration is
required because this decision creates no external data or persisted product
state.
