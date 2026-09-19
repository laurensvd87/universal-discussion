# Phase 0 Foundation

Date: 2026-09-19

Owner: Lead/orchestrator

Status: In progress; topic/corpus pilot complete, connected work still gated

## Decision summary

The product direction is coherent, but the original roadmap combined three different hypotheses that must be tested separately:

1. **Discovery:** a visible indication of relevant activity makes people open a discussion.
2. **Resolution:** different sources about substantially the same item can be joined with acceptably few false merges.
3. **Empty-room utility:** user-invoked AI is useful before a human network exists.

The first implementation increment tests the deterministic floor of hypothesis 2. It does not claim to validate discovery, semantic clustering, community behavior, or AI utility.

The owner's instruction on 2026-09-19 to update the plan and start implementing authorizes this small, reversible spike. It does not authorize deployment, paid services, broad browser permissions, collection of real browsing data, public posting, or handling provider credentials.

On 2026-09-19 the owner also approved the recommended initial defaults: time-bounded story clusters for editorial labeling and a user-invoked, gesture-scoped `activeTab` direction for the first browser design. These decisions are recorded in ADR-004 and ADR-002 respectively. Browser-data egress and real-user collection remain unapproved.

## Narrow validation scope

Phase 1 evaluation starts with public, English-language editorial articles. Product pages, videos, social posts, papers, authenticated content, private browsing, intranet/local addresses, and personalized pages remain unsupported until their topic granularity and privacy behavior are defined.

Within that scope, one Topic is an atomic factual development. Syndication, URL variants, and rewrites of that development stay together; a later material outcome, decision, correction, launch, closure, verdict, or other state change stays separate. A 72-hour publication window is a review presumption rather than merge evidence. `decisions/ADR-004-initial-topic-granularity.md` and the executable label schema define the boundary.

The first spike is client-neutral and offline. Given a fixture observation, it may:

- normalize a public HTTP(S) URL conservatively;
- match an existing source by normalized URL;
- match a topic by an exact fingerprint carrying explicit synthetic-fixture evidence;
- otherwise create a separate provisional topic and its discussion;
- return separate public human and agent activity counts; and
- record the resolution method, confidence, resolver version, and audit time.

It may not fetch a URL, retain raw page bodies, infer semantic similarity, merge on title alone, use an AI service, accept secrets, publish contributions, or expose a network API.

## Challenged assumptions

| Assumption | Challenge | Phase 0 disposition |
| --- | --- | --- |
| A browser extension is the best first client | A user-gesture-only extension protects privacy but cannot show a passive activity indicator before the gesture. Broad access may reduce adoption and trigger store-policy obligations. | Keep the extension hypothesis, but separate a consented discovery experiment from the offline resolver and panel-usability tests. |
| Semantic clustering necessarily improves adoption | Concentration may help, but false merges can destroy trust; the causal adoption effect is not yet known. | Measure resolution quality independently before testing its effect on engagement. |
| A single topic concept works for every content type | A breaking-news event, durable product, paper, and video require different granularity and time behavior. | Limit the first labeled set to editorial articles. |
| URL canonicalization is a safe merge signal | Publisher canonicals and tracking rules can be wrong or manipulated; query parameters sometimes change content. | Strip only an explicit tracking-key set; preserve other parameters; never merge different sources solely by title. |
| Embedding similarity is semantic identity | Similar text can describe opposing, updated, or merely related stories. Thresholds vary by language and domain. | Use embeddings only for candidate retrieval, followed by a separately evaluated verifier and a fail-separate outcome. |
| BYO API keys cheaply solve empty rooms | Credential handling, provider terms, page-data disclosure, and publication consent create high-risk work. | Defer all real-provider work until a dedicated threat model and provider ADR are accepted. |
| Activity can be represented by one count | A combined number can misrepresent AI output as human engagement and may accidentally include private content. | Human and agent public counts are distinct; private invocations never affect either. |
| A server can fetch arbitrary observed URLs | This creates SSRF, authenticated-content, copyright, size, and retention risks. | No server fetch in the first increment; future fetching requires a separate security design. |

## Proposed system shape

No production stack is accepted yet. Phase 1 code is an isolated dependency-free spike.

The leading alpha option is a modular monolith with explicit domain boundaries, a relational store, and asynchronous jobs. PostgreSQL plus pgvector is the default candidate because source/topic/discussion data is relational and early vector volume does not justify a separate vector service. A semantic worker can be split out only if measured runtime or dependency needs demand it.

Alternatives to compare before alpha:

- managed Postgres/auth/functions for low operational load;
- a small EU-hosted application plus PostgreSQL for portability and lower direct cost; and
- serverless API functions plus managed Postgres for bursty use, accepting local-development and observability complexity.

Microservices, a dedicated vector database, Kubernetes, and owned GPU infrastructure have no current justification.

See `decisions/ADR-003-alpha-architecture.md` for the proposed boundary and decision gate.

## Executable success definitions

### Resolver quality

The manually labeled evaluation set must contain at least 200 source-pair decisions across at least 50 story clusters, including duplicates, syndication, updates, related-but-distinct stories, unrelated stories, and adversarially similar titles. Tuning and held-out splits occur by story cluster so variants of one story cannot leak across splits.

- Primary safety metric: precision of automatic topic joins on the held-out split.
- Minimum evidence: at least 60 automatic-join decisions spanning at least 20 held-out story clusters; pairwise combinations from one cluster do not count as independent stories.
- Automatic-join gate: precision at least 0.97 and a Wilson 95% lower bound at least 0.93. Report a story-cluster bootstrap sensitivity interval because pair decisions can still be correlated.
- Utility gate: recall at least 0.50 on held-out, supported-scope same-topic pairs. Precision takes priority; the resolver must abstain rather than lower its safety threshold.
- Assisted branch: if safety passes but utility does not, matches remain suggestions/curated mappings and no automatic semantic-resolution claim is made. If safety fails, automatic joins stop entirely.
- Hard stop: any systematic cross-event merge class, loss of traceability, or inability to reverse a merge.
- Every run records dataset/split version, resolver/model version, frozen threshold, confusion matrix, abstentions, latency, and cost per item.

### Discovery experiment

This is not measured by the offline spike. After observation/privacy approval, recruit 20-30 invited participants for 14 days through owner-approved direct outreach; do not begin public recruitment. Onboarding must explain page access, every transmitted field, seeded content, controls, retention, and withdrawal/deletion handling.

- `eligible_page_view`: a supported public article for which the client is allowed to evaluate activity; deduplicated per participant, topic, and 30-minute window.
- `indicator_impression`: the first time the activity affordance is actually rendered and visible in that eligible-view window.
- `discussion_open`: the participant intentionally opens the panel from that affordance within 10 minutes.
- `engaged_open`: an open followed by at least 10 seconds of visible panel time or an explicit thread expansion, reply, or reaction. Final instrumentation requires privacy review.
- Primary participant-level metric: participants with an `engaged_open` on at least two separate days / participants with at least five indicator impressions.
- Supporting metrics: impression-to-open rate, discussion read depth, human contribution rate, explicit AI invocation rate, clustering correction rate, and report rate. Confidence intervals are participant-clustered/bootstrap intervals, not impression-level intervals.
- Proposed directional go signal: at least 25% of eligible participants meet the primary repeated-engagement criterion and the participant-bootstrap lower bound for impression-to-open rate exceeds 5%.
- Stop/rework: fewer than 10 participants receive five impressions, material privacy complaints, or confirmed false merges above 2% of manually reviewed automatic joins.

Seed only manually verified topic mappings. Seeded contributions must come from real study-team/tester accounts identified as seeded, never fabricated community members. Any later AI seed must use an explicit agent identity/provenance and agent count. Analyze seeded and organic topics separately so seeded utility does not masquerade as network activity.

These thresholds are planning proposals, not claims of product-market fit.

### Privacy and trust

- No silent per-user browsing history.
- No raw page body, full URL, or telemetry egress until each field has a stated purpose, lawful-basis assessment, consent/control where applicable, retention, deletion path, and log policy.
- AI output is private by default and requires an explicit, auditable publication action.
- Human and agent identities/counts cannot be conflated.
- Untrusted page/comment/model text has no authority to call tools, access secrets, or publish.

## Cost envelope

These are external infrastructure/API cash-spend scenarios for planning, not vendor quotes or approved purchases. They exclude engineering, moderation, support, legal, and on-call labor, which require a separate staffing model before alpha/beta. Assumptions: 60 eligible resolution checks and two newly processed sources per MAU; platform-funded generative AI is off; embeddings are cached once per source; media storage is out of scope.

| Scale scenario | Low | Base | Hard monthly cap | Expected shape |
| --- | ---: | ---: | ---: | --- |
| Offline spikes | EUR 0 | EUR 0 | EUR 0 | Local fixtures and deterministic tests. |
| 100 MAU | EUR 0 | EUR 50 | EUR 75 | One small environment, relational store, basic logs/backups. |
| 1,000 MAU | EUR 25 | EUR 75 | EUR 150 | Small Postgres/API, bounded jobs, backups, monitoring. |
| 10,000 MAU | EUR 100 | EUR 350 | EUR 750 | Measured database/worker scaling, abuse controls, and operational coverage. |

Before accepting an architecture, replace these hypotheses with low/base/high line items for compute, database/vector storage, backups, egress, observability, auth/email, embedding/moderation inference, and recovery. Embedding API prices are unlikely to dominate at early scale when processing is cached; moderation, operations, and abuse may dominate. Every semantic benchmark must report quality, wall time, tokens/CPU, and projected cost at the three user levels. See `research/PHASE_0_EVIDENCE.md` for current reference prices and caveats.

## Decisions and unresolved questions

Authorized constraints for the current offline experiment (ADR review/implementation gate remains separate):

- deterministic, auditable resolution precedes probabilistic matching;
- exact fingerprint equality may join separate sources in fixtures;
- ambiguous observations fail into separate provisional topics;
- one provisional topic owns one discussion in the spike;
- public human/agent counts are structurally separate; and
- the spike performs no network access and stores no raw content.

Owner/security decisions before a connected browser prototype:

1. **Resolved:** the first design is user-initiated with gesture-scoped `activeTab`; it tests panel utility, not passive discovery.
2. **Open:** what exact URL/content fields leave the device, and are query strings removed or transformed first?
3. **Open:** are requests linked to an account, and what are application, proxy, analytics, and backup retention periods?
4. **Open:** which sensitive categories/domains are always excluded?
5. **Open:** is the first UI a Chromium side panel, a popup, or an on-page affordance?

Owner/product decisions before probabilistic auto-joins:

1. **Resolved:** use the versioned time-bounded atomic-development rule in ADR-004 for the initial editorial corpus.
2. **Resolved for labeling:** substantial new outcomes/state changes are separate; minor copy corrections and syndication remain together.
3. **Open:** what reviewer workflow and audit behavior govern real merge/split corrections?
4. **Open:** does a Topic always retain exactly one Discussion through merges/splits?

Security/provider decision required before BYO AI:

1. Supported provider auth mechanism and terms;
2. local versus server-side credential boundary;
3. exact content disclosed to the provider and its retention controls;
4. private invocation retention/deletion; and
5. explicit public-publication state transition and provenance.

## Phase 0 gate

### Remaining executable exit work

`P0.1 Topic definition and corpus pilot` is **complete**. ADR-004 and `spikes/topic-resolution/evaluation/LABEL_SCHEMA.md` define the initial boundary. The project-created synthetic pilot contains 24 pair decisions across 20 clusters with exactly eight duplicate/syndication positives, eight same-entity/title hard negatives, four update/continuation boundaries, and four unrelated controls. An independent reviewer checked six blinded pairs (25%); both labels are retained and there were no disagreements. `npm run evaluate:pilot` validates the schema and reproduces TP=4, FP=0, TN=16, FN=4.

`P0.2 Decision review` is **partially complete** and owned by the Lead. ADR-002's user-invoked direction and ADR-004's topic definition are accepted. ADR-003, topic/discussion merge-split semantics, exact browser egress/retention, and the remaining threat-model/cost assumptions are still open. Unaccepted items remain explicit blockers rather than inferred approval.

**GO:** the dependency-free offline topic-resolution kernel and creation of the labeled evaluation method.

**STOP:** real browsing-data capture, networked extension behavior, server-side fetching, production API/auth, embeddings that send content to a provider, BYO credentials, public posting, paid infrastructure, deployment, announcements, and store submission until their specific ADR and review gate is accepted.

Phase 0 is complete only when the remaining browser-data, architecture, merge/split, threat-model, and cost decisions are reviewed. Topic granularity and the small synthetic labeling pilot are complete and demonstrate that the full Phase 1 evaluation is runnable. The 200-pair labeled set and model benchmark remain Phase 1 deliverables.
