# Local embedding experiment

Owner-approved scope: [ADR-017](../../../../decisions/ADR-017-local-embedding-experiment.md).
Local comparison implemented and measured; no learned model is active in the service or extension.
Only 64 project-created synthetic descriptors are eligible. No real-page content,
uploads, listener, account, payment or production model selection.

From `apps/local-service`:

```sh
npm run test:embeddings
```

These tests need no dependencies/assets and run under the existing external-
capability denial guard. The experiment runtime is isolated in `runtime/`;
ordinary service installation/startup never downloads or imports it.

## Frozen comparison

`fixtures/corpus.json` contains 32 English descriptors and four each in German,
Dutch, Spanish, French, Arabic, Hindi, Chinese and Japanese. It has 60 catalog
entries and four English no-match queries excluded from the catalog. Expectations
are synthetic retrieval judgments, not confirmed Topic associations. The completed
6/6 owner review is unrelated and is not rerun.

Canonical corpus SHA-256 (sorted object keys, preserved array order, UTF-8 compact
JSON without trailing newline):
`4a75170ae6e0b4db993f1d0f17b79f57519a2da4ba306c10304fb21c60cb19a9`.
Freeze the corpus and evaluator in git before learned inference. Do not tune
expectations after results. Four examples per non-English language are only a
smoke test; translations have no independent language validation.

Report any-hit and recall at 3/5 separately, with English/per-language and
cross-language-only candidate pools. Hard negatives report strict wins, ties and
failures; no-match maximum similarities are diagnostics, not calibrated rejection.
Rank using the existing pure ranker with no confirmed links and no learned cutoff.
Never infer automatic Topic joins from this small benchmark.

## Acquisition and retention

Only the explicitly invoked acquisition tool may download approved pinned assets.
Acquisition safeguards were separately reviewed and tested; do not run downloads
as a routine test. Pinned versions, installer/license review and attribution are
in [THIRD_PARTY](THIRD_PARTY.md). The current evidence is Windows x64/Node CPU,
not browser/mobile runtime evidence.
Downloads stop at 1 GiB cumulative; installed experiment files at 2 GiB. Runtime
installation scripts must not run; inspect native packages before offline install.
No implicit acquisition by inference, tests, service or popup is permitted.

`.cache/`, `output/` and `runtime/node_modules/` are ignored. Local assets,
derived packs, vectors and reports remain there until manual deletion. Do not
commit or automatically publish them. The service secret scanner excludes only
these generated experiment directories and still checks source/fixtures/lockfiles.
No files are stored in canonical `demo.sqlite`.

## Reproduce on the prepared development machine

From this experiment directory, after explicitly approved acquisition and offline
runtime setup:

```sh
node src/acquire.js status
node src/run.js lexical
node src/run.js static-f32-1024
node src/run.js static-f32-256
node src/run.js static-f32-128
node src/run.js static-int8-256
node src/run.js static-int8-128
node src/run.js e5
node --import ../../../../spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none integration/runtime.integration.js
```

Each mode runs in a fresh process, checks the frozen corpus, disables JavaScript
network/DNS/subprocess APIs and creates a uniquely named local report. Missing
assets fail; there is no automatic download. Inputs cannot be supplied by CLI,
HTTP or the extension. `build` derives both compact packs once and refuses to
overwrite them. Do not rerun `build` on the prepared machine.

Fresh setup, only within the approved acquisition package: run `node src/acquire.js
runtime`, inspect the locked archives/installers, import those local `.tgz` files
with `npm cache add --offline --ignore-scripts --cache .cache/npm`, then run
`npm ci --prefix runtime --offline --ignore-scripts --cache .cache/npm --no-audit
--no-fund`. Check the full unpacked footprint before adding model assets with
`node src/acquire.js models`; then `node src/run.js build`. Do not run ordinary
online `npm install` or enable lifecycle scripts. Stop if offline install cannot
fit the approved footprint or needs another asset/runtime.

Acquisition serializes runs with `.cache/acquisition.lock`. It charges failed
transfers before requests and retains incomplete files/reservations; it does not
retry them or redownload missing recorded files automatically. Review a stale lock
or incomplete artifact manually, never reset the ledger to evade the budget.
The acquisition ledger includes a conservative metadata/HTTP reserve; it is not
a packet-level transfer measurement. A Windows final-file visibility discrepancy
was recovered by checking the existing complete partial against its pinned hash,
then renaming it and re-verifying. No model bytes were downloaded again.

Reports include full/sliced float32 controls, int8 variants, E5 and lexical
retrieval; language and hard-negative details remain local. The unit tests use
tiny synthetic matrices; the separate integration test requires the actual packs
and saved comparison reports. Source fixtures/evaluator were frozen at `821baf7`
before inference. The later E5 identity correction names the actual direct
Tokenizers.js/ONNX adapter; it did not alter fixture expectations or vectors.

CPU timings include tokenization, with a complete second pass as the warm sample.
Load includes integrity reads and validation; OS caches are not flushed. RSS is
the fresh process high-water mark including validation/evaluation, not model-only
RAM or a mobile estimate. Model-pack bytes exclude executable runtime. Synthetic
shared names/numbers inflate lexical cross-language results; 1,024 hard-negative
comparisons reuse descriptors and are not independent observations. Opposing
claims can belong in one product Discussion; these labels test distinctions,
not a final universal Topic policy. No learned acceptance threshold was fitted.

Next checkpoint: review measured model quality, size and CPU behavior. Browser/
mobile parity, interactive UI, new input flows and remote vectors remain gated.
