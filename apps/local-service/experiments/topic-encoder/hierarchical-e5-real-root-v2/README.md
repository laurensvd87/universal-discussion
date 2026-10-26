# Real-root input construction v2 — review before execution

This separate namespace repairs only the experiment collector's handling of one
fingerprinted published Dutch Wikipedia robots DENY line containing a space.
The raw-byte and decoded-text fingerprints, origin and exact full line must match.
The space is retained as `%20`; the DENY rule is not dropped. This is not a claim
that RFC rules require this repair or a production crawler policy change.

V1 is frozen and untouched. Its partial train/cal collection (2 of 96 articles)
remains diagnostic evidence. Its model and final-test phases never ran. Do not
splice those two captures into v2, reuse old attempt markers, or automatically
retry. A fresh 96-article collection requires explicit review and authorisation.

The learning method is unchanged: the same pinned 48 training, 48 calibration and
32 test articles; 16 root-only heads; lambda 0.1; 0.75 body / 0.25 title fusion;
the same two capture views; CAL-only view selection; unchanged closed C weights,
observed D detail policy and fixed C baseline. Four separately verified partial
specificity anchors remain the only child-scored cases. No new gold, policy search
or model approach is introduced. The original v1 manifest and pure assessor are
imported only through explicit byte-pinned dependencies.

New capture/selection metadata uses version 2 and ADR137 data paths exclusively.
The selected input-construction hash binds the v2 collector, exact repair source,
wrapper/supervisor and unchanged production fetch/robots/static-extraction sources.
There is no old-version capture or receipt fallback. Model phase artifacts and
exclusive one-shot markers belong only to this directory. The model supervisor
requires `MURMINGLE_REAL_ROOT_V2_SUPERVISED` for its fixed child, retains one thread,
heap/RSS/commit/reserve/wall/log guards and refuses existing phase evidence.

`run.js` and `supervise.py` default to no action. No freeze, collection, embedding,
fit/calibration or test is authorised merely by adding these files. The stored-only
verifier defaults inert; `--verify-local` requires existing complete evidence and
recomputes arithmetic from saved decisions without invoking a classifier.

This is handpicked multilingual Wikipedia feasibility work, not representative
web accuracy, a 98% gate, activation, canonical assignment authority or permission
to use providers, owner databases, or alter the running crawler.
