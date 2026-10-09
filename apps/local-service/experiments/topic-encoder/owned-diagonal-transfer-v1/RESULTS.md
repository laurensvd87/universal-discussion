# Owned synthetic diagonal transfer v1 — aggregate result

2026-10-09. The independently reviewed protocol was frozen and pushed in
`8d5e8db` before its one private run. Four fictional tests and the content-free
dry run passed. The run used only project-authored A (108 reports) for the
RAM-only diagonal fit and project-authored B (108 reports) for separate
calibration of raw E5 and the adapter. The already-used GlobeSumm validation
slice supplied 150 exploratory comparison reports; its 293 selected test
reports were **not** embedded or scored by this runner. No weights, page text,
URLs, titles, vectors, or row-level results were saved or printed. No provider
call or live Topic change occurred.

| Same 150 title/lead reports | Raw E5 | Owned diagonal |
| --- | ---: | ---: |
| Synthetic-B negative candidates for calibration | 71 | 53 |
| True direct/grouped pairs | 0 | 1 |
| False direct/grouped pairs | 0 | 0 |
| Articles in pure multi-page groups | 0 | 2 |
| Mixed groups | 0 | 0 |
| Complete events | 0 | 0 |
| Singleton groups | 150 | 148 |

There were 803 gold same-event pairs and 10,372 different-event pairs in this
slice. Its 150 inputs were distinct by exact input, but that does not establish
independent publishers. The one admitted pair was cross-language. Root-route
churn, publisher/viewpoint coverage and live body-E5 parity were not measured.

The narrow predeclared *relative coverage* check is true: one additional
correct pair/two additional reached pages with no observed increase in false
exposure. This is not an operationally meaningful recall improvement or a
pass of full ADR-069 quality criteria. This setup transfers at almost no
useful coverage; the experiment does not isolate whether the representation,
synthetic-B calibration or graph rule caused the shortfall. Zero observed
false pairs at this nearly empty admission rate says
little about safe precision at useful coverage. Do not activate or ship this
adapter. The validation is now spent for this candidate; do not tune against
it. Future work needs a fresh provenance-reviewed, rights-controlled set and
an E5-relative comparison at useful coverage, including live-input and
root-route checks before any product decision.
