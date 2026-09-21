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

Phase 0 is in progress with a limited go for isolated offline fixture-only implementation slices. Start with:

- `plans/PHASE_0_FOUNDATION.md` — challenged assumptions, scope, metrics, cost envelope and open approvals;
- `agents/TEAM.md` — lean ownership and review contract;
- `plans/ROADMAP.md` and `plans/STATUS.md` — executable order and current gate;
- `plans/P1_2_COLLECTION_AND_COMPLETION.md` — proposed corpus headroom, acquisition/provenance receipts, review reserve, completion receipt, and owner-stop design;
- `docs/PHASE_1_THREAT_MODEL.md` — privacy/security constraints;
- `docs/BYO_AI_THREAT_MODEL.md` — a proposed, provider-neutral boundary for any later AI work;
- `decisions/ADR-001-offline-resolution-spike.md` — the accepted boundary for the completed offline P1.1 experiment;
- `decisions/ADR-002-browser-observation-privacy.md` — the accepted user-invoked browser direction and still-open connected-use gate;
- `decisions/ADR-004-initial-topic-granularity.md` — the accepted time-bounded editorial story-cluster definition;
- `decisions/ADR-005-topic-discussion-correction-history.md` — the proposed append-only merge/split and Discussion-history semantics;
- `decisions/ADR-006-synthetic-html-extraction-profile.md` — the proposed narrow offline profile for exact synthetic document-byte extraction;
- `decisions/ADR-007-offline-owner-review-ledger.md` — the proposed digest-bound local labeling workflow and its stop boundary;
- `research/ALPHA_COST_MODEL.md` — a dated paper cost comparison that authorizes no purchase or deployment.

The first implementation is a dependency-free, offline topic-resolution kernel under `spikes/topic-resolution/`. It uses synthetic fixtures and performs no network or persistence I/O. Run it with Node.js 24 or newer:

```sh
cd spikes/topic-resolution
npm test
npm run test:restricted
npm run check:secrets
npm run review:prepare
npm run review:status
npm run evaluate:pilot
npm run validate:split
```

The Phase 0 pilot contains 24 project-created synthetic pair labels across 20
story clusters. Six pairs received an independent blinded review. The evaluator
reproduces the expected conservative baseline (TP=4, FP=0, TN=16, FN=4); this
validates the labeling/evaluation path, not semantic model quality. Its
versioned report now exposes Wilson intervals, coverage, abstentions, runtime,
offline cost, and why the non-held-out 4-join/4-cluster sample cannot satisfy
the automatic-join evidence gate. The larger P1.2 corpus and cluster-separated
bootstrap remain open.

The structural split dry run groups cross-cluster negatives into four bounded
dependency blocks and rejects corpus changes or partition leakage. Its two
partitions are explicitly not held out; the command validates future evaluator
plumbing only.

The future P1.2 collection path also has a strict, bounded corpus contract with
generated tests for the 200-pair/50-cluster/six-case/20%-review minimums,
disagreement adjudication, provenance inventory, and resolved-label split
projection. This is tooling only: no larger corpus or held-out result has been
created.

The first owner-review workflow increment is now executable without hand-built
JSON. Strict TSV metadata becomes a digest-bound, deterministically ordered
local queue with secondary-review items selected before labels; each owner
answer is appended immediately with caller-declared identity and an unattested
local timestamp. The default task contains six inventoried synthetic pairs and
is only a dry run. It cannot finalize a corpus, freeze a split, evaluate a
candidate, or make an automatic-join decision, so the real roadmap owner
checkpoint remains ahead.

The pre-result policy schema is also executable and tested. It can bind a
future corpus/split/system artifact to immutable threshold, abstention, gate,
bootstrap, and offline-scope rules, but no externally frozen receipt or result
exists yet.

The next unevaluated-output boundary is executable too: a future candidate
bundle must cover every declared held-out pair exactly once and bind its raw
retrieval/score records to that policy and artifact. No bundle is checked in,
and this validator never applies the threshold or computes quality.

A generated-fixture-only result evaluator now exercises the following step:
frozen integer decisions, confusion/Wilson metrics, abstention coverage,
per-case error queues, and dependency-block bootstrap sensitivity. It rejects
non-synthetic Sources and always withholds held-out evidence and a gate branch.

The first P1.3 increment adds a bounded, in-memory parser for one inventoried
project-created HTML fixture plus generated adversarial inputs. It extracts a
title, treats same-origin canonical metadata only as a hint, preserves the
observed URL, and hashes exact bytes into resolver-compatible Source fields
that can be combined with separately reviewed P1.2 corpus metadata. It performs
no file read or fetch at runtime. Fixture identity is
caller-declared rather than attested, so this is not general page extraction or
a production fingerprint trust boundary.

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
