# Offline Topic-title keyphrase experiment

This is a pure proposal over the **current** Sources of one learned Topic. It
does not alter grouping, saved titles, Topic IDs, source lineage, post anchors,
the service, or extension. Run its network-denied check from the repository root:

```sh
node --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none experiments/topic-titles/keyphrase-title.test.js
```

`titleForCurrentMembers(sources, savedTitle)` deduplicates exact/tracking URLs
and identical headlines on one publisher, then scores actual member headlines
by shared distinctive words. If **every** deduplicated member has a valid
normalized 384-dimensional vector in the existing E5 page model space, it
instead scores each headline by mean pairwise cosine to the other members.
Neither score changes membership or implies same-event identity. A missing,
mixed, or malformed vector sends the entire cluster to lexical ranking.
This is the representative-headline baseline.
The proposal replaces it with a verbatim contiguous phrase only if at least
60% of distinct members and two publishers use the exact same three or more
content words, including a word from a small EN/DE/NL/Russian event-cue list.
This conservative list suppresses broad shared person/product phrases; it
does not classify events. Blank headlines are ignored; a small English
clickbait pattern loses a representative tie. It does not translate, infer
named entities, or combine words from different pages. Numeric identifiers
and negations cannot be trimmed off a supporting headline. Ties use stable URL
and lexical order. An empty member set returns the saved title; a singleton
returns its Source title. Input is capped at 200 members before scoring;
the vector path is O(members × 384), and the lexical path is bounded O(members²).
The cap throws instead of publishing a partial-cluster label.

| Fixture cluster | First-source headline baseline | Proposal |
| --- | --- | --- |
| Three English Berlin flood reports | `Berlin flood warnings prompt school closures` | `Berlin flood warnings` (3/3) |
| Two Dutch storm reports | `Amsterdam krijgt nieuwe waarschuwing voor zware storm` | shared verbatim `waarschuwing voor zware storm` phrase (2/2) |
| Anna Keller election, film, memoir | first election headline | representative real headline; no keyphrase |
| Astra Phone X20 review, repair, price | first review headline | representative real headline; broad shared product phrase rejected |
| EN/DE/NL translated flood reports | first English headline | representative real headline; with supplied valid synthetic vectors, central German headline; no translation |
| Conflicting negation, date, model | first member headline | representative real headline; no keyphrase |

Twelve focused tests pass with the repository's external-capability denial
harness. The phrase output is deliberately sparse. Exact wording cannot bridge
translation or paraphrase. Even a shared event-cue phrase can describe
different events, such as two flood warnings for the same place at different
times without dates in their headlines. Mark such output **unsafe as a
same-event claim** until independent evaluation; the title is only a provisional
label. Synthetic vector geometry in the test does not establish multilingual
embedding quality or event identity. `Intl.Segmenter` behavior varies by language and runtime;
the Japanese test checks that output stays within source wording, not that it
finds a useful phrase. Display cleanup strips controls and bidi directives
while preserving ZWJ/ZWNJ needed by scripts such as Persian and Indic.
This is not semantic identity evidence. Before any
production title change, evaluate on a frozen, provenance-approved multilingual
real-page set with independent same-event and misleading-label judgments, and
review read-time performance and title/UI provenance. Any persisted title or
second-vector change needs its own decision gate.
