# Multilingual precision holdout v2

This is a fresh, independently authored synthetic challenge corpus for offline topic-matching research. It contains 48 original short articles: six fictional broad entity families, two distinct developments per family, and four articles per development. Each development has two English articles and two articles in two distinct non-English languages selected from Dutch, German, French, and Spanish. Language is encoded in the ID (`m2-en-01`, `m2-nl-02`, and so on) without adding a field to the JSONL schema. The records use distinct viewpoints and framing; some titles and descriptions approach the same event indirectly rather than by literal translation.

The JSONL schema is `id`, `family`, `topicLabel`, `viewpoint`, `split`, `title`, and `body`. Every record has `split` equal to `multilingual-challenge-v2`. Bodies are intended to be 250–600 Unicode characters. Articles within one precise development describe related aspects of that development; adjacent developments sharing a family are deliberate hard negatives about different events.

All people, organizations, locations and events are fictional. Topic labels are author-created hypotheses for a research challenge, not real-world gold judgments or a calibrated definition of semantic identity. The corpus has not been scored against a matcher. Its construction is not evidence of matching quality, language coverage in general, or production suitability. Keep this frozen corpus unchanged after any scoring; author a separately versioned set for later changes.

`holdout.jsonl` SHA-256 (exact UTF-8 file bytes):

```text
A9739FAF8A306588F07296CFE5744829538D7423F2952C8CE4655331904EF4A9
```

Run the direct Node integrity check from the repository root:

```powershell
node apps/local-service/experiments/topic-encoder/multilingual-holdout-v2/integrity.test.js
```

This check reads only this corpus and validates JSONL parsing, exact keys, split, record/family/development/language counts, unique IDs/titles/bodies, and body character bounds. It imports no matcher or evaluator and computes no scores.
