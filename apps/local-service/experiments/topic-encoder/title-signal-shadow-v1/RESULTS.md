# Owner-local exploratory result, 2026-10-10

The fixed read-only catalog contained 141 eligible provisional public Sources, or 9,870 possible pairs. The runner finished in 4.0 seconds on this machine; 3.0 seconds were packaged E5 title inference. It made no network request and saved no title vectors. These times include model startup and do not predict browser or large-catalog performance.

| Selected case | Raw E5 body cosine | Adapter body cosine | Title E5 cosine | Raw alternate group | Adapter alternate group |
| --- | ---: | ---: | ---: | --- | --- |
| Same article, French/Dutch De Standaard | 0.9511 | 0.9520 | 0.9468 | Together | Together |
| Grouped spending-versus-troop-expansion class pair | Within class range 0.8942–0.9482 | Within class range 0.8950–0.9479 | 0.8811 | Together | Together |
| Fountain category versus water-inlet product | 0.9397 | 0.9457 | 0.8639 | Apart | Together |

The spending-versus-troops class selector finds 23 pairs and one grouped pair in each alternate planner. The exact grouped pair's body cosine is deliberately not printed by this aggregate runner; the table gives its class ranges. The fountain selector finds exactly one pair. Neither selector is a general error detector.

Among adapter-grouped pairs with adapted body cosine at least 0.94, a title floor of 0.85 would reject one pair. A floor of 0.90 would reject seven; both named false joins score below it while the translated pair scores above it. The truth of the other affected pairs was not reviewed. Choosing 0.90 on these inspected examples would be catalog tuning, so this result does **not** recommend enabling that threshold. In particular, title E5 can still give similar scores to adjacent events and different scores to translations, short or vague headings, and headline rewrites.

Feasibility: title E5 contains a useful independent clue for the two named false joins, and inference is practical on this small snapshot. Before a production rule, evaluate a frozen title-aware policy on fresh multilingual labeled pages and count false grouped reach, translation recall, and per-page CPU cost. The current live matcher and the extension were untouched.

## Frozen 0.90 rule on existing held-out material

The same rule was applied once after the catalog run. Within each proposed group, members were retained together only when every pair's title cosine was at least 0.90. This deterministic split is a shadow approximation of a title gate; it does not alter the planner or any app route.

| Existing set and method | Correct grouped pairs before → after | False grouped pairs before → after | Pure multi-page reach before → after |
| --- | ---: | ---: | ---: |
| Synthetic v6, raw E5 | 2 → 0 | 0 → 0 | 4 → 0 pages |
| Synthetic v6, diagonal | 7 → 0 | 0 → 0 | 14 → 0 pages |
| GlobeSumm selected test, raw E5 | 6 → 6 | 0 → 0 | 12 → 12 pages |
| GlobeSumm selected test, diagonal | 7 → 7 | 0 → 0 | 14 → 14 pages |

The synthetic v6 set has 60 five-language reports and 120 true same-event pairs. Body inference took 6.3 seconds, title inference 1.7 seconds, and both planner/filter passes under 0.1 seconds together. The selected GlobeSumm set has 293 articles and 1,710 true same-event pairs. Body-prefix inference took 155.9 seconds, title inference 6.7 seconds, and each planner/filter pass under 0.3 seconds. The real set's planner grouped very few pairs before the title check, so its unchanged counts do not show that 0.90 is safe. Neither held-out set showed a false group to remove.

**Decision:** Reject a blanket 0.90 title floor. It removes every correct group the planner found in the multilingual synthetic set. The positive catalog examples are insufficient to justify activation, and the GlobeSumm test has too little baseline coverage to rescue this rule. These sets and this title choice are not a fresh independent quality gate. A future title signal would need a design that tolerates multilingual paraphrases and vague headlines, with a separately frozen evaluation before product use.
