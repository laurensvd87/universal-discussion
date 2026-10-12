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

### Presentation refinement (2026-10-12, 0.13.55)

The owner renames the Private chats surface to **My chats** and requests private
indicators. Use the existing packaged lock icon on each private list entry and
the open-conversation header, with localized accessible labels/tool tips. The
surface currently remains private-only and account-scoped; no public-list
integration, visibility toggle on accepted conversations, publication, new
provider context or account/API change follows. The inbox header has no lock
claim about all future chats. Actual Chrome and restricted tests verify this
presentation and the unchanged isolation/reply behavior.

## Discover

### Related-page empty-state refinement (2026-10-12, 0.13.56)

The owner requests useful page navigation instead of an empty Discussion and
contextual related pages when Discover's search box is empty. Use existing
Source-bound catalog/related DTOs, never new scraping, search-engine/provider
requests or private data. Recommend safe same-Topic metadata and backend-ranked
related Sources; exclude the current URL/Source and duplicates. The shared pure
projector checks canonical URL eligibility, current Source/Topic/navigation and
optional related-version/Source consistency. Its bounded 20-card/512-catalog/
100-related work budgets are presentation limits, not retention ceilings.

Discussion shows these links only without visible current/earlier/alternate/
related conversations. Tombstone-only trees do not count. Loading, unsupported,
stale or disconnected contexts clear links; card refresh preserves focus. Blank
or whitespace-only Discover renders related page links locally, not recent
Topics or blank global searches. Nonempty input uses the existing whole-public-
library indexed search and pagination, independent of the current page. Clearing
input/disconnecting fences pending responses; page refreshes preserve a typed
query and its focus. Outgoing links use safe new tabs without referrers; they
grant no posting/Topic/Insight authority. No backend/runtime/permission or
publication scope changes. Final verification is recorded in STATUS/HANDOFF.

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

### Combined account My chats refinement (2026-10-12, 0.13.57)

The owner requests their non-private conversations and those of their bots in
My chats too. Include distinct public roots with a surviving account-authored
human message or account-operated assistant message, even if the contribution
is a reply beneath another user's opener. Ownership comes only from immutable
account author/operator IDs, never email, display name or a bot's author ID;
legacy Alex/Blair posts remain unclaimed. Private visibility/storage are unchanged.

Two read-only account routes derive the active named principal server-side after
device pairing and exact Origin: `public-chats/list` and `public-chats/read`.
Whitelist safe display DTOs only, not account exports, identities, credentials,
historical revisions or private data. Listing orders by current thread activity
with stable root-ID ties; message previews are oldest-first. Pages allocate at
most 25 selected current bodies/headers and adapt to the HTTP byte bound. Signed
cursors bind account, canonical version, action, root and limit; restart or
context change requires a fresh page. Deleted text/author/source is not projected;
deleted ancestors remain only when required by surviving messages. Regrouped
roots use their current canonical destination. Last-owned withdrawal removes
membership and normal account deletion revokes reads.

Use existing normalized owner/root indexes without schema migration, whole
catalog snapshots or complete revision-history loads. Indexed ownership mirrors
are optimizations, not independent authority: concrete author/operator witnesses
must agree with canonical payloads. SQL still aggregates account-owned thread
activity and ancestry IDs before selecting a page; large-scale constant work is
not claimed. Legacy stores use their existing bounded snapshot fallback.

The client merges independently paged private/public pools with namespaced IDs,
activity ordering, duplicate suppression and fixed partial-failure explanations.
Only private entries/headers have locks. Public previews stay read-only; safe
deliberate source links return to the normal page discussion, never confer
off-page write, Insight or deletion authority. Sign-out/account switch clears
data; disconnect fences pending reads and visibly detaches unsent private text.
Rejected public reads clear cached bodies, titles, links and cursors. Existing
private typing, reply and one-attempt assistant generation are preserved.

Independent Trust catches/fixes legacy version projection, indexed ownership
mirror and stale public-text edges. Restricted browser checks pass 1,367/1,367;
backend passes 632 with five optional skips. A large synthetic fixture exceeds
the old snapshot budget while proving no normalized snapshot/history reads.
Isolated actual Chrome checks mixed human/assistant/private cards, read-only
previews, unchanged private replies and 320/390/480px layouts without overflow
or uncaught errors; root reviews screenshots. Secret scans/diff checks pass.

The owner separately approves an idle normal-service restart. It is complete:
canonical generation/revision and 243 Topics/201 Sources/65 contribution records,
two private chats/three private messages remain exact; saved pairing and protected
ChatGPT connection restore. Real paired health passes and guest calls to both
new account routes reject with 401. App sessions may need sign-in renewal; actual
owner account-inbox interaction awaits extension reload. No provider inference,
new permission, account claiming/migration, mail, hosting or publication follows.

### My chats search and scrolling refinement (2026-10-12, 0.13.58)

The owner requests account-inbox search and reports long cards visually spilling
into adjacent entries. A fixed compact search field sits outside the scrollable
list. Content-sized grid rows/intrinsic card heights retain wrapped titles, origin
labels and gaps; the same shared layout safeguards apply to private bubbles and
Discover cards. Use bounded result pages/Load more rather than unbounded initial
reads. Fully paginated arbitrary discussion/reply trees remain later scalability
work; this does not implement numbered pages across every tab.

Both account-public and private list requests accept an optional query of at most
256 characters. Blank input preserves unfiltered behavior. Literal AND substring
matching examines current visible public thread text and safe Topic/Source titles
only within actual account participation; private matching examines owned private
titles/current messages in its separate store. Never index private data into
Discover/canonical storage, match withdrawn/history text or transfer queries to a
provider. Existing SQL owner/thread indexes scope work before bounded projection;
no snapshot/history loads or schema migration. This is not FTS, semantic search or
constant-time work; SQLite case folding is ASCII-only, other characters match
literally with exact case.

Public signed cursors include the normalized query. Filtered private pages use
signed owner/current owner-version/query/action/limit/last-ID cursors, while old
unfiltered ID pagination remains compatible. Query/version/account changes and
restart reject filtered stale cursors. UI debounce/Enter/IME handling preserves
search focus, fences old reads and resets separate pools/cursors; clearing restores
the normal inbox. Logout/disconnect/disposal clears query data and pending timers.
Private unsent text remains visibly detached after disconnect. Fixed partial
failures remain explicit; public previews remain read-only.

Independent Trust includes account isolation, body-tail hits outside the first
page, literal operators/emoji, current-only deletion/history checks, forged and
stale/query-bound cursors and real synthetic private restart. Actual Chrome tests
60 synthetic public cards, search hit 57, additional page loading, fixed search
while scrolling, wrapped-title containment/gaps at 320/390/480px and enlarged text.
No owner/provider calls occur in these fixtures. Final evidence is in STATUS.

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
