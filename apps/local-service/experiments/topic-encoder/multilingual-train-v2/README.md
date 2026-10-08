# Multilingual synthetic training corpus v2

This development-only corpus has two frozen training slices and one frozen validation slice. It contains 180 original fictional short reports: 36 precise developments across 12 invented entity families. Each development has one report in English, Dutch, German, French, and Spanish, with at least four viewpoints across its five reports. Within each family, the three developments concern the same organization but different decisions or events, providing hard negatives that share an actor and theme.

All entities and events are fictional; the prose was written for this corpus and is not copied from publishers or external research. These records are synthetic supervision, not gold judgments or evidence of matching quality. Families are split as indivisible groups: the eight training families occur only in the two `train-part-*.jsonl` files, and four different families occur only in `validation.jsonl`.

Training part 1 covers an energy cooperative, transit authority, arts festival, and football club. Training part 2 covers an observatory, library network, robotics company, and water board. Validation covers a maritime museum, school district, night market, and game studio. Each JSONL line has exactly `id`, `family`, `topicLabel`, `viewpoint`, `split`, `title`, and `body`. Bodies are short article-style reports of one or two prose sentences.

Frozen SHA-256 (exact UTF-8 file bytes):

```text
train-part-1.jsonl  94A14A36B016795B504E22BE9C5C3E1AADB372BDD6D013B9B791E09AC5D81254
train-part-2.jsonl  7240A9848CEE76A2857A737740E4F280F9A9CD7C15D1B38689C9246FF2160DB6
validation.jsonl    EF9F405DF2F8C98054E4F5B465F4FEC3D06287D537E9A08BE3455CE36D35DB99
```

Run the corpus-only integrity check from the repository root:

```powershell
node apps/local-service/experiments/topic-encoder/multilingual-train-v2/integrity.test.js
```

The check validates all three frozen digests, exact schema, counts, unique IDs/titles/bodies across files, five-language coverage, viewpoint diversity, and whole-family train/validation isolation. It does not import or run a matcher, evaluator, or training process.
