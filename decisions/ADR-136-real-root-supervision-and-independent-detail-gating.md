# ADR-136: Real root labels, captured input views, independent detail gating

Date: 2026-10-19. Status: IMPLEMENTED EXPERIMENT, NOT RUN OR ACTIVATED.

## Reason

Broad C's synthetic precision does not establish real-page quality. Its fixed
120-source development transfer has25compatible roots among32assigned clear
cases. Rather than tune on that consumed sample, add independently article-read
real training/calibration inputs and a separate reserved test. No new provider
request, owner post, canonical write or crawler action is authorized by a score.

## Data and labels

Three distinct public Wikipedia entities per root for TRAIN48, three per root
for CAL48, and two per root for TEST32 across the16candidate house roots. The
training/calibration files have EN10/DE10/NL10/FR9/ES9 each. Article leads and/or
substantive sections were read through primary web sources; these are not title-
only occupation guesses. Translated aliases/whole entities were screened against
each other, the old120DEV inventory and the independently curated32articles.
No owner-inventory titles or URLs were sent as external research queries.

Original web01..04 are input-development diagnostic cases and excluded from the
new quality test. Keep web05..32, adding four independently verified replacements:
GTA V, Azul, Koala and Phalaenopsis. Test root labels are balanced across16roots.
Only those four new terminal anchors receive separate specificity assessment;
unannotated descendants in every other case are UNSCORED, not fabricated
positives/negatives. Root-only training/calibration uses a16-root-only model,
NEVER the63-node fitter with invented child negatives.

Pinned local metadata files under `apps/local-service/data/`:

| File | SHA256 |
| --- | --- |
| hierarchy-real-root-training-gold-adr136.json | 62ff96d3b98d197c4c90ea2db7f5a9adb7615bf8e18fce7f66c3c1681b1f53e8 |
| hierarchy-real-root-calibration-gold-adr136.json | 8b755d8ae214de78f51005f547cb074655382cd2fb0fc0cf99b8f2e9bba76cfc |
| hierarchy-curated-web-gold-adr134.json | 4119a66986e9d73fd564eb83637ba92f7c5305c316037b7c609b27ca78488933 |
| hierarchy-real-root-test-supplement-adr136.json | 76cd1484c84e6305e1b2cd283d389eb6d1f8c9fdfbb86e72d31cb04d8067bd86 |

All metadata is purposive Wikipedia-only curation, not representative web quality,
independent population sampling or98%proof. Captured feature/revision identity is
still required; the label file alone is not a model input or canonical proof.

## Model and input choice

Keep the frozen broad C weights, exact paired E5 transform (.75body/.25title),
encoder/tokenizer contracts and all earlier closed cohorts unchanged. A NEW
root-only ridge classifier uses fixed lambda.1. Compare current static-prefix
capture against the explicit Wikipedia prose lead; both body constructions are
bound by their code hashes. Every TRAIN48/CAL48 row must be available for a view;
no row dropping or input fallback. Observed root cutpoints require3accepted groups
and empirical calibration precision1. Select only on CAL correct assigned roots,
then declared current-static prior order. Calibration is optimization data.

An independently supported unique root is mandatory. The frozen C weights with
the separately calibrated observed347 detail policy may refine only inside that
same root. Detail disagreement/rejection returns the supported root; root
rejection cannot be rescued by a child. Both model and policy identities, exact
paired namespace and detail-policy mode are bound by the consensus hash. The
module also supports the original fixed detail policy for explicit comparisons.
Scoring is bounded by16root+128detail heads (55296scalar products), not the number
of stored pages. This is a work bound, not measured application latency.

## Collection and evaluation fences

Capture96TRAIN/CAL pages separately from32TEST pages. Fixed five Wikipedia HTTPS
origins/explicit compiled URL whitelist, existing DNS-pinned public fetcher,
robots/TDM/noindex checks, at least2s origin pace,15s request/360s collection
deadline,2MiB responses, no redirects/retries/links/app/crawler/DB/model state.
Retain only bounded current/lead text, actual title provenance, hashes, revision
evidence and CC-BY-SA attribution; never full HTML. A partial collection failure
retains the successful prefix truthfully; it is not complete evidence.

TEST capture requires the exact fixed global selection receipt SHA and schema/
phase/finalTestEvaluated:false, sealing model, policy and selected body construction
before any test feature is opened. The model runner has no network capabilities.
Vector transport preserves binary64/signedzero. Initial encoding receipt, capture
and used packet hashes are retained and rechecked before publication, not replaced
by hashes of later bytes. All three methods are evaluated once on the same32:
root-only, root/detail consensus, and unchanged fixed-C baseline. Missing selected
test inputs remain unresolved; no replacement or alternative-view fallback.

Resource supervision: one own child,1536MiB RSS/private commitment,1024MiB host
reserve, C768MiB/D512MiB reserves; model phases180s, network collection360s. No
resource-guard weakening. Exclusive markers begin only after reserve preflight.
No actual freeze, capture, encoding, fitting, calibration or test phase has run.

## Checks and current blocker

Root independently ran40light checks across capture10/assessor10/manifest1/
root-detail11/stored-byte-verifier8. Independent Trust ran22manifest/assessor/consensus checks and
reviewed the immutable evidence linkage correction. These are analytic/fixture
checks, NOT model quality, browser UI or live app validation. Revised seven-test
shadow bridge still awaits a resource-safe PGlite rerun. Its initial five tests
passed before the later publication/binding-fence hardening.

C: had209,866,752B free at21:53Z after the update cache refilled; new large runs are held.
Windows servicing subsequently stopped. A new copy of the already approved,
exact Download-cache-only cleanup helper passed long-path scope tests. Its
RunAs launch is waiting for Windows administrator consent (consent.exe12796 in
session1 observed21:43:32Z); helper not started/result absent, no second deletion
or service/settings change yet. Exec session23123 owns the waiting launcher.
No seven-day update pause was made; that optional owner question is pending.

## Integration still required

No registered schema/API/worker/UI or hierarchy activation yet. Old roots do not
generally retain recoverable original raw E5/title/version; fixed references are
Ridge-space only. Do not backfill historical Source membership from a changed
current Source. New root creation must atomically bind exact generation/Source
input/incarnation/artifact witnesses while preserving original destinations and
existing canonical checks. Source forget removes hierarchy dependencies, not
canonical posts. Shadow metadata never supplies write/provider authority.

The live crawler cannot decode a new admission policy; any ingestion error stops
its apply loop. A separate asynchronous question requests permission for one
future graceful saved-state consumer upgrade, ONLY when a reviewed cutover is
ready. No stop/reset/duplicate or fake Ridge policy while permission is pending.
API19868/worker36616/dashboard6644/crawler26616/schema9/ADR128seal stay unchanged;
latest crawler1297ingested/stderr0 at21:55Z and advancing. Goal is not complete.
