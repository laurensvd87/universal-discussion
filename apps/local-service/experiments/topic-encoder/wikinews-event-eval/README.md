# Wikinews event corpus adapter (local research)

This is a bounded, offline parser for a multilingual event benchmark. The owner approved a private local research copy on 2026-10-09. The adapter has inspected that copy; no model evaluation is claimed. Dataset license and original publisher rights need separate review before product training, shipping, or publication. The committed test records are fictional.

The JSONL input has one article object per line with `pageid`, `title`, `categories`, `lang`, `url`, `text`, `date`, and `type`. Equal `pageid` values are treated as one gold event across languages. `text` may be a string or an array of paragraph strings; empty text is accepted and counted separately. `date` may be null or blank; both are counted as empty dates. The parser accepts 64 MiB maximum input (the approved file is 45,258,115 bytes), 20,000 articles, 256 KiB per line, 100,000 text characters per article, at most 256 paragraphs, 20,000 characters per paragraph, and bounded other fields. It accepts HTTP or HTTPS URLs only on Wikinews subdomains but never fetches them. The approved file passed these bounds and schema checks.

`--dry-run` reads no input and loads no model. `--diagnose-schema` and `--inspect` require explicit absolute paths to a private directory outside the repository and an input file inside it. They check path containment and input type. The diagnostic mode reports only field type, empty, and limit counts. Inspection reports only aggregate article/event counts, empty-text/date counts, language counts, event-size distribution, and input SHA-256. Neither mode emits titles, text, URLs, page IDs, per-article values, paths, or vectors. Errors are fixed diagnostic codes. Network and subprocess capabilities are denied in the CLI.

For the owner-approved local copy (SHA-256 `b03da8d71ada96779e860e29a523a7e9f8bf5de3b595b45fd3c12d53b81958fa`), inspection found 15,200 articles in 5,240 page-ID groups across 33 languages. Event sizes range from 2 to 22 articles. There are 127 empty text arrays and 3,549 null or blank dates (3,427 null and 122 blank). All expected fields are present; no field exceeds the parser's configured length bounds. These are corpus structure counts, not a measure of matching quality.

The current adapter intentionally has no model evaluation command. Any later 1,200-article scoring budget would be an offline compute bound, never a fixed Topic member or retrieval limit. No production matcher or stored discussion is changed.

From repository root with Node 24 or later:

```powershell
node apps/local-service/experiments/topic-encoder/wikinews-event-eval/run.js --dry-run
node --test --test-isolation=none apps/local-service/experiments/topic-encoder/wikinews-event-eval/core.test.js
node apps/local-service/experiments/topic-encoder/wikinews-event-eval/run.js --diagnose-schema --private-dir C:\private\wikinews --input C:\private\wikinews\articles.jsonl
node apps/local-service/experiments/topic-encoder/wikinews-event-eval/run.js --inspect --private-dir C:\private\wikinews --input C:\private\wikinews\articles.jsonl
```
