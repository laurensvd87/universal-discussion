# Multilingual synthetic training corpus v1

This development-only corpus contains 120 original invented short articles in English, Dutch, German, French, and Spanish. It covers 24 precise developments across 12 broad entity families. Each development has five language-specific articles with differing framing, including supportive, critical, and reporting viewpoints. Each broad entity has two adjacent but distinct developments, which provide same-entity hard negatives. Eight complete entity families are assigned to `train` and four to `validation`; no family crosses the split boundary. There is no test split, and these labels are for training/development only.

All people, organizations, locations, products, and events are fictional. This corpus was authored independently for local offline development. It does not contain page captures, owner data, provider output, or external research. Labels are author-created synthetic supervision, not gold judgments or evidence of matching quality.

Each JSONL record has exactly `id`, `family`, `topicLabel`, `viewpoint`, `split`, `title`, and `body`. The language code appears in the ID. Bodies contain 250–600 Unicode characters. `family` names the broad invented entity; `topicLabel` names the precise development.

Frozen SHA-256 digests (exact UTF-8 file bytes):

```text
train.jsonl       008FF6C9D3B93D6B6A8CF08B1579A4A6C11CF010C97963F02AA5B276D6E03C8B
validation.jsonl  FBD3B22A7C4942B7689D6AC8663A5836B861D7AB5991D65C4BBA65ED38086B53
```

Run the corpus-only integrity check from the repository root:

```powershell
node apps/local-service/experiments/topic-encoder/multilingual-train-v1/integrity.test.js
```

The check validates frozen file digests, JSONL shape, exact split and language counts, whole-family isolation, family/development structure, unique content, and body length. It does not import a matcher or evaluator and does not calculate scores.
