# Multi-page grouping shadow

This is an offline, synthetic comparison of the production planner's global
`0.04` competing-page margin and three small alternatives. It imports the pure
production planner for the `current` result, but does not edit the planner,
database, Topics, or discussions. Run from repository root:

```sh
node --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none apps/local-service/experiments/topic-encoder/grouping-shadow/evaluate.test.js
node --import ./spikes/topic-resolution/harness/deny-external-capabilities.js apps/local-service/experiments/topic-encoder/grouping-shadow/run.js
```

The fixtures begin with opposing headlines about a single April 2 tariff
announcement, then add a stronger vector neighbor about April 9 exemptions.
That three-page case sets the true pair to cosine 0.90963 and the wrong
neighbor to 0.91400, matching the shape of the owner's observed ambiguity.
Another case has three views of only one event; the crowd case adds five more
views; the last case adds two articles about April 9 exemptions. Each item has
an invented, unit-normalized
384-dimensional vector with only its first two coordinates nonzero. Angles
create controlled pairwise cosine scores; these are **not** E5 output or
observations of the named publishers. The publisher-like labels are illustrative.
The `event` label is used only to score the outcomes.

| Scenario | Rule | Same-event pairs joined | Cross-event pairs joined | Groups |
| --- | --- | ---: | ---: | ---: |
| 3 pages, stronger wrong neighbor | Current | 0/1 | 0/2 | 3 |
| 3 pages, stronger wrong neighbor | Complete link .90 | 0/1 | 1/2 | 2 |
| 3 pages, stronger wrong neighbor | Title cue + complete link .90 | 1/1 | 0/2 | 2 |
| 3 same-event views | Current | 0/3 | n/a | 3 |
| 3 same-event views | Complete link .90 | 3/3 | n/a | 1 |
| 2 opposed views | Current | 1/1 | n/a | 1 |
| 7 same-event views | Current | 0/21 | n/a | 7 |
| 7 same-event views | Complete link .90 | 21/21 | n/a | 1 |
| 7 same-event views | Complete link .94 | 9/21 | n/a | 2 |
| 9 pages, 2 developments | Current | 0/22 | 0/14 | 9 |
| 9 pages, 2 developments | Complete link .90 | 10/22 | 6/14 | 2 |
| 9 pages, 2 developments | Complete link .94 | 10/22 | 0/14 | 3 |
| 9 pages, 2 developments | Title cue + complete link .90 | 22/22 | 0/14 | 2 |

Complete link requires every cross-pair in a proposed merge to exceed the
threshold, without comparing to unrelated outside pages. The title-cue variant
also requires a matching tariff action and date parsed from each retained title.
That deliberately narrow cue shows that event evidence can break the ambiguity
in this fixture. It is not a general title parser or a validated production
rule: missing dates, paraphrased actions, translations, and misleading titles
would change its result. The vector-only alternatives expose the other side of
the tradeoff: removing the global margin alone can falsely merge adjacent
developments. Pair counts are correlated within these tiny hand-designed
fixtures. No real-world precision, recall, or safe rollout threshold is inferred.
In particular, the owner's actual Guardian/Fox headlines do not contain the
explicit date/action pattern required by this title-cue comparator; it would
abstain on that pair. The comparator demonstrates the *kind* of additional
event evidence needed, not a fix for the observed pages.
