# Real root / semantic detail challenger

Implemented but NOT frozen, run or activated. C: disk reserve and Windows admin
consent currently block large runs. Read ADR-135/136 and top STATUS/HANDOFF first.

Inputs: independent public article metadata TRAIN48/CAL48/TEST32; root-only labels
never become child negatives. New root model has exactly16roots, fixed lambda.1.
Two body constructions are selected/calibrated only on TRAIN/CAL. Four reserved
test cases have independently verified terminal paths; all other child outcomes
remain unscored. Purposive Wikipedia-only evidence is not a98%web-scale proof.

Prerequisites: complete/freeze the separate observed347 experiment without
reopening any older cohort. This runner verifies its frozen policy/code receipts
and reuses only C's unchanged weights/input transform. No details are retrained.

After root review and safe reserves, the intended order is:

1. Supervised `--freeze` here; every source and input metadata identity is pinned.
2. Supervised public capture `--traincal` in the separate data wrapper.
3. Supervised `--encode-traincal`, then `--fit-calibrate` here.
4. Use the exact generated selection-receipt SHA for separate public `--test`
   capture. No test input before model/policy/body construction selection.
5. Supervised `--encode-test`, then `--test` here, once.

The public capture supervisor is
`data/hierarchy-real-root-capture-adr136-supervise.py`; this directory's
`supervise.py` runs model-only phases with external capabilities denied. Both are
inert without explicit fixed switches, have exclusive markers and strict own-child
memory/time/host/disk limits. Never relax guards or repeat claimed test phases.

Generated captures, vectors, model/policy and the fixed external selection receipt
stay ignored on D:. Hash-linked evidence is rechecked before publication. Results
separate coverage, root errors, four limited specificity anchors, missing inputs
and classifier timing (excluding capture/compile/encoding/queue/database).

Independent root support is required before any detail refinement. Owner depth
remains presentation-only and cannot invent confidence or move old thread routes.
No canonical migration, runtime hook, provider request, post or crawler action.
