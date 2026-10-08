# Multilingual precision holdout

This is an independently authored, synthetic challenge set for offline Topic-matching research. It contains **24 articles** arranged as **4 fictional broad entity families × 2 distinct, adjacent developments × 3 articles per development**. Each precise development has English, Dutch, and German or French coverage, with a different viewpoint in each article. Bodies are 250–600 characters. The schema is `id`, `family`, `topicLabel`, `viewpoint`, `split`, `title`, and `body`; every `split` is `multilingual-challenge`.

The adjacent developments within each family are deliberate hard negatives: they share an invented entity but describe different events. The three records within a development are intended related examples with distinct perspectives. These labels are author-created hypotheses for a research challenge, **not real-web gold judgments** and not a calibrated definition of semantic identity. All entities and events are fictional; no private or real-page content is included.

`holdout.jsonl` is frozen before scoring. SHA-256 (UTF-8 file bytes):

```text
C25C367997CE5F0B1F9F1CBBA3C7A037C3E2FE38D05B0F507CB8B4F9166B7776
```

Run the focused data integrity check from the repository root:

```powershell
node apps/local-service/experiments/topic-encoder/multilingual-holdout/integrity.test.js
```

It checks the exact record fields and split, counts and family/development shape, unique IDs/titles/bodies, and body character bounds. It does not load or score a matcher. Keep this holdout unchanged after it is scored; any later authoring should use a new version and digest.
