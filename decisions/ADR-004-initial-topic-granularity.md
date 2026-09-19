# ADR-004: Initial editorial topic granularity

Status: Accepted for the Phase 0/1 evaluation scope

Date: 2026-09-19

Owners: Product owner, Lead/orchestrator, Semantic Resolution

Reviewers: Trust and Quality

## Context

Semantic resolution cannot be evaluated until “same topic” has a labelable boundary. A single article is too narrow for syndication and rewrites, while a broad real-world event can combine materially different chronology, outcomes, and discussions. The initial scope is public English-language editorial articles.

## Decision

For the initial corpus, a Topic is one time-bounded, independently reportable atomic factual development. Verbatim/near-verbatim syndication, URL variants, and rewrites centered on that same development share a Topic. A later material correction, outcome, decision, launch, verdict, state change, or continuation receives a separate Topic even when it concerns the same entity and occurs within the same day.

Use 72 hours between publications as an initial review presumption, not merge evidence. Later verbatim syndication can remain in the original Topic; a new material development remains separate inside the window. Title equality, entity overlap, keyword similarity, and publication proximity are insufficient by themselves.

The executable labeling rules and examples are in `spikes/topic-resolution/evaluation/LABEL_SCHEMA.md`.

## Alternatives considered

- One Topic per canonical article: safer against false merges but fragments syndicated and rewritten coverage.
- One Topic per broad underlying event: concentrates discussion but risks merging updates, outcomes, reactions, and recurring stories that readers need to distinguish.
- Untimed semantic clusters: rejected for the initial corpus because continuing news can drift without a reviewable boundary.

## Consequences

- The same development from multiple publishers can share one Discussion.
- Material updates deliberately create a new Topic and Discussion unless a later accepted merge/split policy says otherwise.
- The rule prioritizes avoiding false merges and may create false splits; correction tooling remains required before real users.
- This decision applies only to the initial editorial-article evaluation. Products, papers, videos, durable reference pages, and other content classes require their own policy.
- This ADR does not decide how Topic/Discussion history, redirects, or contributions behave during an operator merge or split.

## Validation / rollback

The Phase 0 pilot must contain the required 24-pair case mix, at least 20% independent secondary review, visible disagreements, and a reproducible deterministic-baseline report. Phase 1 expands this to at least 200 pair decisions across at least 50 clusters with cluster-separated tuning and held-out splits.

Revisit the definition if reviewers cannot apply it consistently, material-update boundaries dominate disagreements, or user research shows that separate update Discussions make a story unusably fragmented. Revision requires a versioned label policy and relabeling impact report; do not silently reinterpret existing gold labels.
