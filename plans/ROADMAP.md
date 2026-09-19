# Development / Testing / Rollout Roadmap

The active agent team must refine this after research. Do not skip gates.

## Phase 0 — Product & feasibility
Deliverables:
- agent structure;
- refined requirements;
- current competitor/history research;
- semantic clustering spike design;
- privacy/security threat model;
- architecture options;
- cost model;
- early-adopter experiment design;
- ADRs for major choices.

Gate: credible path to cheap topic resolution, privacy-safe client behavior and measurable validation.

## Phase 1 — Technical spikes
Build disposable or isolated prototypes for the riskiest assumptions:
- webpage metadata/content extraction;
- URL canonicalization;
- embedding + candidate retrieval;
- topic match verification;
- clustering evaluation dataset and metrics;
- extension indicator/sidebar prototype;
- auth and comment API skeleton;
- secure BYO-AI proof of concept if feasible.

Gate: demonstrate acceptable clustering precision on a manually labeled test set and a usable end-to-end page -> topic -> discussion flow.

## Phase 2 — Private alpha MVP
Implement only what is required for 10–50 trusted testers:
- accounts/auth;
- sources/topics/source-topic mapping;
- discussion/comments/replies;
- human vs AI provenance;
- AI filtering;
- semantic resolution;
- one browser client;
- user-invoked private AI;
- explicit publish-AI-result workflow;
- reports/blocking/basic moderation;
- telemetry with privacy controls;
- logs/monitoring/backups;
- CI tests.

Gate: stability + privacy/security review + meaningful repeated usage by testers.

## Phase 3 — Closed beta
Target hundreds of users.
- onboarding;
- clustering correction/merge/split tools;
- reputation/ranking experiment;
- improved moderation;
- cost controls;
- cross-browser expansion if justified;
- early community program;
- landing site/docs;
- support process.

Measure discovery CTR, retention, contribution quality, AI usage, clustering errors and abuse.

Gate: evidence of retention/usefulness and manageable moderation/costs.

## Phase 4 — Mobile validation
Research and implement the best feasible Android/iOS entry mechanisms while preserving the same backend/topic graph. Do not require identical UX. Validate mobile discovery friction.

## Phase 5 — Public launch
Prerequisites:
- security review;
- privacy policy/terms and applicable compliance work;
- moderation/takedown process;
- store-policy review;
- production observability/backups/incident plan;
- abuse defenses;
- cost alarms;
- rollout/rollback plan;
- marketing launch assets.

Roll out progressively; do not open unrestricted agent posting on day one.

## Phase 6 — Platform/agent ecosystem
Only after core human product has evidence:
- third-party agent SDK/API;
- agent registration/permissions;
- reputation;
- marketplace/subscription experiments;
- developer docs;
- stronger multi-provider AI integration.
