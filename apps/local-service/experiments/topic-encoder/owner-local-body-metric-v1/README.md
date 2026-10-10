# Owner-local BODY metric artifact preparation

This inert installer and strict artifact loader prepare the frozen
`within-shrink-50` BODY E5 transform under ADR-071/072. They have no production
import and do not activate a planner or change canonical E5 coordinates.
Lead and independent Trust review precede execution/integration.

The fixed private input is OS TEMP `udl-globesumm-research-20261008/news_only.json`
(14,972,999 bytes, pinned SHA-256). The unchanged frozen helpers reconstruct
the same 475 fitting reports, embed only normalized BODY-prefix input with
packaged pinned E5 assets, then fit mean and regularized within-event covariance
in RAM. Nothing is downloaded or sent to a provider. No text, individual
vectors, titles or labels are saved. No SQLite file is opened.

After review, the explicit command is `node experiments/topic-encoder/owner-local-body-metric-v1/install.js`
from `apps/local-service`. It accepts no path overrides. It exclusively creates
the fixed ignored `data/body-topic-metric-v1.json` (384-dimensional mean plus
73,920 row-major lower-triangular Cholesky values). Existing valid artifacts
are verified and retained; invalid ones fail closed and are never overwritten.
Console output contains only bounded non-content identity/status metadata.

The artifact records BODY fit representation, 475 fit reports, private corpus
hash, frozen fitting core hash, model and tokenizer hashes, and a canonical
manifest SHA-256. Arrays and fields are validated and copied before freezing.
The loader accepts only regular bounded files up to 2 MiB without symlink paths.
A transform closure validates and hashes the artifact once; each subsequent
call validates a normalized 384-dimensional E5 vector, solves the triangular
system, and returns a separate immutable unit vector. It exposes no weights DTO.

This installs fitted coordinates only. Research support-graph results are not
evidence that any production radius/complete-link admission policy is safe,
and no default promotion, release, rights clearance or distribution follows.
