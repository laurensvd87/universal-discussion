# Topic titles without a generative model

Date: 2026-10-07
Status: recommendation only; no production title change

## Finding

Learned Topic creation currently copies one member Source title into
`Topic.title`. Reused Topic IDs retain that old title even after source-title
updates or adaptive split/merge. A heading may therefore be a page headline
that is no longer representative of the current cluster. Manual/fixture
Topic titles are separate and should not be changed by this work.

An embedding can rank which existing headline best represents the cluster,
but its numeric vector cannot generate human-readable words. A second
"topic" embedding could improve clustering or representative selection only
after evaluation; it would not solve naming by itself and would change the
reviewed one-vector model contract.

## Recommended first increment

Derive a **provisional representative title** from current learned Topic
members at read time, without changing membership, Topic IDs, persisted
titles or post anchors. Dedupe obvious URL/article copies; among bounded
distinct members, rank actual Source titles by centrality in existing vector
space, modest overlap of distinctive title terms, specificity, and a stable
URL tie-break. Use the winning title verbatim after safe display
normalization. A singleton uses its own title; an orphan retains its saved
title. Prefer a similarly representative headline in the UI language only
when available, without pretending to translate. This improves stability
and usually chooses a more central page, but is still a headline, **not** an
independently generated abstract Topic name.

For a genuinely new label such as "Russian military expansion" synthesized
from several differently worded articles, a non-LLM keyphrase/NER pipeline
could combine repeatedly supported names and terms. It would need separate
language/script handling, confidence thresholds and a fallback to a real
headline; otherwise it risks false claims or awkward labels. Multilingual
embeddings help recognize cross-language neighbors, but do not provide a
language-neutral textual label. A generative model is not mathematically
necessary, but a high-quality globally multilingual abstract title without
one is substantially harder than selecting a representative headline.

## Evaluation before activation

Run a pure synthetic/read-only comparison against the existing displayed
titles. Cover insertion-order stability, duplicate flooding, Source title
refresh, split/merge with reused Topic ID, Forget/orphans, manual pins,
translated and non-Latin headlines, different events about the same person,
negation/date/model-number conflicts, clickbait/blank titles and output
sanitization. Never use the label itself as grouping evidence or infer
historical source lineage. A separate owner decision is needed for a second
vector/model, title persistence or migration, or off-device title generation.

## 2026-10-08 offline proof of concept

The isolated [experiment](../experiments/topic-titles/README.md) now selects a
verbatim phrase only when 60% of distinct current members on at least two
publishers repeat three content words, including a small event cue. It
preserves negation, dates and model numbers from supporting headlines. With
no supported phrase it selects a real member headline; existing normalized
384-D page vectors can rank that representative across languages, with a
deterministic lexical fallback if any vector is missing or incompatible.
It uses no additional model, network, persisted vector, SQLite change or LLM.
Twelve network-denied synthetic checks cover EN/DE/NL/Cyrillic wording,
Japanese and script-control safety, cross-language vector ranking, duplicate
flooding and same-person/product different-event traps.

A read-only aggregate replay of the owner's local catalog found 85 provisional
learned Topics: 71 singletons, 13 pairs and one three-page Topic. The strict
phrase rule produced **zero** keyphrase titles; representative selection
would change six saved headings (five multi-page Topics and one stale
singleton title). This is a useful negative result: the
current catalog is too sparse and lexically varied for this conservative
keyphrase method to improve the user-visible heading often. The replay
reported only aggregate counts, not browsing history or titles. It is not an
independent accuracy evaluation. Vector medoid selection is a viable
non-LLM improvement, but still displays a page headline rather than a
language-neutral abstract Topic title. Do not activate either method until
misleading-label and read-time behavior are evaluated on a frozen,
provenance-approved multilingual set and the owner approves the new display
behavior. A broad unsupervised phrase generator without that evidence could
turn related-but-different events into a falsely specific shared label.
