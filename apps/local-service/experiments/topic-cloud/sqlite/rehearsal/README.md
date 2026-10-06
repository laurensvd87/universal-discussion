# Synthetic v2 normalization rehearsal

Run from `apps/local-service` with Node 24:

```sh
node --import ../../spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none experiments/topic-cloud/sqlite/rehearsal/rehearsal.test.js
```

This isolated first slice creates its own `topic-cloud-synthetic-rehearsal-*` OS-temp directory and accepts no caller-selected database path. It validates a freshly created `demo-state/v2` row, normalizes current Topics, Discussions, Sources, one vector per Source, links, contributions, revisions, origins and root anchors, then validates an exact reconstructed state before committing. Injected failures roll back the old JSON row and all new tables. A successful conversion drops the synthetic old row and refuses the old reader. Cross-kind ID collisions and changed table definitions fail closed in this rehearsal. A separate synthetic Forget transaction now pins a learned-Source root to its current Topic, clears matching root/reply origins, deletes the Source/link/vector, increments the revision and validates the projected state. Stale generation/revision pairs and injected failures leave the committed normalized state unchanged. No owner data, network, provider or production code is involved.

Limitations: this is a conversion and narrow Forget proof, not a production schema or cutover. The synthetic factory copies the current service's legacy `CREATE TABLE` text; a later service DDL change must be reviewed separately. It does not implement `/v1` conversion, full learned-Source/AI fixture coverage, candidate edges, a persistent global cross-kind ID registry for future writes, general write commands, Clear/withdrawal mutation, adaptive Topic replanning, pagination, scale benchmarks, post-commit recovery or backup policy. It uses current application validation for domain invariants at checkpoints; SQLite constraints alone are insufficient. Its path guard controls only the output location and does not verify that caller-supplied state is synthetic. Callers must supply invented state; no retained owner state or owner database should be passed to this code.
