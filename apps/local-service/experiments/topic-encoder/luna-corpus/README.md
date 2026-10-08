# Luna synthetic article corpus

Original invented English texts for offline topic-focused embedding research. No real people, pages, events, or browsing data are represented. Each record is JSONL with `id`, `family`, `topicLabel`, `viewpoint`, `split`, `title`, and `body`. Article bodies are 300–900 characters. Family IDs are disjoint across the train, validation, and test files. Paired families within a split share a salient entity but describe distinct events or product versions; singleton families have no matching partner in this corpus.

The corpus is frozen by the SHA-256 digests of the three JSONL files. Do not revise these records in place after a result has been reported; create a separately named revision and keep the original digests.
