# Wikinews event corpus adapter (fixture only)

This is a bounded, offline parser for a possible multilingual event benchmark. It has **not** downloaded or opened the Wikinews multilingual dataset, and no real evaluation is claimed. Acquisition is blocked pending owner approval. Dataset license and original publisher rights need separate review before product training, shipping, or publication. The only test records here are fictional.

The prospective JSONL input has one article object per line with `pageid`, `title`, `categories`, `lang`, `url`, `text`, `date`, and `type`. Equal `pageid` values are treated as one gold event across languages. `text` may be a string or an array of paragraph strings; empty text is accepted and counted separately. `date` may be null. The parser accepts 64 MiB maximum input (the listing reports about 45.3 MB), 20,000 articles, 256 KiB per line, 100,000 text characters per article, at most 256 paragraphs, 20,000 characters per paragraph, and bounded other fields. It accepts HTTP or HTTPS URLs only on Wikinews subdomains but never fetches them. These constraints are adapter assumptions to validate on fictional fixtures; actual dataset schema compatibility is unverified.

`--dry-run` reads no input and loads no model. `--inspect` requires explicit absolute paths to a private directory outside the repository and an input file inside it. It checks path containment and input type, then reports only aggregate article/event counts, empty-text count, language counts, event-size distribution, and input SHA-256. It emits no titles, text, URLs, page IDs, per-article values, paths, or vectors. Errors are fixed diagnostic codes. Network and subprocess capabilities are denied in the CLI.

The current adapter intentionally has no model evaluation command. Any later 1,200-article scoring budget would be an offline compute bound, never a fixed Topic member or retrieval limit. No production matcher or stored discussion is changed.

From repository root with Node 24 or later:

```powershell
node apps/local-service/experiments/topic-encoder/wikinews-event-eval/run.js --dry-run
node --test --test-isolation=none apps/local-service/experiments/topic-encoder/wikinews-event-eval/core.test.js
# After separate corpus acquisition approval only:
node apps/local-service/experiments/topic-encoder/wikinews-event-eval/run.js --inspect --private-dir C:\private\wikinews --input C:\private\wikinews\articles.jsonl
```
