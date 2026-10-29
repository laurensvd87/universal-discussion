# ADR-228: Automatic named subjects and news events from browsing

Date:2026-10-29

Status: Implementation direction. Bounded pure proposal prototype and first real
development diagnostic implemented; dynamic registry, publication metadata,
prospective validation and live integration remain open. No new SQL migration,
index, public topic or assignment is activated by this ADR.

The owner explicitly requires topics to emerge from visited pages, including
events that did not exist before. Their names must tell a person what they are
commenting on. The live fixed20-node classifier solves fast conservative routing
into known subjects; it cannot discover/name every new subject or news event.
Permanent manual approval/training for every new event cannot be the growth path.

## Evidence changing the design

The subsequent [real hard-case comparison](../apps/local-service/experiments/automatic-topic-discovery-v1/RESULTS.md)
changes the interpretation of the initial success below. Across22 declared
articles,12 usable/10 unavailable, paired E5 complete-link and centroid each
produce4 correct and17 wrong event pairs; connected components produce62 wrong
pairs. Title-only preserves one true pair and misses three. A separately pinned
compact multilingual paraphrase encoder also leaves false/missed event pairs;
headline+lead0.7 gives3 true/1 false/1 missed on this DEV cohort. No tested
geometry-only policy is accepted for specific event publication.

Broad named subjects and specific events need different evidence. E5 can retrieve
neighbors quickly while a bounded focus/context check decides whether the common
scope supports an event or only a broader subject. A medoid event headline is not
an adequate name for a cluster of that person's different achievements/profile.
Publication constraints must not equate publication and event time: one same-event
report arrives17days later; one updated profile has an old publication date.
Continue registry work with this distinction; do not ship the initial0.90 rule,
lower thresholds after looking at final TEST or silently install the new encoder.

The first ten declared DEV articles yielded four usable observations and six
retained policy/access/extraction refusals. Without predefined child names, the
bounded paired-E5 prototype grouped the two physics-announcement articles and
the two chemistry-announcement articles separately: two correct candidate pairs,
zero cross-event pairs, zero missed true pairs. This is four correlated DEV
documents, not fresh final validation, representative precision or approval for
production. Publisher/search subject review is Root-only.

All four real articles received **no accepted root** from the installed classifier.
Consequently, discovery must also process unresolved material; a hard requirement
to accept an existing root would prevent useful novel topics from being found.
Do not weaken the existing classifier thresholds to hide this coverage failure.

The Source contract currently retains title/body embeddings and no publication
date. Visit recency is not event/publication time. The event prototype therefore
keeps all four event candidates provisional. Manually annotated gold dates were
never passed into its inputs. Its automatically selected titles initially kept a
generic congratulations headline; equal-medoid ties now prefer a title containing
an explicit year. This improves context, not publication-date provenance.

Receipts are `data/automatic-topic-development-{capture,additional-capture,
features}-20261029/result.json` and the Root audit. Exact first feature result:
`897a4d450ab623f55227fec6c990573a381afae8562fbf4490fa61c83f2422f0`.
The closed E5 run exited0, disposed its encoder and checked source/input pins.
All original unavailable outcomes remain; no old hierarchy TEST was repurposed.

Same-response metadata DEV subsequently retained all four new allowed captures.
Two articles supplied machine-readable publication claims: Cambridge a calendar
day, Berkeley a timestamp. UW and Caltech remained unknown. Normalized dates are
bound to the current response/observation hashes; the four title/body hashes
still match the earlier encodings, but new response identities are not aliases
for the old Source inputs. This does not authorize rebinding live embeddings.
The collector never substitutes annotated gold event dates or visit time.

Actual metadata result:
`8479d0da2ddf9efdf5e0abfa7560bc134f9c7d6d2f349e4579475527ed57cb39`,
66.03s for the policy-paced four-page HTTP batch,0.9-1.3ms per native DOM
extraction. All39 source pins, owned browser exit/profile cleanup and zero browser
external requests passed. Nine separate native Chrome fixtures and a two-document
response/CSP check pass;46 joined pure collector/DOM/normalizer tests pass.
These are Root-only extraction/coverage results. They are not live Source
metadata integration, event-time truth, assignment quality or UI latency evidence.

Read-only live inspection found installed pgvector0.8.2 and `vector_mirror`
columns in embeddings/fixed_references, with no HNSW/IVFFlat index. Six read-only
distance queries over these four retained DEV vectors agreed with exact binary64
cosines within1.09e-7. This is operator/precision evidence, not index recall or
throughput. No production index or row was changed.

## Registry and assignment

Keep the fixed embedding/classifier model independent of a growing named-topic
registry. A new story must not require registering a whole new classifier head,
duplicating every existing vector under a new model or reclassifying every page.
Use persistent opaque topic IDs, separate mutable labels, explicit kind
(`subject`, `event`, provisional) and versioned evidence/prototypes. A supported
new topic can temporarily have no trusted parent; do not force an arbitrary
broad label. Add ancestry only when supported, keeping a forest acyclic.

Use existing exact Source/input witnesses and a declared paired representation.
An assignment depends on Source version, operation/digest/body/title identities,
representation, topic evidence revision and policy. Recheck them in the commit
transaction. Stale candidates are discarded, not rebound to a newer Source.
Do not infer ancestry, confidence or a probability directly from cosine similarity.

Implement an explicit additive canonical hierarchy18 profile/migration for the
registry and its protected routines. Keep migrations1-17 unchanged. Provide
roles/readiness, current-Source membership, immutable root context, proposal
state, prototype dependency/erasure and indexed search/read boundaries together.
Do not silently install an untracked side schema to evade profile checks. Import,
ordinary startup and user HTTP cannot install or activate schema/model changes.

Use one bounded background worker shared with foreground-priority work. Query a
small candidate set of topic prototypes, then rerank exact retained vectors and
check group cohesion, conflicting candidates, independent inputs and temporal
constraints. No catalog-wide refit/scan on a page read or post. Unknown or
ambiguous input remains clearly page-only and writable under the existing exact
Source/account/document rules. A singleton can supply a provisional page label;
it is not automatically evidence of a coherent shared topic.

Evaluate subject continuity separately from event identity. Two reports about
one award can share an event; next year's award or a later development about the
same person must not be silently merged into it. Record publication/event-time
provenance and precision separately from first observation time. Unknown dates
stay unknown. Add a same-document/crawler-response metadata observation bound to
the Source operation; never import evaluation annotations into runtime evidence.

The existing prototype requires complete pairwise support within at most64
observations (2016 pairs), rejects competing-group ties, and collapses duplicate
relations before counting independent support. It is one candidate policy, not
the final promotion criterion. Its0.90 threshold is not inherited from Related
and is not a probability. Cross-year, same-entity/different-event, late-arrival,
multilingual, incidental-mention and novel-topic tests must inform the decision.

## Fast retrieval and names

Use pgvector for indexed prototype retrieval and exact binary64 reranking for the
final policy. Measure ANN candidate recall separately from assignment precision,
including unresolved roots and changed/erased prototypes. A missing/stale index
cannot grant a match; cache or page-only fallback preserves reading/commenting.
Start with a bounded reference and build an index only in an owned fixture before
production. Do not claim that the current unindexed columns already provide it.

The [pgvector0.8.2 documentation](https://github.com/pgvector/pgvector/tree/v0.8.2)
supports cosine and approximate search; HNSW trades build/memory cost for query
speed and needs no training stage. This is a candidate implementation choice,
not a measured production capacity claim. Its installed version requires no new
software download for the present design work.

Create the first useful label from a representative captured headline and retain
its Source attribution. Names may improve later without changing IDs. Do not
require an LLM call on first visit, matching, reading or posting, and do not send
browsing text to a provider by default. Automatically publish only under a tested
versioned policy; owner controls can review/rename/merge/split/disable afterwards,
without making every new story wait for manual approval.

Do not interpret frozen HDBSCAN prediction as discovery: [its documented prediction
API](https://hdbscan.readthedocs.io/en/latest/api.html#hdbscan.prediction.approximate_predict)
uses existing clusters. [BERTopic online/merge approaches](https://maartengr.github.io/BERTopic/getting_started/online/online.html)
offer other discovery candidates. Compare them only when they address observed
errors; the earlier rejected84-text study remains rejected and consumed.

## Discussions, UI and privacy

Existing canonical topic/discussion/root IDs and author destinations remain.
New roots retain the concrete named-topic label/identity/evidence revision seen
at posting, subject to the existing erasure rules for Source-derived metadata.
An immutable membership is not permission to preserve a forgotten page's title;
erase that derived text while keeping the canonical human contribution/route.
Broad browsing scope is distinct from that concrete comment context.
Parent/event/alias feeds hydrate canonical rows and deduplicate by root ID; replies
and AI replies still target their original discussion and exact witnessed target.
Renaming, merging, splitting or moving Source assignments does not rewrite posts
or silently reinterpret the author's original destination.

Show a readable concrete topic title plus optional ancestry. A page-only fallback
must say that it describes the current page, rather than claiming a shared topic.
Show the selected concrete context before the person posts. An eligible first
page can supply a provisional readable title immediately; discovering a useful
new story must not require another site to be visited first. Later automatic
shared-topic confirmation improves discovery without silently changing the
original comment's meaning. Distinguish enduring subjects such as AI from
specific events such as the2024 Physics Nobel announcement in the displayed
context, even when both are available as ancestor browsing scopes.
Keep global Search Topics independent of the foreground page; add indexed server
search/pagination instead of exporting every future topic for local filtering.
Keep provisional/page-only records out of global shared-topic discovery. Prioritize
topics containing real human discussion; crawler volume alone must not turn a
million empty candidates into a useful-looking discussion directory. More unique
news events can legitimately create more topics; do not force unrelated events
together merely to reduce the topics/pages ratio.
Owner breadth remains owner-wide/per-topic, with no personal override. An admin
login is still a separate future management surface, not an automatic grant to
the first account. Do not restore related-page suggestions in Discussion.

Only existing opt-in eligible Sources participate. Distinguish crawler volume,
human visits, independent publishers and human discussion participation. None is
an interchangeable confidence vote. No new private-page capture or default raw
page-text retention is implied. Forget/erasure invalidates dependent prototypes,
candidate indexes and public projections; a stale cache cannot revive content.

## Delivery checks

1. Freeze separate development/calibration and prospective whole-event/site/time
   tests. Report original failed captures, coverage, false merges/splits and titles;
   never turn a tiny successful cohort into population98%/1% acceptance.
2. Complete publication/context metadata provenance and compare bounded candidate
   methods. Persist stable registry IDs and evaluate exact versus indexed recall.
3. Validate actual PostgreSQL roles, races, current-input fences, old destinations,
   deletion and replay in an isolated owned fixture. Preserve original resource
   floors; no full restore below its11GiB disk admission floor.
4. Validate real source/browser ingestion, genuinely visible named topics, human
   and AI replies, cold/warm latency, automatic dashboard refresh and concurrent
   crawler/user work. Preserve drafts while classification/discovery is pending.
5. Prepare fresh consistent encrypted recovery and reviewed explicit source/profile
   activation. Keep crawler6384 during development; any necessary compatible
   replacement at actual cutover drains the exact process, preserves progress and
   starts one successor. Do not reset or discard its queue.

The overall goal remains active. The working static hierarchy is preserved while
this additional owner-required automatic growth mechanism is implemented.
