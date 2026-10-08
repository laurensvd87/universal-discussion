# Private real-event evaluation adapter

This is an offline, unactivated research harness for ADR-064. The owner approved private local research under [ADR-065](../../../../../decisions/ADR-065-local-multilingual-corpus-research.md), and the first aggregate GlobeSumm measurement is in [RESULTS.md](RESULTS.md). No corpus content is included here. Product training, model shipment, and publisher-rights clearance remain separate decisions. The only test fixtures in this directory are fictional records inside `core.test.js`.

The adapter accepts either a JSON array of events or strict JSONL with one event object per nonblank line. An event has `{date, description, category, news:[{lang_abbr,title,article,...}]}`. Each JSONL line is bounded at 4 MiB. Optional `event_id` and `family_id` belong to each event, and optional `viewpoint` belongs to each article. Gold event identity is the array element or JSONL line (or explicit `event_id`); absent `event_id`, date plus description supplies a stable key. `category` is only a hard-negative stratum, never a family label. If `family_id` is absent, splitting keeps events intact but cannot claim family-disjoint evaluation. If `viewpoint` is absent, opposing-view results are unavailable. No missing label is inferred.

The caller must give absolute paths to a local private directory outside the repository and a JSON file underneath it. No default input exists. The CLI resolves both paths, rejects an input symlink, limits input to 64 MiB and 10,000 articles, hashes exact bytes, and validates lengths before model loading. It deterministically selects up to 1,200 articles by whole gold family (or whole event when family gold is absent), reports scored and unscored counts, and never creates a sample file. A family larger than the score budget is left unscored. This is a compute budget for the offline experiment, not a Topic membership or retrieval limit. It uses the already packaged, hash-checked local E5 model to embed title plus the first 384 normalized lead characters only when a real evaluation is explicitly invoked. All text and vectors remain in process memory; the CLI writes only aggregate JSON to stdout. Redirect that output only to a private location if desired. Network and subprocess capabilities are denied. It does not call the service or change storage or extension behavior.

The current matcher is a simple complete-link cosine 0.94 baseline, not an event-evidence candidate. Its pairwise work grows quadratically; the 25%, 50%, 100% scaling samples and pair comparison bounds make that limit visible. Scores include pair precision/recall, same-category different-event false joins, cross-language joins, singleton and duplicate counts, order stability, per-split scores, and timing. Empty denominator rates are `null`. Splits are deterministic SHA-256 assignments of gold family when available, else event; each split is matched independently. They do not create new labels. Do not tune on the test split. The report contains no article text, title, URL, event description, gold label, path, or vector.

The `retrieval` section is an aggregate diagnostic over the same selected, transient focus E5 vectors. It reports how many articles with an available same-event partner place one in rank 1, top 3, top 10 or top 25, both among all candidates and among cross-language candidates only. It also gives selected language-code counts; cosine quantiles for same-event, different-event and same-category different-event pairs; and exact title-plus-lead duplicate pair counts where gold event labels agree or conflict. Ranks describe candidate retrieval only. A top-K position is never a Topic identity or membership cutoff. The diagnostic does not change the matcher or write vectors.

From repository root, with Node 24 or later:

```powershell
node apps/local-service/experiments/topic-encoder/real-event-eval/run.js --dry-run
node --test --test-isolation=none apps/local-service/experiments/topic-encoder/real-event-eval/core.test.js
# For the approved private local research input only:
node apps/local-service/experiments/topic-encoder/real-event-eval/run.js --private-dir C:\private\corpus --input C:\private\corpus\events.json
```

The dry run reads no dataset and loads no model.

After rights approval and private local acquisition, `--inspect` validates the same input and selection without loading E5. It emits only the input hash, fixed schema flags, event/article totals, language-code counts, minimum/maximum event sizes, and scored/unscored counts. It never emits a title, article, URL, path, event description, category, or event/family label:

```powershell
node apps/local-service/experiments/topic-encoder/real-event-eval/run.js --inspect --private-dir C:\private\corpus --input C:\private\corpus\events.json
```

On failure, stderr contains one JSON object such as `{"error":{"phase":"schema","code":"ARTICLE_BODY_TYPE"}}`. Fixed codes distinguish argument/path checks, JSON syntax, event field types, article field types, and length/count limits. They contain no value, filename, directory, article text, or URL. Unexpected runtime errors use `UNCLASSIFIED_FAILURE` without exposing their message or stack.
