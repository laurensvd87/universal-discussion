# Multilingual Topic holdout v5

This is the **105-report corpus at this exact `topic-benchmark/` path**, with
SHA-256 `1B8D086DC5CEE9CB4CBFC31636CC690055CB7E99CBA699738BA1A8C3EE096450`.
It is distinct from the older, already tracked 50-report fixture at
`apps/local-service/experiments/topic-encoder/multilingual-holdout-v5/`
(SHA-256 `618C0F470F62A7F2904CFEBA43012F540C199F700B9032A5145DE75BDE8DA604`).
Future runners must pin this full path and digest, not select by basename.
An unscored 80-report v4 draft in `topic-benchmark/` was superseded before
freeze after an independent quality audit found a language/event-parity
confound; no matcher result informed this correction.

This project-original synthetic holdout contains 105 short article-style reports for 25 fictional developments in five fictional event families. Twenty developments have exactly five reports, one each in English, Dutch, German, French, and Spanish. Each family also has one separate singleton development with one report, rotating through those languages. The reports for each five-report development describe the same concrete event in independently written, idiomatic prose; they are not literal translations. Neighboring developments share family entities and setting while differing in the central action, object, or decision.

The JSONL record schema is exactly `id`, `family`, `topicLabel`, `viewpoint`, `split`, `title`, and `body`. IDs use `m5-{language}-{sequence}`; the prefixes are `m5-en`, `m5-nl`, `m5-de`, `m5-fr`, and `m5-es`. The 25 exact gold labels are `bq01`–`bq04`, `lc01`–`lc04`, `vo01`–`vo04`, `sr01`–`sr04`, `ob01`–`ob04`, plus singleton labels `bq05-singleton`, `lc05-singleton`, `vo05-singleton`, `sr05-singleton`, and `ob05-singleton`. Every row uses `multilingual-challenge-v5` and is holdout-only; do not use it for training, threshold selection, prompt/rule development, or validation.

The `viewpoint` field identifies the stakeholder perspective used to frame an article, such as a ferry operator, municipal planner, or local resident. It does not assign sentiment, stance, or a positive/negative taxonomy. Each event has five different perspective labels.

All entities, places, events, people, and prose are fictional and project-original. There are no URLs or real article excerpts. The event facts are synthetic author-assigned hypotheses, not universal Topic boundaries or evidence of broad language coverage. Reports stand alone and avoid discussion of other developments in their family. The five singleton facts are: a flood-step warning beacon at Bracken Quay; a Luma Commons evening makerspace; new Veyra cold-store roof insulation; tree planting by the Serein relay building; and repair of an Orla Basin lakeside boardwalk section.

`integrity.test.js` checks the exact record schema, label-family mapping, 20 five-language five-report developments, five singleton developments, exact per-language counts, unique stakeholder perspectives, ID sequence, length bounds, and corpus SHA-256. It reads no matching code and computes no scores.

SHA-256 of exact UTF-8 `holdout.jsonl` bytes:

```text
1B8D086DC5CEE9CB4CBFC31636CC690055CB7E99CBA699738BA1A8C3EE096450
```

Run from the repository root:

```powershell
node apps/local-service/experiments/topic-encoder/topic-benchmark/multilingual-holdout-v5/integrity.test.js
```
