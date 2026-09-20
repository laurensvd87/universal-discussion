# Universal Discussion Layer — Agent Bootstrap

This repository is a planning/bootstrap package for handing the concept to GitHub Copilot or Codex.

## What to do
Open this directory in your coding agent and start with the shared charter plus the provider-specific entry point:

- Shared charter: `PROJECT_CHARTER.md`
- GitHub Copilot: `.github/copilot-instructions.md`
- Codex: `AGENTS.md`

All entry points converge on the same workflow: read the bootstrap documents, establish the lean agent structure, complete Phase 0 planning/research, and do not jump directly into product implementation.

The package intentionally does not lock in a programming language, cloud vendor, mobile UI mechanism, database vendor, AI provider or vector store. Those decisions should be researched and documented before implementation.

## Current execution state

Phase 0 is in progress with a limited go for one isolated implementation slice. Start with:

- `plans/PHASE_0_FOUNDATION.md` — challenged assumptions, scope, metrics, cost envelope and open approvals;
- `agents/TEAM.md` — lean ownership and review contract;
- `plans/ROADMAP.md` and `plans/STATUS.md` — executable order and current gate;
- `docs/PHASE_1_THREAT_MODEL.md` — privacy/security constraints;
- `docs/BYO_AI_THREAT_MODEL.md` — a proposed, provider-neutral boundary for any later AI work;
- `decisions/ADR-001-offline-resolution-spike.md` — the accepted boundary for the completed offline P1.1 experiment;
- `decisions/ADR-002-browser-observation-privacy.md` — the accepted user-invoked browser direction and still-open connected-use gate;
- `decisions/ADR-004-initial-topic-granularity.md` — the accepted time-bounded editorial story-cluster definition;
- `decisions/ADR-005-topic-discussion-correction-history.md` — the proposed append-only merge/split and Discussion-history semantics;
- `research/ALPHA_COST_MODEL.md` — a dated paper cost comparison that authorizes no purchase or deployment.

The first implementation is a dependency-free, offline topic-resolution kernel under `spikes/topic-resolution/`. It uses synthetic fixtures and performs no network or persistence I/O. Run it with Node.js 24 or newer:

```sh
cd spikes/topic-resolution
npm test
npm run test:restricted
npm run check:secrets
npm run evaluate:pilot
```

The Phase 0 pilot contains 24 project-created synthetic pair labels across 20
story clusters. Six pairs received an independent blinded review. The evaluator
reproduces the expected conservative baseline (TP=4, FP=0, TN=16, FN=4); this
validates the labeling/evaluation path, not semantic model quality.

Connected browser behavior, production architecture, hosted semantic processing and BYO AI remain gated decisions; the local spike is not a production foundation or a claim that semantic clustering has been validated.

## Product in one sentence
A cross-platform discussion layer that maps the content a person is viewing to a semantic topic and exposes a shared human + explicitly identified AI discussion around that topic.

## Repository map
- `AGENTS.md` — shared instructions for Codex and compatible agents.
- `PROJECT_CHARTER.md` — provider-neutral product and planning charter.
- `.github/copilot-instructions.md` — GitHub Copilot workspace instructions.
- `docs/` — product/domain/AI/security requirements.
- `agents/` — instructions for creating the development and business agent structure.
- `plans/` — phased roadmap and status template.
- `research/` — questions requiring current research before decisions.
- `decisions/` — ADR location.
- `prompts/` — initial owner prompts.
