# Independent topic challenge v7

This directory contains project-original synthetic prose for topic-matching research. All names, institutions, places, products, measurements, and events are fictional. The records were authored for this holdout; they were not scraped or adapted from external articles.

| Measure | Count or note |
| --- | --- |
| Records | 60 |
| Atomic topics | 12, each represented once in each language |
| Languages | 5: English, Dutch, French, German, Spanish |
| Families | 6, with two topics per family |
| Model used to draft | Luna Low |
| Model scoring | None; no models were scored |
| Human language validation | Not performed |
| Independent publisher gold labels | None |
| Intended use | Qualitative research holdout; not for training or calibration |

## Topic and family map

| Family | Topics | Distinction |
| --- | --- | --- |
| `V7-Meralis-council` | `V7-topic-01`, `V7-topic-02` | Same council; separate bus-stop relocation and library-roof decisions |
| `V7-Aster-Vale` | `V7-topic-03`, `V7-topic-04` | Same brand; Lumen 4 and Lumen 3 generation/model stories |
| `V7-Hallowmere` | `V7-topic-05`, `V7-topic-06` | Separate studies of different approaches to sleep-onset difficulty |
| `V7-Lethen-board` | `V7-topic-07`, `V7-topic-08` | Same district authority; separate floodgate and fire-station projects |
| `V7-Hesper-board` | `V7-topic-09`, `V7-topic-10` | Same transit board; bus-fare subsidy and overnight-shuttle cancellation |
| `V7-Talven-Slate` | `V7-topic-11`, `V7-topic-12` | Same product line; distinct Slate 4 and Slate 5 generations |

Each JSONL record has exactly these fields: `id`, `title`, `body`, `topicLabel`, `family`, `lang`, and `viewpoint`. Titles are at most 200 characters; bodies contain 100–160 whitespace-separated words. Structural checks confirm 60 unique IDs, 12 topic labels with exactly one record per language, and six families with exactly two topics each. The label and family values are metadata, not prose cues.
