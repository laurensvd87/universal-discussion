# Frozen synthetic hard-case supplement

`corpus.js` contains 100 invented English title/lead articles in 20 distinct
families. It is an additional challenge set for the offline ADR-063 shadow
experiment, not a replacement for the previous 240-document training set.
The split is 50 train / 20 validation / 30 holdout documents, with entire
families isolated. Each five-article family has two opposing accounts of one
atomic development, two opposing accounts of a related but different
development, and one article with no partner. Cases include event stage,
research population, product update versus recall, public decision versus
construction, and related actor but unrelated subject. Headline and lead
styles vary deliberately. No provider output, web text or owner content was used.

Import `splits.train` and `splits.validation` for candidate development.
`splits.holdout` is sealed for root-only final scoring after the candidate is
fixed. A model sees only `{title, body}`; `id`, `split`, `family`, `topicId`, and
`stance` are evaluation metadata. The `c` topic in each family has no positive
partner and must be included in abstention measurement. The holdout must not
set weights, cutoffs, preprocessing or stopping conditions.

SHA-256 of `JSON.stringify(splits.<name>)`:

| Split | Documents | Families | Digest |
| --- | ---: | ---: | --- |
| train | 50 | 10 | `9c5da0e9d9767ba0d7a6343ce6a8bba7ba9a3e651e02e3c27598644b77024093` |
| validation | 20 | 4 | `e3ccbe14bf73621f1ae1c083ac08d286eb16d619715008fcb77a06aaf6c0e423` |
| holdout | 30 | 6 | `0b12b1cd12a1c691796d6a3870fc8829f300998aeb3fd901ce8d229815a93336` |

Run `node --test --test-isolation=none apps/local-service/experiments/topic-encoder/next-data/corpus.test.js`
from the repository root. This corpus is synthetic and cannot establish
real-page accuracy or a safe automatic Topic join.
