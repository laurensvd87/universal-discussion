# Broad hierarchy paired-input development

Offline development only. No new hierarchy is activated. See [ADR-133](../../../../../decisions/ADR-133-paired-input-and-broad-hierarchy-development.md).

This is a different method/input experiment from the closed ADR-131 exemplar and
ADR-132 trained-head cohorts. It uses 120 existing public Source metadata rows,
not a fresh final holdout. That inventory informed a broad candidate taxonomy:
63 nodes, 16 roots, 126 independently authored positive descriptions. Metadata
labels were authored blind to model outputs and sealed before encoding. They are
positive partial evidence, not full-page gold: 72 clear, 12 ambiguous, 36 insufficient.
Unknown personal names were not turned into negative or forced topic labels.

Five body/title weight pairs and two root rankers were declared before encoding.
The existing query-prefixed E5 model encodes 126 positive descriptors and 120
retained titles in one session. Existing body vectors are read in one read-only
snapshot and verified against their binary64 mirror. Source vectors remain in RAM;
no page fetch, provider inference, canonical write, migration or service activation.

## Actual development result

The strongest unfiltered root ranking was descendant-union with .75 body/.25 title:
51/72 clear metadata roots compatible (70.83%). Body-only descendant-union was
50/72; body-only direct-root descriptors 42/72. These are DEV compatibility figures,
not full-body assignment accuracy or an independent comparison with older cohorts.

At root margin >= .02, .25 body/.75 title retained 25 clear cases, all metadata
compatible, PLUS three unscored ambiguous/insufficient cases. Clear-case coverage
was only 25/72 (34.72%). This is not demonstrated 100% classifier precision.
No paired policy or production threshold has been selected from these results.

The scorer p95 was .4462 ms AFTER embedding, over only 63 nodes. Encoder setup
1338.63 ms, 246 sequential encodes 5932.91 ms, inner elapsed 8414.36 ms, entire
supervised child 31.656 seconds. Sampled child peak RSS 1,048,555,520 bytes and
private commit 1,208,004,608 bytes stayed below the declared 1536 MiB limits.
These are not browser readiness, queue, hosted throughput or end-to-end page timings.
The existing crawler and application stayed running.

## Preserved execution evidence

V1 failed BEFORE encoder initialization because it sent an array/ANY predicate to
the intentionally restricted binary embedding wire helper. This was a test harness
contract error, not a database corruption finding. Its original files, exclusive
marker and failed supervisor receipt are retained. Do not run V1 again.

V2 is explicitly separate: `development-v2.js` and `supervise-development-v2.py`.
It uses the existing numbered IN contract, covered by a no-I/O regression test.
The same protocol, gold and weights were used. V2 completed once, and its recorded
source hashes now close that execution. Do not edit them or rerun for retuning.

Ignored local evidence under `apps/local-service/data/`:

- `hierarchy-public-inventory-adr133.json` and `hierarchy-metadata-gold-adr133.json`.
- `hierarchy-paired-development-adr133.started.json`, stdout/stderr/supervisor files
  for the pre-encoding failure.
- `hierarchy-paired-development-v2-adr133.{started.json,json,stdout.log,stderr.log,supervisor.json}`.

The result SHA-256 is
`9a5014cb42a464912a454b4d90d258f7af7223f60faa16f2b1ea6513ca62b085`.
The checked-in [aggregate receipt](development-report.json) contains hashes, scope,
timings and aggregate arithmetic only, not Source IDs/titles, vectors or credentials.
An independent stored-byte/metric review passed without inference or reclassification.

Guarded tests cover paired normalization/endpoints, exhaustive prototype scores,
the separate uncalibrated deepest-path policy, candidate taxonomy, sealed partial
labels and rank-summary arithmetic. The deepest-path policy is NOT used by this
ranking pilot and supplies no production assignment authority. Conservative
parent stopping still needs independent calibration and representative validation.

## Next experiment

Descriptor similarity alone has insufficient broad coverage to roll out. A compact
local multilingual NLI reranker is being investigated as a genuinely different
decision method. These same 120 rows may be used only for further DEVELOPMENT
comparisons. Any later quality test needs new appropriately grouped labels, plus
separate calibration, outside cases, specificity and contradictory-title stress cases.
