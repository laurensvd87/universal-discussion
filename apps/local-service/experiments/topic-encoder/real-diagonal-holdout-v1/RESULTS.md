# One-shot diagonal-protocol result on a previously used real split

Date: 2026-10-09. The exact runner, source/asset hash manifest and Pareto
criterion were independently reviewed, committed and pushed as `9d02efc`
**before this diagonal protocol scored** the selected private GlobeSumm test.
The post-commit dry-run verified all 24 reviewed source/asset hashes without
opening private data. The one authorized local run then verified the private
corpus size and SHA-256 from ADR-065, fit 384 diagonal parameters in RAM on
475 of 749 selected train articles, calibrated on the other 274 train
articles, and scored the **293-article test once for this protocol**. The
150 already-used validation articles were not embedded or scored by this
runner. Critical provenance correction: the **same 293-report split had
already been opened** in the earlier
[GlobeSumm graph comparison](../globesumm-graph-v1/RESULTS.md).
It was not a fresh independent holdout, contrary to the frozen protocol's
README wording and the initial progress report. The split is definitively
**spent** for adapter selection: do not tune or rerun against it.

| Frozen test metric | Separately calibrated raw E5 | Diagonal adapter |
| --- | ---: | ---: |
| Pure multi-page group articles | 74/293 | **148/293** |
| Correct grouped pairs, including transitive | 82/1,710 | **343/1,710** |
| Correct direct edges | 60 | **239** |
| False direct / grouped pairs | 0 / 0 | 0 / 0 |
| Articles exposed to a mixed group | 0 | 0 |
| Other correct pages per possible root, mean | 0.56 | **2.34** |
| Complete events | 0/24 | 0/24 |

The preregistered ADR-069 *research* rule is met on these reused cases:
both useful-reach measures improved, and no observed false direct/grouped
or mixed exposure increased
over E5 on the same cases. This is an event-disjoint comparison over
the **title-plus-384-lead E5 research baseline**, not the currently live
body-derived browser vector. The test has 24 labeled event groups, 1,710
same-event and 41,068 different-event pairs; 8,918 of the latter are marked
hard. All admitted correct edges and grouped pairs here are cross-language.
There are 293 distinct exact title/lead keys, but these do **not** establish
293 independent publishers; duplicate-adjusted exact-input counts equal the
article counts only for that limited key definition.

Important limits: prior exposure of this exact test split prevents an
independent confirmation claim, even though this particular diagonal method
and relative rule were frozen before their one run. The adapter's *training
calibration* had zero eligible negative candidates and used its frozen zero
contrast floor, whereas raw E5
had two. Observing no false group among 41,068 different-event test pairs
is encouraging but does not establish a reliable false-join rate for future
sites or viewpoints. GlobeSumm labels may reflect broader story groups rather
than this app's principal-event Topic boundary. The split is event-disjoint,
not verified publisher-family-disjoint; independent-publisher and opposing-
viewpoint labels are unavailable. Root-route churn was not measured. No
complete event was recovered; that metric
was diagnostic under the owner-approved relative rule, not a hidden veto.
The earlier frozen validation screen remains failed, not retroactively passed.

No article text, URL, row label, vector or weight was printed, saved, sent to
a provider, committed or activated. Source and model hashes were checked before
the private file was opened. The packaged E5, live Topic policy, retained data,
Source-root routing, extension and discussions are unchanged. GlobeSumm's
publisher rights do not authorize shipping these trained weights; a separate
rights/Trust and explicit owner activation/migration decision is still needed.
The next useful evidence is a **genuinely fresh**, provenance-reviewed
cross-publisher and viewpoint-aware set rather than further tuning to this
spent test.
