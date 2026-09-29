# Local embedding experiment

Owner-approved scope: [ADR-017](../../../../decisions/ADR-017-local-embedding-experiment.md).
Implementation in progress; no learned model is active in the service or extension.
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
Acquisition hardening/review is in progress; do not run it as a routine test.
Downloads stop at 1 GiB cumulative; installed experiment files at 2 GiB. Runtime
installation scripts must not run; inspect native packages before offline install.
No implicit acquisition by inference, tests, service or popup is permitted.

`.cache/`, `output/` and `runtime/node_modules/` are ignored. Local assets,
derived packs, vectors and reports remain there until manual deletion. Do not
commit or automatically publish them. The service secret scanner excludes only
these generated experiment directories and still checks source/fixtures/lockfiles.
No files are stored in canonical `demo.sqlite`.

Next checkpoint: review measured model quality, size and CPU behavior. Browser/
mobile parity, interactive UI, new input flows and remote vectors remain gated.
