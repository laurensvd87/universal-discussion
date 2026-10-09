# Local contrast gate v2: no development gain

Date: 2026-10-09. The reviewed, frozen code was committed and pushed as
`d7a102d` before its single C1+C2+C3 development run. It reused only the
synthetic A/B fit and calibration split, the packaged E5 title+384-character
lead surrogate, and the v3 40-step attention head. No independent holdout,
real data, provider or live app path was used. The runner emitted aggregate
metrics and code/corpus/model digests only; it saved no vectors or weights.

The double-support baseline reproduced its frozen result exactly: 84/270
true direct edges, 69/252 cross-language true edges, 0/5,508 false direct
edges, 2/18 complete events, and no mixed group. Calibration identified
three wrong-event pre-triangle attachment proposals and set a group-margin
cutoff of `0.03193985241997291`. On development, **zero** isolated reports
met the required two triangle-eligible links into one unambiguous existing
group. Thus v2 attached no report and changed no edge or group. Its
predeclared continuation screen (including at least four complete events
and strict gain over v1) failed. The v5 holdout remains unopened.

The result localizes this particular failure to candidate/support eligibility
before the new group margin can help. It does **not** imply that a looser
criterion would be safe: the calibration sample and fictional corpus are
small, and prior triangle-only development already made a false hard join.
Do not tune this v2 rule against the sealed holdout or activate it in the
product. No service, Topic, discussion, stored vector, extension or
permission changed.
