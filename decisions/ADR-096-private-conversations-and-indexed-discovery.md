# ADR 096 Private conversations and indexed discovery

Date: 2026-10-11

Status: Owner-requested local implementation verified and active, extension 0.13.50.

## Scope

The owner requests a lock before sending a new conversation, private replies
between the account and its connected assistant, and a Discover tab searching
discussions and linked pages. This is an owner-local feature, not hosting,
store submission, a crawler or public-release approval.

## Private conversations

Visibility is chosen on an unsent new root and becomes immutable when accepted.
All descendants inherit it. Private conversations use a separate SQLite store;
their bodies, titles, counts and identifiers do not enter canonical public
Topics, projections, the dashboard or discovery. Every private operation needs
device pairing, exact extension Origin and a named active app account. Ownership
comes from the authenticated account, never a caller-supplied owner identifier.
The server and local operating-system administrator can access stored data;
this is access-controlled privacy, not end-to-end encryption.
Deletion removes live database records, not a forensic erasure guarantee for
disk pages or previously made backups.

An accepted human reply directly to that account's own generated private message
authorizes one assistant attempt. Persist a unique invocation claim before
dispatch. Duplicate sends, polling, reopened panels, restart and generated
messages cannot trigger another attempt. Failure or interrupted execution can
produce no answer; there is no automatic retry. Public conversations keep their
existing deliberate generation behavior.

Generation uses the existing connected ChatGPT account/model and research
preference. Private context is bounded to the accepted human message and its
selected AI parent, at most 2,000 characters each, plus the existing eligible
public-page prefix (4,096 characters), selected public links (at most five) and
approved language/market preferences. This does not authorize private webpage
capture or full conversation history. Private requests suppress raw prompt and
response debugging even when public debug mode is enabled. Generated bodies
and citations retain the existing strict provider validation.

Private conversation identity, owner, message revision and eligible public
Source anchor are checked before generation and acceptance. Private storage
never invokes the canonical public-share command. Own-data export includes
private data through bounded pages. Staged account deletion disables sessions,
cancels jobs, withdraws public contributions, erases private data and then purges
identity; startup resumes interrupted deletion before serving requests.

## Discover

Use a separate derived SQLite FTS5 index containing only public Topic titles,
safe Source metadata and current visible public message text. Index startup
once and update on canonical changes, not by scanning the catalog for each
search. Compare the index watermark with cheap canonical version metadata
before reads; a mismatched index must reconcile or fail closed so removed text
is not exposed. Queries and snippets are bounded, SQL is parameterized, user
input cannot supply raw FTS grammar, and pagination is revision-bound.

Discover is available to paired readers without an app login. It does not
change the active page's Source, Topic or write authority. Page links open their
public destination; discovered conversations are read-only until the existing
normal page/context rules establish a posting destination. Private chat data
is never indexed, including for its owner.

FTS provides indexed search suitable for growing collections. The existing
canonical whole-document store still has an 8 MiB limit and bounded public
read DTOs; this feature does not remove those ingestion/storage constraints.
Normalized paged canonical storage and a hosted database remain future work.

## Verification

Require focused storage, cross-account and Origin tests; private export/deletion
and restart/idempotency checks; provider mocks proving one-attempt dispatch and
debug suppression; index freshness/deletion/pagination and large synthetic-index
checks; browser-client and real Chromium layout/interaction checks; full offline
regression suites and an independent trust review before activation.

Completed evidence: independent backend and UI/client Trust pass; restricted
browser suite has 1,229 passes, backend has 538 passes/four skips. The synthetic
derived-index fixture has 12,000 Topics and 24,000 documents, bounded results and
revision/query cursor checks, with no per-query canonical snapshot load.
Isolated actual Chrome checks lock-before-send, private first generation, one
automatic follow-up, reopen without generation, read-only search/source links,
focused typing and 320/390/480px layout. No real provider request or owner write.
Normal loopback service was restarted, preserving catalog revision/counts,
pairing and protected ChatGPT connection; paired public search works and guest
private access is rejected. Screenshots stay in the known temporary review folder.

Independent review found and corrected generation-fence/account-erasure edges,
private export message-to-conversation mapping and client/navigation/read races.
Retained root drafts never lose their private lock through navigation; private
reply text/target stays stable through pending requests or pagination. Uncertain
sends reuse their exact operation payload, not a regenerated request with the
same ID. Private source attestation remains exact even when canonical URLs have
been cleaned under ADR-095. Generation currently requires the originating public
page to be current; failure saves the human message but makes no later retry.
Future hosted migration/backup must include account and private stores; no
shared-pilot, mail, E2EE, provider-quality or internet-scale throughput claim.

Owner test follow-up (2026-10-11): a private assistant attempt ends with
`invalid-input`. Read-only inspection confirms the human message remains and
the claim is terminal. Independent offline composition reproduces a validation
mismatch for invisible Unicode language-formatting characters accepted by the
page reader but rejected by the provider adapter. The owner's exact rejected
field is not proven; transient page text was not retained. Reconcile validation
and add content-free failure-stage evidence in follow-up work, without private
raw logs, input/output authority relaxation or replay of this existing claim.

Client correction (0.13.50): the shared Insight reader removes only invisible
Unicode direction-formatting marks (U+061C, U+200E/U+200F, U+202A–U+202E and
U+2066–U+2069) from the existing captured prefix before provider preparation.
This preserves visible multilingual prose without reading replacement suffix
text or changing raw navigation/document attestation. Remaining unsafe controls
and blank results still reject; collector, E5 and strict server input/citation
validators are unchanged. Fixed private failure enums map to localized text,
never raw provider details or retry authority. A real-component composed test
with mocked HTTP covers first generation and exactly one automatic own-AI reply,
bounds, debug suppression, private-only persistence and restart/idempotency.
Independent Trust 221 focused passes, restricted full browser 1,242/backend 539
passes (four skips), isolated Chrome community checks and secret scans pass.
Reload extension only. The owner's actual failed field remains unconfirmed and
its claim terminal; no live private provider retest, new scope or approval follows.
