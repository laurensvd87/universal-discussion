# ADR-012: Local identity, discussion, moderation, and lifecycle contract

Status: Accepted P1.6 design; owner amendments and fresh AI Trust/Security,
Privacy/Policy, and Quality reviews ACCEPT; P1.7 implementation not authorized

Date: 2026-09-24

Owners: Lead/Product, Platform and Client, Trust/Security/Privacy/Policy, and
Quality

## Context

P1.7 needs a local contract that can distinguish public human activity, public
agent activity, private discussion content, and unpublished AI output without
choosing an identity provider or operating a reachable service. It also needs
moderation, deletion, retention, restore-safety, and incident rules before the
local discussion slice can be credible.

The 2026-09-23 proposal was reviewed by AI Trust/Security, Privacy/Policy, and
Quality lenses. On 2026-09-24 the owner reviewed the design point by point and
accepted a materially amended package. The amendments supersede the earlier
proposed defaults wherever they conflict, including timed sessions, 24-hour
content retention, user blocking, immutable public bodies, and an export
generator in every client.

`docs/PHASE_1_AUTH_AND_DATA_LIFECYCLE_THREAT_MODEL.md` is the detailed security
contract. This ADR records the product and architecture choices. `public` in
P1.7 means public-visible only inside a network-denied local synthetic fixture;
it is not an Internet-reachable post.

## Decision

### 1. Invoked active context

Opening the extension popup is the explicit user gesture. The future integrated
flow automatically reads the active top-level tab's URL, approved bounded
metadata, and local mapping and then looks up the discussion; it does not
require a second `Check current tab` action. A retry control is allowed after an
error or navigation.

The observation binds tab ID, top-level document identity, and navigation
version before rendering. Navigation, tab closure, an unsupported scheme, or a
stale result clears every prior value and fails closed. Popup opening does not
authorize background monitoring, another tab, frames, automatic AI invocation,
publication, storage, telemetry, or network egress.

After an exact implementation gate, the solo owner may manually test lawfully
accessible public, authenticated, or private pages locally. There is no access-
control, login, or paywall bypass and no collection of cookies, authentication
tokens, form fields, attachments, or background/inbox content. Any raw page
content used by a later approved local processor is memory-only and absent from
logs, persistence, backups, and egress. This is an owner-approved local PoC
boundary, not a store, copyright, terms, or production approval.

### 2. Identity and local session

Human and agent actor types are immutable and disjoint. Agent output is always
visibly identified as AI, remains filterable separately, and cannot be relabeled
as human after editing or account deletion. Human and agent counts and rate
classes remain separate.

P1.7 uses deterministic synthetic identities selected through a trusted local
adapter. It has no password, external login, or real identifier. The selected
identity persists until explicit logout, actor switch, local reset, account
deletion, or an explicitly defined restart boundary; there is no automatic
30-minute logout. A suspension or ban preserves the selected identity while
revoking ordinary mutation authority and exposing a restricted account view
for the exact actions allowed below. Real email/password, Google, or other login
is deferred to a separate provider and security gate.

### 3. Public and private discussion

The Topic Discussion is the normal public context. A prominent
`Private Discussion` switch changes the destination of future messages only;
it never publishes or moves existing private history. Individual private human
or AI items may be selected for an explicit publication flow. Private
discussions are owner-only in P1.7; shared private membership needs a later
authorization and privacy design.

Publishing one private human item binds its exact current revision, shows a
public preview, and creates a distinct public human root with one idempotent
commit. It does not mutate, relabel, or move the private item or expose its
private parent/history. P1.7 does not publish a private item directly as a reply;
that needs a later context-leakage decision.

An empty public discussion may offer `Ask my AI for a draft`. The result first
appears as an unpublished publication candidate showing the full proposed text,
AI identity, inputs, tools, and public sources. The owner may edit it and then
choose `Publish`, keep private, or delete. No agent output is published
automatically. Material derived from an authenticated or private page is never
automatically published, and private page content requires a separate explicit
input decision before any later AI call. The preview warns that derived output
can repeat sensitive source text even when the raw page body is discarded.

P1.7 uses a deterministic fake agent with `provider=none` and
`model=synthetic`. External inference, web search, credentials, autonomous
drafting, or an opt-in automatic-draft feature each require a later provider,
privacy, security, and spending decision. Automatic publication remains off.

Built-in agent definitions begin with `General Analysis`, `Opinion`, and
`Summary`; modes such as `Price Comparison` may be added when their tools and
inputs are explicitly declared. User-defined definitions may extend the
selector but are untrusted declarative data, never executable code, and cannot
expand platform permissions. Import, subscription, or an agent marketplace is
deferred to separate gates.

### 4. Conversation structure, revisions, and language

Every independent contribution is a root contribution that opens a subthread,
or a reply grouped under one root. Replies remain grouped and primarily
chronological so the exchange remains readable. Smart ordering applies between
root subthreads, not by silently rearranging a reply conversation. Initial sort
modes are explainable and selectable, such as `Relevant`, `Popular`, and
`Newest`; an initial score must be deterministic, use only public/non-sensitive
signals, and may consider Topic-match confidence, relevance, popularity,
quality, and time.

An AI `Summary` is always a root contribution, never a reply. Other users may
reply to it. A discussion-wide recap may later use a separate reviewed utility,
but the initial contribution model does not inject summaries into reply chains.

Private drafts and unpublished AI candidates may be edited freely. Editing a
public contribution creates a revision and displays `Edited`; it is never a
silent overwrite. P1.7 shows only the current public body; access to prior
public revision bodies is owner-only until a later product decision, except
that an assigned moderator may inspect the one exact revision reported while it
was public. That case-bound evidence expires with the appeal path and is removed
immediately on withdrawal or account/privacy deletion. Human editing of an AI
result preserves `author_type=agent` and adds a visible human-edited marker. An
author may withdraw a public contribution; every revision body becomes
unavailable while reply-safe topology renders as `Deleted`.

The first UI is English, but every platform-owned string uses a stable message
key and an English fallback language pack. Language packs are inert declarative
data and translate UI text, not human or AI contributions. User-supplied agent
names are user content and are not silently translated.

### 5. Reports and moderation; no user block or mute

There is no user mute and no user-to-user block. Public content is only shown
when the panel is deliberately opened, and user safety actions are reports and
moderator review rather than per-user relationship state.

Every public contribution and reply can be reported with an enumerated reason:
spam/scam, harassment, personal data, copyright, dangerous/illegal content,
off-topic, or other. An optional reporter explanation is restricted moderation
data. The report binds the exact public target revision/version and body digest
so a later edit cannot replace the evidence under review. Only the assigned
case moderator can read that revision, and only until case/appeal retention
ends. Withdrawal or account/privacy deletion purges it and wins the race. Report
volume never proves abuse or causes automatic removal.

A scoped moderator can dismiss a report, remove the reported contribution, put
the account into temporary suspension, or ban it. When banning, the moderator
chooses among leaving prior contributions visible, removing only the reported
contribution, or removing every public human and owned-agent contribution and
reply from that account. Bulk removal binds an exact snapshotted set, requires
an affected-count preview and confirmation, and has an idempotent outcome. The
preview also binds an account-owned-public-set version. A concurrent membership
change invalidates it; a contribution transaction either commits before that
fence and forces a new preview or observes the committed ban and denies.
Removed bodies render as the neutral `Deleted` placeholder; reply topology
remains. Private discussions and drafts are never exposed to moderators or
included in bulk removal.

The affected account sees the action and reason and may submit one appeal
within seven days. One bulk-action appeal covers the ban and its removal batch.
A reversal may restore only moderation-removed bodies that still exist and only
while the author has not withdrawn them and account/privacy deletion has not
erased them. Reporter identity is never disclosed to the subject.

Temporary suspension is not a ban. It allows public reading, status inspection,
one appeal, withdrawal of owned public content, logout, account deletion, and a
future centralized export request. It denies new contributions, replies,
reactions, AI invocations/publications, and edits to retained public bodies. The
moderator must lift the suspension or convert it to a ban. A banned account has
the same non-publishing rights until deletion or successful appeal.

### 6. Operators, workers, and containment

Moderator, Topic-correction, privacy, and security/operations scopes are
structurally separate even though the solo owner exercises every local fixture.
A moderator can see only public reported content and relevant public thread
context. There is no routine or break-glass access to private discussions,
drafts, prompts, or AI candidates.

Ordinary workers receive one exact action, object set, version, policy, and
expiry and cannot discover other objects. A lifecycle-issued `safety_cleanup`
capability may continue through suspension, bans, or containment only to
delete/expire an already-authorized exact target. It has no read-body,
disclosure, creation, export, publication, moderation-outcome, or restore
authority.

Global containment stops new contributions, AI work, publication, export,
ordinary jobs, and restore promotion. Existing public content remains readable.
A moderator may still hide one exact public contribution through the audited
moderation path, and exact delete-only safety cleanup continues. A restricted
account may inspect status, log out, withdraw an owned public contribution, and
request or confirm account deletion during containment. The account-state
allowlist is intersected with this global allowlist; no new appeal is accepted
while contained, and the appeal deadline is paused for the contained interval.
Appeal reversal/content restoration remains denied. Security may inspect and
close the exact incident or abort an isolated restore; containment does not
grant content-reading authority or revive revoked work.

### 7. Deletion and retention

`Delete account` first presents the consequences and may be cancelled. A
second explicit confirmation is the irreversible commit in the passwordless
PoC; a real authentication system must add fresh reauthentication later.
Commit immediately disables ordinary access and cancels sessions, AI work,
previews, and pending future exports.

Account deletion removes the profile and direct identifiers; private
discussions, drafts, prompts, results, and agent definitions; reactions; and
the bodies of every revision of every public human and owned-agent
contribution. Public bodies become non-linkable `Deleted` tombstones where
reply structure requires them. Other users' replies remain. Source quotes
should be references rather than copied bodies so deletion propagates;
manually copied personal data remains eligible for a separate privacy request.

The status distinguishes immediate account inaccessibility, service-data
erasure, and physical purge after any eligible synthetic test snapshot expires.
Only minimized, time-bounded, non-content moderation/security outcomes and
non-personal topology may remain. Deletion and withdrawal always override
moderation reversal, search, counts, caches, correction history, and restore.

Public contributions, private discussions, drafts, and AI candidates otherwise
remain until manual deletion, withdrawal, moderation, or account deletion.
There is no 24-hour campaign or private-result expiry and no automatic inactive-
account deletion. Raw observed page content is never in this retained set.
Retained local user state must use non-sync application storage; workstation
backups, crash dumps, and host indexing remain outside the PoC guarantee and
must be addressed before external testing.

Report material remains through review and the seven-day appeal window and is
purged no later than 30 days after final closure. On reporter deletion, the
optional explanation and direct reporter mapping are removed immediately;
only approved non-identifying reason/status codes may remain for an open case.
Minimal structured moderation actions are retained for 90 days. Ordinary
security events are retained for 30 days; incident-linked events for 90 days
after closure. None may contain page content, complete browsing URLs, prompts/
results, credentials, or tokens.

`Reset all local data` is a conspicuous, confirmed, local-development-only
operation. It clears all local identities, discussions, drafts, reports,
mappings, logs, receipts, and test snapshots and does not exist in the
published product.

### 8. Centralized export and synthetic restore

P1.7 does not implement an export generator in the extension or mobile client.
A later website will provide one central `Account & Privacy Center`; every
client links to it. The data model must retain exact owner scoping and lifecycle
states so a future export can be correct, but archive generation, download,
reauthentication, and format are deferred. A usable access-request route is a
prerequisite for real accounts/public operation and requires a fresh privacy,
security, legal, and store-policy review.

There is no backup or recovery promise for owner browsing-derived PoC data.
Restore logic is tested only against an isolated synthetic fixture store. A
synthetic snapshot atomically binds its state and transition sequence. Restore
must replay every later deletion, withdrawal, moderation removal, ban,
suspension, correction, and incident event, rebuild projections, and pass a
current safety-watermark fence; otherwise it aborts. No raw real-page content
or real private browsing-derived state may enter a test snapshot. Real backups
require later provider, security, privacy, deployment, spending, and owner
approval.

### 9. Topic correction

Users may report `Not the same topic`; report counts never remap content. The
local owner/moderator may reassign a Source, merge Topics, or split a mixed
Topic only under a separately accepted ADR-005 correction contract. New lookups
use the corrected mapping immediately.

Existing public conversation is never silently moved. A root contribution and
all replies form the minimum movable subthread. The correction operator may
move that whole unit or leave it behind with a neutral mapping-corrected notice;
an individual reply cannot be detached. The command binds a subthread-membership
version that changes whenever a reply enters or leaves the set; a concurrent
reply makes the move stale and requires a new preview. Automatic matchers may
propose but not commit merges, splits, or moves in the MVP.

Correction history retains old/new opaque Topic and Source references, reason
code, time, match/policy version, outcome, and role. It contains no private URL,
title, page body, or free text. After actor deletion, a restricted event-scoped
pseudonym may remain for at most 90 days and then becomes role-only topology.

## Owner-approved disposition record

The owner accepted all rows on 2026-09-24 after a point-by-point review:

| # | Disposition |
| --- | --- |
| 1 | Local manual tests may use lawfully accessible public, authenticated, or private active pages within the no-bypass/no-egress boundary. |
| 2 | Human and agent identity, provenance, counts, filters, and rate classes remain structurally distinct. |
| 3 | P1.7 uses a persistent selected synthetic identity with no password or timed auto-logout; real login is deferred. |
| 4 | Public Topic Discussion is standard; Private Discussion is explicit; no private history or AI output is silently published. |
| 5 | Empty discussions may invoke a deterministic draft agent; built-ins and permission-bounded custom agent definitions extend one selector. |
| 6 | Root contributions own grouped replies; Summary is root-only; public edits create revisions; withdrawal leaves a tombstone. |
| 7 | User mute and block are not part of the product contract. |
| 8 | Reports lead to moderator dismissal/removal/suspension/ban. A ban has a confirmed choice to leave prior content, remove the reported item, or remove all public account-owned human and agent content; one appeal is available. |
| 9 | Temporary moderation suspension preserves exact read/status/appeal/withdraw/delete rights while denying publication and editing. |
| 10 | Operators and workers use least privilege; containment and delete-only cleanup compose; private break-glass access is absent. |
| 11 | Account deletion erases private material, direct identifiers, and owned human/agent bodies while retaining only non-linkable reply topology. |
| 12 | User content is manually retained; report/moderation/security records use bounded periods; local reset is explicit and destructive. |
| 13 | User export is deferred to one future website rather than duplicated across clients. |
| 14 | Restore tests are synthetic-only; real backups and recovery are deferred. |
| 15 | Topic corrections are reviewed and traceable; complete root subthreads, never isolated replies, may be moved. |
| 16 | Solo-role fixtures are acceptable locally; every provider, real-account, deployment, spending, store, publication, and later independent-review gate remains explicit. |
| Amendment | Opening the extension is the invocation and automatically starts active-tab URL/approved-metadata/local-mapping lookup; no second check button is required. |

## P1.7 boundary

Owner acceptance of this design does not authorize implementation. Before P1.7
starts, the owner must separately accept one exact disposable-local architecture,
including its modules, state store, test fixtures, browser bridge, fake-agent
surface, and excluded capabilities.

That architecture may use only synthetic principals and discussion data,
deterministic fake-agent output, local/disposable state, a fake clock where
needed for bounded records, and network denial. The separately approved browser
bridge is limited to automatic active top-level URL, approved bounded metadata,
and local mapping/discussion lookup. It may not read a page body. Any ephemeral
body-derived experiment belongs to the separate P1.11/ADR-013 branch and its
exact later extractor/model/Security/Privacy/Policy gate.

P1.7 authorizes no real account, identity provider, reachable service, external
AI/search/login provider, real public posting, telemetry, paid infrastructure,
deployment, store submission, announcement, or publication. Content-derived
semantic vectors and any server matcher remain under ADR-013 and later gates.

## Consequences

- The contract now matches the intended product rather than a 24-hour demo:
  conversations and drafts persist until the user acts.
- Opening the panel has immediate utility while remaining an explicit active-
  tab gesture; it is not passive browsing surveillance.
- Public context is the product default, but publication remains an explicit
  action for private and AI-generated material.
- Thread grouping makes discussion readable and lets corrections move complete
  conversational units without detaching replies.
- Removing user block/mute reduces MVP state but makes report/moderator response
  the only abuse intervention after opening the panel.
- Deferring export avoids implementing the same sensitive archive path in every
  client, but blocks real-account/public operation until the centralized route
  exists.
- One builder may exercise every role fixture but cannot claim independent
  staffing, legal review, a penetration test, or production readiness.

## Alternatives considered

- **Require a second active-tab button:** rejected; opening the popup is already
  the deliberate browser gesture and should load useful context immediately.
- **Default every AI result to public:** rejected because private page content
  or secrets could be published without review.
- **Make every AI result a private conversation:** rejected because the product
  needs a low-friction path to useful public seed contributions; an unpublished
  candidate plus one-click publication preserves control.
- **Render Summary inside reply chronology:** rejected; summaries are independent
  root contributions and can receive their own replies.
- **User mute/block:** rejected for the initial product; opening is deliberate
  and reports plus scoped moderation are the accepted controls.
- **Keep deleted bodies under an anonymous label:** rejected because body text
  can itself identify the author; retain only a non-linkable tombstone.
- **Implement exports in every client:** rejected in favor of one later web
  privacy center.
- **Back up real PoC browsing-derived data:** rejected until production backup,
  retention, encryption, provider, and deletion behavior is reviewed.

## Validation and gates

The 2026-09-23 AI dispositions apply to the superseded proposal and are
historical evidence only. On 2026-09-25 fresh read-only AI Trust/Security,
Privacy/Policy, and Quality lenses each returned ACCEPT on the reconciled
amended design. They found no remaining blocker or major contradiction. These
are design-review lenses, not independent human, legal/store-policy,
penetration-test, or implementation evidence.

P1.6's design gate is complete. P1.7 remains blocked until the separate exact
architecture authorization. The later
200-250-pair provenance-approved semantic review remains separate; when it
becomes the next required task, work stops for explicit provenance, acquisition,
and reviewer approval. The completed 6/6 synthetic owner dry run is not repeated.

## Relationships

- ADR-005 remains the authoritative merge/split/reversal contract. This ADR adds
  the owner-approved subthread movement and actor-deletion rules but does not by
  itself authorize correction implementation.
- ADR-011 and its button-driven P1.5c evidence remain historical and unchanged.
  The automatic-on-open behavior is a successor requirement, not a retroactive
  claim about the completed smoke test.
- ADR-013 remains the separate future semantic content-derived matching branch.
  Local page observation approval here does not authorize a model, embedding
  egress, matcher, representative retention, provider, or store release.
