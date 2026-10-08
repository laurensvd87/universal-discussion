# Multilingual Topic challenge v3

`holdout.jsonl` is an independently authored, project-created synthetic corpus for offline evaluation. It contains 60 short article-style records in English, Dutch, German, French, and Spanish, covering 15 distinct fictional developments across five fictional entity families. Each development has four reports from distinct viewpoints. Developments within each family are adjacent-event hard negatives: they share a place or institution but concern a different action, asset, or decision. Languages and framing vary by report; records are not translated copies.

The JSONL schema is exactly `id`, `family`, `topicLabel`, `viewpoint`, `split`, `title`, and `body`. Language is indicated by the ID prefix (`m3-en`, `m3-nl`, `m3-de`, `m3-fr`, `m3-es`). The immutable gold event IDs are the exact `topicLabel` strings in this frozen file. Every row is `multilingual-challenge-v3`. All records are holdout-only: none may be used for training, threshold selection, prompt/rule development, or validation. There are no train or validation records in this directory.

Evaluation must report both pair and partition metrics. At minimum include pair TP/FP/FN/TN, precision and recall (with the pair universe and any no-match handling stated), plus exact gold-partition recovery, component purity or an equivalent cluster metric, and singleton/error counts. Report results over the complete holdout and expose per-language same-event pair recall and cross-event false joins where possible. Do not use gold labels to create matcher inputs. Freeze candidate settings before scoring; later edits require a new corpus version and must not overwrite this one.

All organizations, people, places, events, and article prose were created for this project; no external article text, owner data, provider output, or matching results were used. These author-assigned event labels are hypotheses for a challenge set, not evidence of a universally correct Topic boundary, broad language coverage, or production suitability. This directory contains no matcher or candidate results.

`holdout.jsonl` SHA-256 (exact UTF-8 file bytes):

```text
86FD3D5626A2C59ED0DDFF46AC6BB2386EC6A8E9FF163F8C5E95451C21BBBE2C
```

Run the isolated integrity check from the repository root:

```powershell
node apps/local-service/experiments/topic-encoder/topic-benchmark/multilingual-holdout-v3/integrity.test.js
```

The check validates JSONL parsing, exact keys, fixed split and IDs, record/family/event/language/viewpoint counts, and nontrivial event coverage. It reads no matcher, vectors, or evaluator and computes no scores.
