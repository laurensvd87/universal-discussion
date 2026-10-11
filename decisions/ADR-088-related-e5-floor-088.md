# ADR-088: Raise learned related-page retrieval to 0.88

Date: 2026-10-11.
Status: owner-approved parameter change; implemented, verification below.

## Decision

Following the fittingstore/eBay/Meross diagnosis, the owner requests a threshold
of **0.88**. This applies to the learned-page **original E5 related-retrieval
floor**, previously 0.85, in `discussion-service.related`. It does not change
Ridge1's installed same-Topic floor (0.8639003810829322), its coefficients, the
canonical adaptive grouping policy, or the synthetic ranker's 0.65 default.
This interpretation addresses the related-candidate failure discussed immediately
before the request; it is not a new same-Topic model calibration.

The diagnosed eBay coupling cosine, 0.899432, remains eligible. The unrelated
Detrius Meross cosine, 0.853251, no longer qualifies. Cosines are not confidence
probabilities. The stricter floor can remove useful related pages too; it is a
reversible owner-selected trade-off, not proof of correct product identity.

Keep the existing inclusive comparison and manually confirmed same-Topic
override. Source identity/model/extractor checks, URL deduplication, result
bounds, public DTOs and immutable read behavior are unchanged. Both related
discussion reads and Insight candidate preparation use the service's shared
retrieval path; neither gains new write, generation or publication authority.

## Remaining limitation

The related-discussion loader still reads candidate current Topics, not all
historical Source-anchored discussions. eBay's four earlier roots across three
Topics therefore need not appear merely because eBay qualifies. This change
does not migrate posts, join fittingstore/eBay into one Ridge Topic, or implement
the separate proposed historical-related read improvement.

## Verification

Synthetic service tests cover below/at/above 0.88, the diagnosed cosine band,
no score/vector disclosure, unchanged stored state and manually confirmed
same-Topic inclusion below the floor. Focused learned/domain: **28 pass**;
full capability-denied service suite: **439 pass, four optional skips**.
Running-service verification and final repository checks are recorded in STATUS.

No new provider request, capture, retained vector, permission, account, deployment
or release approval follows. A normal service restart loads the changed floor;
existing pairing, protected login, SQLite mappings and posts remain intact.
