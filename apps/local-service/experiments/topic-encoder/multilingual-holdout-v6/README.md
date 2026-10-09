# Independent multilingual Topic holdout v6

This frozen, synthetic-only holdout contains 60 original fictional short reports: four precise developments for each of three invented organizations, with one English, Dutch, German, French, and Spanish report per development. `topicLabel` identifies the intended development; reports about another development in the same family are deliberately close negatives. This corpus was authored without consulting matcher code, previous holdout data, or evaluation results.

The families are Aven Fen Transit (evening Route 7 frequency, Bridge stop platform relocation, contactless daily fare cap, depot solar roof), Marova Food Cooperative (North Quay cold room, per-kilo labels, reusable crate deposit, evening delivery order cutoff), and Orila Archive Network (Cedar recording booths, digitized map release, Alder mobile stop, Tuesday reading-room closure). Dates, quantities, affected services, and fictional place names were audited across all five languages before freezing. Each report retains its event facts and adds an event-specific supportive, critical, neutral, skeptical, or consumer/public perspective. The viewpoint assignment rotates by development index, giving each language each viewpoint two or three times.

Every JSONL line has exactly `id`, `family`, `topicLabel`, `viewpoint`, `split`, `title`, and `body`, in that order. The language is the two-letter suffix of `id`; `split` is always `holdout`. `build.js` is the authoring source for the committed `holdout.jsonl`. It should not be run during evaluation, because the emitted file and its exact UTF-8 bytes are the frozen artifact.

Frozen SHA-256 for `holdout.jsonl`:

```text
032EAA490D0AE6B9067EC479BE4A80B563229606F83CE0F43A1BC9EFD4098AEB
```

Run the corpus-only check from the repository root:

```powershell
node apps/local-service/experiments/topic-encoder/multilingual-holdout-v6/integrity.test.js
```

It checks the exact byte digest, schema, unique IDs/titles/bodies, 45–85 whitespace-delimited body words, three families, four topics per family, five languages and viewpoints per topic, and a two-or-three occurrence range for every language/viewpoint pair. It does not import a matcher, trainer, or evaluator.

Limitations: these are authored synthetic reports, not publisher text or a representative sample of real-world multilingual news. The topic labels are intended groupings, not independently adjudicated semantic identity. The perspectives share a controlled report format and cannot measure performance on longer articles, code-switching, ambiguous developments, or genuine translation variation.
