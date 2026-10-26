# Frozen E5 linear hierarchy experiment B

Completed offline on 2026-10-19; **not activated or production-validated**.
See [ADR132](../../../../../decisions/ADR-132-frozen-e5-linear-heads-and-shadow-hierarchy.md).

Train compact regularized membership heads on frozen 384D E5. Descendant examples
are positive for their ancestors; accepted child evidence can support a parent.
The whole-path policy can stop at an ancestor or reject root/sibling ambiguity.
No UMAP/HDBSCAN, provider inference, probability interpretation or live regroup.

Fresh authored synthetic corpus: 128 training / 64 development / 96 calibration /
96 locked test, 15 nodes and English/German/Dutch. These are short synthetic texts,
not representative web captures or independent publisher labels. Eight predeclared
representation/lambda candidates were compared on development membership loss only.
Raw E5 / lambda .01 won; its independent calibration policy was persisted before
the one final test. This is not a controlled accuracy comparison with ADR131's
different cohort. Both experiments are now closed: no retuning or test replay.

## Actual locked results

- 90/96 assigned; 89/90 accepted assignments were on the gold ancestor path.
- 36 leaf decisions, all 36 correct; Wilson 95% lower bound only .9036.
- One over-specific **internal-node** assignment. Leaf accuracy alone hides it;
  all non-root decisions total 59/60 safe (98.33%), including 23/24 internal
  non-root decisions. These are observed synthetic counts, not a release guarantee.
- 18 safe broader fallbacks; 77/96 deepest outcomes correct, including rejection.
- Zero observed wrong broad branches; 95% upper bound .0385, not a <=1% guarantee.
- Classifier p95 .2984 ms for 15 nodes, excluding compilation, embedding, queue
  and database. Not whole-page readiness or a large-taxonomy throughput claim.
- Useful/specific coverage engineering checks pass. Support, confidence-interval
  and representative-web validation gates do not. `productionReady` stays false.

The encoder initialized in 1,556.6 ms and encoded/transformed 384 texts in
14,649.9 ms. Cold initialization plus loop was 16,206.4 ms; whole supervised child
was 31.31 s including imports and file work. Eight fits charged 37,802,352 counted
arithmetic units. Supervised sampled encoding peaks: RSS 1,029,402,624 bytes,
private commit 1,093,963,776 bytes. Sampling is not an absolute peak guarantee.

## Immutable evidence and safe verification

Freeze: `2218edc138e512cf827a0ccdfd971e58ca213f860795be027832fe3c2aed4d7e`.
The 15 source hashes, original report and ignored local model/policy/vector bytes
are linked by `freeze.json`, `measured-results.json` and `execution-receipt.json`.
Artifact SHA and semantic `policyHash` are different hashes, intentionally.

From the repository root:

```powershell
node apps/local-service/experiments/topic-encoder/hierarchical-e5-linear-v1/verify.js --verify
node apps/local-service/experiments/topic-encoder/hierarchical-e5-linear-v1/verify.js --verify-local
```

These verify stored bytes/metrics only, without encoding, classification, database
or provider calls. Default invocations are inert. Do not rerun encode/fit/test or
remove their exclusive claim files. Missing local evidence is an explicit local
verification failure, not permission to reconstruct it by replay.

## Saved-public-page diagnostic, separate from the synthetic test

A read-only keyword-selected browser-Source sample contained only three rows.
Existing body-vector predictions were: “kapsalon barbecue - YouTube” -> Video
games (wrong root); the KIP KAPSALON video -> Cooking; Leuke Recepten recipe ->
Kapsalon. This is a diagnostic, not independently labeled web-quality evidence.
The captured body text was not inspected; missing/noisy input is a hypothesis,
not a proven extraction defect. Do not infer the other crawler pages were tested.

A separately guarded title-only transfer probe completed with exit 0 and safe
sampled resources (RSS 934,625,280 / private commit 948,969,472 bytes, 32.015 s).
Its child stdout did not reach the outer tool; **title predictions are unobserved**.
No result was fabricated; the original marker/output history is preserved.

A deliberately versioned V2 diagnostic then repeated **only those same three
retained titles**, with unchanged exact model/policy SHA pins, a new one-shot
marker and bounded persisted results/logs. This is new visibility, not three new
independent samples or another locked-test evaluation. All three title-only
predictions were Kapsalon; body predictions remained Video games / Cooking /
Kapsalon. V2 process: exit0, sampled RSS913,362,944/privatecommit943,177,728bytes,
supervisor32.922s; inner read/encode/classify/result elapsed3673.3528ms excludes
module imports. The capture-quality explanation remains a hypothesis because the
original body text was not inspected. Title-to-body-head transfer is uncalibrated;
it is not a successful production repair or permission to override body evidence.

The separate `hierarchical-e5-consensus-restriction.js` candidate can only shorten
an accepted body path to its common ancestor with the title path; different roots
or an unresolved view abstain. It cannot promote Cooking to Kapsalon using only a
title. Ten fresh axis-only tests prove its mechanics/body-prefix invariant, not
web accuracy. Its own guard/policy identity is preserved in shadow integration,
never silently treated as the base body policy. A future paired-input method still
needs fresh split/calibration and actual representative captures.

No canonical assignment, service, crawler policy, schema, post, account or provider
state changed. The live crawler continues independently. Shadow storage mechanics
are a separately tested candidate, not a quality-approved canonical bridge.
