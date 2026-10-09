# Independent multilingual synthetic Topic holdout v1

This directory contains 80 fictional article-like records: four fictional event families, two successive but distinct developments per family, and ten records per event (five languages by two viewpoints). The stable `event_id` is the language-independent gold event label. Localized titles and prose are provided for English, German, Dutch, French, and Spanish.

## Provenance and use

The records were authored synthetically by an LLM in this coding session from an original prompt. No webpages, real article text, external search, provider calls, evaluation-model inference, or matcher results were used to create or validate them. The towns, institutions, people, programs, events, and amounts are invented. This is a deliberate independent holdout; it has not been scored. Keep it sealed until a one-shot evaluation is planned.

The writing is plausible but not professionally translated or independently fact-checked. Some language may be less idiomatic than native journalism, and short generated examples cannot represent the variety of real news. Structural checks validate IDs, coverage, uniqueness and pair titles, but cannot certify semantic equivalence, viewpoint quality, or independence of authoring. Review those limitations when interpreting any later result.

Viewpoint labels are counterbalanced across language within each event: each language has one supportive and one questioning framing. The framing changes the article narration and emphasis; it is not intended to change the central event facts. Event pairs share an actor/institution but describe distinct actions or stages, as summarized here:

| Family | Earlier development | Later, distinct development |
| --- | --- | --- |
| F01 Merehaven | Six-week removable floodgate trial at east quay | Council funds a permanent steel barrier |
| F02 Lindenport Transit | Three-month late Route 8 pilot with four added stops | Staffed, illuminated shelters and call buttons at four stops |
| F03 Redwillow school district | Twenty-bed rooftop garden at North School | Two more campuses receive twelve beds each and weekly workshops |
| F04 Stonebridge Public Library | Monthly volunteer repair café begins | 120-item, seven-day tool-lending collection opens |

## Integrity check

Run `python check_integrity.py` from this directory. It is structural-only and does not load a model or score records. Result at authoring time:

`PASS: 80 unique IDs; 8 events; 4 families; 10 records/event; both viewpoints in all 5 languages/event; 80 distinct normalized texts; adjacent developments distinguished; no URLs/source fields.`

SHA-256 (UTF-8 files):

- `records.json`: `A6F1917A33E44BD80F50366DD1FE5290B576247F61DD83BCC3531BEE3C137B3A`
- `check_integrity.py`: `006DF1D98D8728D9329B5CB543D6998467F006F3E52CBC929286FCF7347E9D6B`
