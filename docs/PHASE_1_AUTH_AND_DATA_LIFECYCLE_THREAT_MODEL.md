# Phase 1 auth, identity, discussion, moderation, and data-lifecycle threat model

Status: Accepted P1.6 design; owner amendments and fresh AI Trust/Security,
Privacy/Policy, and Quality reviews ACCEPT; P1.7 implementation not authorized

Date: 2026-09-24

Owners: Trust, Security, Privacy, and Policy, with Platform, Lead, and Quality
review

## Scope and non-claims

This document defines the minimum authorization and lifecycle contract needed
before one exact disposable P1.7 local experiment. It covers invoked active-tab
context, synthetic identity, human/agent separation, public/private discussion,
unpublished AI candidates, subthreads and revisions, reports, suspension, bans,
moderation, operator access, retention, deletion, synthetic restore, Topic
correction, and incident states.

P1.6 is documentation only. It creates no account, password, identity-provider
integration, reachable listener, production database, provider call, public
post, telemetry, deployment, store submission, or legal-compliance claim. The
owner accepted the amended decisions on 2026-09-24. Material changes reopened
the earlier AI review; fresh Trust/Security, Privacy/Policy, and Quality ACCEPT
dispositions plus a separate exact P1.7 architecture authorization are still
required before implementation.

The owner-only local test direction may later observe a lawfully accessible
public, authenticated, or private active page. That exception is narrow: opening
the extension is the user gesture; only the active top-level document is in
scope; no access control is bypassed; and raw page content has no persistence,
logs, backup, telemetry, or egress. Real user accounts, other testers' browsing,
hosted processing, content-derived vector transmission, and store distribution
remain outside P1.7.

The broader product may eventually have a globally public Topic/Discussion
namespace. That does not make private discussions, drafts, AI candidates,
reports, reporter explanations, or operator records public. `public_visible` in
P1.7 means visible only to authorized synthetic principals inside a network-
denied local process.

## Safety objectives and invariants

1. Every request denies unless an exact action is allowed for a trusted-derived
   principal, every participating object, relationship, state, version, scope,
   policy, and current global-security epoch.
2. Opening the extension popup authorizes one automatic observation of the
   current active top-level document. It does not authorize background scanning,
   other tabs/frames, body extraction, AI execution, publication, or egress.
3. Tab navigation, document replacement, closure, unsupported context, or stale
   attestation clears all previous values and prevents rendering mixed-document
   URL, metadata, mapping, or discussion state.
4. Raw authenticated/private page content, if a later exact local flow is
   approved, exists only for the duration of that operation. Cookies, tokens,
   form fields, attachments, and inbox/background enumeration are never inputs.
5. Human and agent actor types are immutable and disjoint. A client, page,
   model, contribution, or agent definition cannot select or upgrade actor type.
6. Private discussion content, drafts, prompts, and AI candidates are owner-
   bound, excluded from public search/counts/caches, and invisible to moderators.
   Shared private discussions are not supported in P1.7.
7. Public Discussion is the default destination, but private history and AI
   output never become public without an exact owner preview and publish action.
   Switching public/private mode affects future messages only.
8. A fake agent produces one bounded owner result per invocation and cannot
   publish, moderate, report, change permissions, invoke another agent, or use a
   provider/network. Human editing never changes `author_type=agent`.
9. Root contributions define movable subthreads. Replies stay grouped under
   their root and retain conversational order. `Summary` is root-only.
10. A public edit appends a revision and exposes `Edited`; no body, author,
    provenance, parent, Topic, or visibility boundary is silently overwritten.
11. Public ranking uses only public/non-sensitive inputs, stable tie-breaking,
    and an explainable deterministic formula in the first implementation.
12. Reports are signals, not proof. Report counts never remove content, ban an
    account, or remap a Topic automatically.
13. There is no user mute or user block. Moderation is scoped, auditable, and
    unable to read or bulk-remove private content.
14. A ban-time `remove all public contributions` action binds an exact,
    confirmed account-owned set, includes owned-agent public contributions, and
    has an idempotent result. It never expands by discovery after confirmation.
15. Withdrawal, account deletion, and privacy erasure override moderation
    reversal, revisions, Topic history, ranking, counts, caches, and restore.
16. User content is retained until a manual lifecycle action; raw observed page
    content is not user content storage. Bounded moderation/security records use
    the approved separate deadlines below.
17. No ordinary role is a universal administrator. Moderator, correction,
    privacy, security/operations, browser bridge, agent runtime, and worker
    scopes remain structurally distinct even when one owner runs the fixtures.
18. A delete-only safety worker can complete an exact authorized purge during
    suspension, ban, or containment, but it cannot read bodies, disclose,
    create, publish, export, moderate, or restore.
19. Global containment stops new content, AI work, publication, ordinary jobs,
    future exports, and restore promotion while preserving public reading,
    exact public-content hiding, lifecycle status, and delete-only cleanup.
20. P1.7 contains no export generator and no real backup. A future centralized
    web privacy center and any real recovery system each require new gates.
21. Agent definitions and language packs are inert untrusted data. They cannot
    contain executable code, introduce a network/tool capability, or bypass
    safe rendering and platform authorization.

## Assets and classification

| Asset | Classification | Minimum handling |
| --- | --- | --- |
| Invoked current-context envelope | Restricted browsing context | Popup-lifetime URL/approved metadata/local mapping only; bind active tab and document; clear on stale/unsupported; no log, sync storage, telemetry, or egress. |
| Raw page text from a later approved operation | Highly restricted ephemeral input | Active top-level document only; memory-only; no tokens/forms/attachments; discard after local operation; never persist, back up, export, or log. |
| Future semantic fingerprint/vector/score | Restricted derived content | Outside P1.7; not anonymous by default; never render to users; transmission/retention needs ADR-013 gates. |
| Synthetic session/identity selector | Security-sensitive test state | Trusted adapter derives immutable identity/type/roles; no real credential; persist until explicit lifecycle event, not a timed logout. |
| Human account/profile | Restricted personal data in a future real system | Synthetic only in P1.7; owner-scoped; delete under the accepted inventory. |
| Agent identity/provenance | Public when attached to a public contribution; otherwise restricted | Immutable agent type; disclose minimized fake-provider provenance; never expose private input. |
| Public contribution and revisions | Public-intended, integrity-critical | Safe render; immutable author type; append-only revisions; moderation/withdrawal/deletion override every body. |
| Private Discussion contribution/draft | Highly restricted owner content | Owner-only, manually retained, non-sync local state; no moderator access, public count/search, or snapshot. |
| Unpublished AI prompt/result/candidate | Highly restricted owner content | Owner-only, editable candidate, manually retained; derived output may repeat sensitive source text; no ordinary moderator access. |
| Agent definition | Restricted owner configuration | Declarative text/allowlisted references only; safe render; no executable code, secret, provider call, or permission expansion. |
| Report and reporter identity | Restricted abuse data | Reporter and assigned moderator workflow only; no subject disclosure or automatic guilt. |
| Exact reported revision evidence | Highly restricted case evidence | Revision that was public when reported; bind ID/version/digest; assigned moderator only; edit cannot replace it; withdrawal/account/privacy deletion purges it; retain only through case/appeal. |
| Optional report explanation | Highly restricted free text | Separate from audit; safe render; assigned moderator only; immediate removal on reporter deletion; bounded case retention. |
| Moderation action/batch manifest | Restricted operational data | Exact target/version/account-owned set, reason, count, state, role, time; no private bodies or ambient discovery. |
| TopicCorrection event | Integrity-critical audit data | Opaque topology and reason/version only; no private URL/title/body; actor mapping expires. |
| Security/auth audit event | Restricted security data | Exact allowlisted metadata only; no content, token, report text, prompt/result, or complete browsing URL. |
| Future export | Highly restricted temporary copy | Not implemented in P1.7; centralized website and a new exact schema/security review required. |
| Synthetic restore fixture/safety ledger | Restricted test data | Synthetic discussion fixtures only; never raw or derived real-page/private-browser state; reset removes it. |

Retained local private state must use application-local, non-sync storage. P1.7
does not claim control over workstation backup software, memory paging, crash
dumps, antivirus capture, or host indexing; owner-only testing is the boundary
until those risks have a real-client design.

## Principals and authority scopes

| Principal | Intended authority | Explicit denial |
| --- | --- | --- |
| Anonymous reader | None in P1.7; future public reading remains a separate product decision | Every read/mutation in the local synthetic contract |
| Synthetic human | Read local public state; own private state; create/reply/edit/withdraw as self; invoke fake agent; preview/publish owned candidate; report; appeal; request deletion | Choosing another owner/type/role; moderator/correction/security actions; autonomous publication |
| Restricted synthetic human | During suspension/ban, perform the exact read/status/appeal/withdraw/logout/deletion actions below; during containment, use only the intersection with the narrower global allowlist | New contribution/reply/reaction, public edit, AI invocation/publication, agent-definition changes, ordinary jobs; any action outside the contained intersection |
| Scoped fake-agent runtime | Read one invocation's allowlisted synthetic input and write one owner-bound candidate | Human authorship, direct public post, general listing, report/moderation/correction/deletion, tools/network |
| Invoked browser bridge | For one popup invocation, read the active top-level URL and approved metadata and perform local lookup | Background/other-tab/frame/body/form/token/attachment access, persistence, AI/provider use, publication, network |
| Moderator | Read public content and assigned report context; suspend/lift, ban/unban, remove/restore under policy | Private discussions/drafts/AI candidates, human/agent impersonation, Topic correction unless separately scoped, future export/restore |
| Correction operator | Apply an approved Source/Topic correction and move one complete root subthread | Reauthoring, partial reply move, private content, publication, moderation merits, restore |
| Privacy lifecycle | Commit verified deletion and inspect exact lifecycle status | Reading unrelated bodies, moderation merits, public posting, correction |
| Security/operations | Enter/leave containment, inspect exact incident state, approve/abort isolated synthetic restore | Routine content browsing, publication, moderation merits, private-content break glass |
| System worker | Perform one exact queued action or delete-only cleanup over a bound object/version set | Ambient authority, discovery, scope expansion, body disclosure, actor/owner/target changes, stale replay |

Role aliases in a local fixture are not evidence of independent people or
production staffing. A qualified independent human security/privacy/legal/store
review becomes necessary before external testers, real accounts, persisted or
egressed real personal data, network exposure, or publication. It is not needed
to implement or exercise an owner-only network-denied synthetic contract.

## Invoked active-context authorization

The future automatic flow is one canonical operation:

```text
popup_open(invocation_id)
  -> capture(active_tab_id, initial_url, top_level_document_id)
  -> validate(scheme, context, field and byte limits)
  -> project(approved_url_fields, approved_head_metadata)
  -> local_topic_discussion_lookup()
  -> recapture(active_tab_id, final_url, top_level_document_id)
  -> render_only_if_all_bindings_match()
```

Opening the popup, including through an accessible keyboard action, is the
gesture. Popup reload may restart the operation, but deduplication prevents a
concurrent prior result from winning. No result renders until final attestation.
Navigation, closure, document replacement, permission failure, unsupported
scheme/context, over-limit field, malformed metadata, or lookup error produces
one clean terminal state and clears all previous URL, metadata, Topic,
Discussion, count, and evidence fields.

P1.7's exact architecture gate must freeze allowed schemes/origins and the
metadata field/byte envelope. The completed P1.5c experiment remains historical;
its second-button behavior is not evidence that automatic-on-open is already
implemented. Automatic popup acquisition is limited to URL, approved metadata,
and local mapping. It does not itself authorize raw body extraction or an AI
call. A later content operation must separately disclose its input and remain
inside the raw-content rules above.

All page data is untrusted. Rendering uses text nodes or equivalently safe
escaping, allowlisted link schemes, no HTML execution, and no instruction
authority. The bridge never records full URLs, metadata, or private-page
presence in audit/error output.

## Deny-by-default authorization decision

Every state-changing boundary evaluates a canonical command equivalent to:

```text
authorize(
  principal_id, principal_type, role_scopes,
  selected_identity_version, account_state, account_state_version,
  global_security_state, global_capability_epoch,
  action,
  participants[(relationship_role, object_type, object_id,
    owner_scope_id, visibility, object_state, object_version)],
  collection_fences[(collection_kind, collection_id, membership_version)],
  policy_version, idempotency_key?, capability_digest?
)
```

The trusted adapter derives identity, immutable actor type, role scopes,
account/global state, relationships, and ownership. Client-supplied actor,
owner, visibility, moderator, model, Topic, parent, report target, batch scope,
or tenant fields are requested values, never authority. Unknown fields,
actions, states, relationships, extra/missing participants, stale versions,
cross-owner identifiers, invalid destinations, or expired/consumed capabilities
deny before mutation.

Authorization and mutation occur in one transaction or one pure local state
transition. Every commit revalidates account state/version, global state/epoch,
policy, and all participant versions. Exact idempotent retry may return its
recorded outcome; reuse of the key for any different canonical command denies.
Existence-sensitive failure is generic.

The selected synthetic identity has no wall-clock session expiry. Logout, actor
switch, reset, suspension, ban, containment, or deletion increments the
identity/account version and revokes outstanding ordinary publication and worker
capabilities. Suspension, ban, and containment may issue or preserve only the
restricted account view described here. A later real login system must define
token rotation, recovery, and reauthentication separately.

Ordinary workers carry a receipt for one action, exact object/version set,
policy, global epoch, and technical expiry chosen at the P1.7 architecture gate.
They cannot list or discover targets. A `safety_cleanup` receipt is issued only
by the lifecycle engine for an already-committed delete/expire operation. It may
read target identifiers, states, and enumerated outcomes needed for that purge,
but no body, and it cannot disclose, create, publish, export, moderate, or
restore. A global-security transition consumes stale ordinary receipts and
rebinds only still-current cleanup steps to the new epoch or fails atomically.

## Authorization matrix

`C` means allowed only under the stated condition; `D` means deny. Unlisted
combinations deny.

| Action | Owning/acting human | Other human | Fake agent | Browser bridge | Worker | Moderator | Correction | Security/ops |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Read public visible content/counts | C | C | C: invocation input only | C: local lookup result only | C: exact projection job only | C | C | C: incident need only |
| Read/list owner-private discussion, draft, candidate, prior revision | C: exact owner | D | C: current invocation subset only | D | D | D | D | D |
| Read exact revision reported while public | C: own revision | D | D | D | D | C: assigned live case only | D | D |
| Create/edit/delete a private owner item | C: exact owner/current version | D | C: produce one candidate only | D | C: committed cleanup only | D | D | D |
| Submit public human root/reply | C: explicit as self, active account | C: explicit as self | D | D | D | D | D | D |
| Publish one private human item as a new public root | C: exact current item/preview/destination, active account | D | D | D | D | D | D | D |
| Append revision to owned public contribution | C: active owner/current version | D | D | D | D | D | D | D |
| Withdraw owned public contribution | C: owner, including suspended/banned | D | D | D | C: committed cleanup | D | D | D |
| Authorize one fake-agent invocation | C: exact owner/definition/input/destination, active account/global clear | D | D | D | D | D | D | D |
| Produce one private AI candidate | D | D | C: exact invocation only | D | D | D | D | D |
| Bind/rebind an unpublished publication preview | C: exact owner/current candidate revision | D | D | D | D | D | D | D |
| Publish an agent root contribution | C: exact current preview/capability, active/global clear | D | D | D | D | D | D | D |
| Report a public contribution or wrong Topic | C: rate-limited as self | C: as self | D | D | D | D | D | D |
| Triage/dismiss/action a report | D | D | D | D | D | C: assigned report/public context | D | D |
| Hide one exact public contribution | D | D | D | D | C: exact committed moderation batch only | C: including contained state | D | D |
| Place/lift temporary suspension | D | D | D | D | D | C: exact account/reason/version | D | D |
| Ban/unban account | D | D | D | D | D | C: exact account/reason/version | D | D |
| Confirm reported-only/all-public removal batch | D | D | D | D | D | C: exact previewed set/count/version | D | D |
| Submit one appeal | C: affected account/owned agent, including restricted | D | D | D | D | D | D | D |
| Uphold/reverse appeal | D | D | D | D | C: exact restoration batch only | C: assigned current case | D | D |
| Inspect own account/moderation/deletion status | C: including restricted | D | D | D | D | D | D | D |
| Request/cancel/confirm account deletion | C: exact owner; second confirmation for commit | D | D | D | D | D | D | D |
| Execute Source reassignment/Topic merge-split | D | D | D | D | D | D | C: accepted command | D |
| Move complete root subthread | D | D | D | D | D | D | C: exact root plus reply set | D |
| Observe invoked active context | D | D | D | C: exact popup invocation/top document | D | D | D | D |
| Open/close containment; read exact incident | D | D | D | D | D | D | D | C: current security scope |
| Build/abort/promote isolated synthetic restore | D | D | D | D | C: exact approved fixture receipt | D | D | C: exact plan/control |
| Purge due lifecycle object | D | D | D | D | C: exact `safety_cleanup` only | D | D | D |
| Change actor type, owner, or existing provenance | D | D | D | D | D | D | D | D |
| Generate/download user export | D: deferred | D | D | D | D | D | D | D |
| Create/revoke user block or mute | D: unsupported | D | D | D | D | D | D | D |

There is no break-glass cell in P1.7. Any future private-content emergency
access needs a new owner-approved ADR with exact purpose, objects, expiry,
independent approval, immutable access event, post-review, and notice rules.

## State transitions

### Identity, account state, and deletion

```text
selected_identity: selected -> logged_out | actor_switched | reset | deleted

account: active -> moderation_suspended -> active | banned
         active -> banned
         banned -> active                         (successful appeal/unban)

deletion: active|moderation_suspended|banned
  -> deletion_requested -> prior_account_state   (owner cancel)
deletion_requested --second explicit confirmation-->
  deletion_committed -> identity_disabled -> service_erasure_complete
  -> physical_purge_complete

global_security: clear -> contained -> clear
```

The local identity remains selected without automatic timeout while active. A
suspension, ban, or containment revokes ordinary capabilities and exposes only
the restricted-action intersection. Suspension permits public read, status,
appeal, owned-content withdrawal, logout, account deletion, and a future link to
the centralized export website. A ban permits the same non-publishing actions.
No state permits a new contribution, public edit, reaction, AI invocation, AI
publication, or agent-definition change while restricted.

`deletion_requested` has no erasure effect and is cancellable. The passwordless
PoC uses a clear second confirmation as the atomic irreversible commit. A later
real login must replace that safeguard with a reviewed fresh-authentication
flow. Commit immediately denies ordinary access, revokes jobs/capabilities, and
makes all account-owned public bodies unavailable. Cleanup is idempotent and
retryable without restoring access.

`service_erasure_complete` means every declared active store, cache, index,
count, and local projection denies the payload. `physical_purge_complete` also
requires every eligible isolated synthetic snapshot and safety record to be
gone. The exact local cleanup deadline, if not same-transaction, is an explicit
P1.7 architecture choice and must not be inferred from the superseded 24-hour
proposal.

### Discussion, contributions, and publication

```text
discussion_destination: public | private_owner_only
mode switch: affects next item only

private human item: draft <-> edited -> publication_preview -> retained | deleted
publication_preview --owner + exact current revision--> distinct public human root revision 1
AI candidate: draft <-> edited -> publication_preview -> retained | deleted
publication_preview --owner + current exact capability--> public root revision 1

public contribution:
  revision 1 -> revision 2 -> ...                 (same actor/provenance)
  owner: retained -> author_withdrawn              (terminal body state)
  privacy: retained -> privacy_erased              (terminal body state)
  moderation: visible -> quarantined -> removed
              quarantined|removed -> visible       (appeal reversal only)
  payload: present -> inaccessible -> purged
```

The effective body precedence is `privacy_erased`, then account deletion, then
`author_withdrawn`, then moderation, then visible. Moderator reversal cannot
undo a higher-precedence state. Withdrawal/deletion removes every revision body
and retains only reply-safe non-linkable topology. Public counts include only
currently public visible contributions and remain split by immutable human/
agent type.

A root contribution owns the subthread identifier. Replies may identify a
direct target for context, but presentation keeps them under the same root and
primarily chronological. Moving a subthread moves its root plus complete reply
set atomically or not at all. `Summary` and every initial P1.7 fake-agent
publication are root-only; users may reply to them.

A quotation stores only an exact target/revision reference, not a copied body.
Rendering resolves the target's currently eligible text. Withdrawal,
moderation purge, or account/privacy deletion makes every quotation resolve to
the neutral `Deleted` state, so no copied excerpt can outlive its source body.

Public edits append a new body/version, mark the contribution `Edited`, and do
not change owner, actor type, agent provenance, root/parent, Topic, or public/
private origin. P1.7 exposes only the current public body; the owner may inspect
prior bodies until withdrawal/deletion. A later public revision-history viewer
needs its own product/privacy decision.

Publishing a private human item is a copy-by-authorized-transition, not a
visibility mutation. The command binds the private owner/item/current revision,
preview digest, human actor type, target Topic/Discussion versions, `root` mode,
null parent, account/global state, policy, and one idempotency key. The private
item remains private and no private parent, history, URL, or source label enters
the public Contribution.

The initial sort contract orders roots only and offers deterministic modes.
`Newest` uses root creation time plus a stable ID tie-break. `Popular` and
`Relevant` may use only versioned public reaction/activity, Topic-match
confidence, and other declared public signals. No private-page text, private
discussion activity, report volume, reporter identity, or private AI content is
a ranking feature.

Publishing an AI candidate creates a distinct public agent contribution rather
than mutating private data. The publication command binds owner, candidate ID
and revision digest, fake-agent ID/type, disclosed fake provenance, target
Topic/Discussion revisions, `reply_mode=root`, null parent, account/global
state versions, policy, and one exact idempotency key. A technical capability
may expire without deleting the candidate; the owner can create a new preview.
Its duration is chosen only at the separate P1.7 architecture gate.

Public agent provenance contains an opaque agent ID, built-in/custom definition
class, public owner/operator label, fake adapter/version, `provider=none`,
`model=synthetic`, policy version, publication time, and `human_edited` boolean.
It never exposes private prompt/result, internal account/session ID, private URL
or title, raw source body, or undisclosed tool input.

### Reports, suspension, bans, and appeals

```text
report: open -> triaged -> closed_dismissed
        triaged -> closed_actioned
        any nonterminal -> subject_deleted_closed | content_deleted_closed

appeal: closed_actioned -> appeal_eligible -> appeal_open
        appeal_open -> upheld_final | reversed_final
        appeal_eligible -> appeal_expired

removal batch: previewed -> confirmed -> visibility_denied
               -> cleanup_complete | reversed_where_eligible
```

Reports contain reporter ID separately from enumerated `reason_code` and an
optional explanation. Allowed reason codes are spam/scam, harassment, personal
data, copyright, dangerous/illegal content, off-topic, and other. Every field is
untrusted and safely rendered. The explanation is not copied into audit logs or
shown to the subject. The moderator sees the public target and bounded relevant
public thread context, never private content. At report commit, the case binds
the exact target contribution/revision ID, version, and body digest that was
public. An edit appends a new revision but cannot replace this evidence. Only
the assigned moderator may resolve the case-bound revision body, and only while
the case or appeal requires it.

The moderator may dismiss; remove the reported item; suspend; ban without
removing prior content; ban and remove the reported item; or ban and remove all
public human and owned-agent contributions/replies from that account. For a
bulk action, preview binds account/version, target IDs/versions, exact count,
reason/policy, the `account_owned_public_set_version`, and expiration chosen at
the architecture gate. Every public-set membership change increments that
version. If the account, set, or any target version changes before confirmation,
confirmation fails and requires a new preview. Under serializable commit, a
concurrent contribution either commits first and invalidates the preview or
sees the ban and denies. Confirmation atomically commits the ban and immutable
batch manifest and immediately denies selected public bodies; an exact
idempotent worker may purge them later.

The public placeholder is the neutral platform string `Deleted`. The affected
account sees reason, scope, count, deadline, and outcome, never reporter
identity. It has one appeal within seven days. One appeal covers a ban plus its
associated removal batch. Reversal restores only bodies retained for that
appeal and still eligible; withdrawal, account/privacy deletion, later valid
moderation, or a purged body cannot be reversed. Moderation-hidden bodies are
retained only as long as needed for the open appeal path, not for the later
metadata-only moderation record. Withdrawal or account/privacy deletion also
purges exact reported-revision evidence immediately and closes or limits the
case under the terminal precedence rules.

On reporter-account deletion, direct reporter mapping and optional explanation
are removed immediately. An already-open case may retain only non-identifying
reason/status codes needed to close. On subject deletion, every nonterminal case
reaches a deletion terminal, direct mappings and all subject bodies disappear,
and no appeal can resurrect them.

### Incident and containment

```text
incident: clear --security open--> contained --security close--> clear
restore: planned -> isolated -> rebuilding -> verified -> eligible_local
         isolated|rebuilding|verified -> aborted
```

Opening containment increments the global capability epoch and revokes ordinary
sessions, previews, agent invocations, publication capabilities, ordinary
workers, future export jobs, and restore promotion. It issues one narrowly
scoped incident-control capability for exact incident-state read, close, or
isolated-restore abort. It has no user/content/list/moderation/export authority.
Loss of that capability leaves the fixture contained until a conspicuous local
reset; no production recovery claim follows.

Containment allows public reading, own lifecycle-status inspection, logout,
owned-public-contribution withdrawal, a delete-account request/confirmation,
exact moderator hiding of a named public item, and already-authorized delete-
only cleanup. The effective user rights are the intersection of account-state
rights and this global allowlist. New appeals are denied while contained and
their seven-day deadline is paused for the contained interval; appeal reversal
and content restoration remain denied. It does not enable public edits, AI work,
publication, new ordinary jobs, Topic correction, or restore promotion. Closing
containment does not revive any revoked capability or session; the selected
synthetic identity must obtain new ordinary authority under the current state.

The incident record contains only incident ID, state, enumerated reason, times,
security role class, capability epoch, policy version, and lifecycle status. It
contains no free text, content, URL, affected-user list, report explanation, or
private evidence.

## Data lifecycle and retention

The approved defaults distinguish user content from technical safety records.
Manual retention is not authority to keep a deleted body. Expiry is inclusive
when a bounded record has `expires_at`: access denies and cleanup becomes due at
`now >= expires_at`. Read/retry does not extend a deadline.

| Data class/state | Approved local policy | Required behavior |
| --- | --- | --- |
| Selected synthetic identity | Until logout, actor switch, reset, deletion, or an explicitly defined process-restart boundary | No automatic timed logout; suspension/ban preserves selection but restricts authority; state/version change revokes ordinary capabilities. |
| Popup current-context envelope | Popup invocation lifetime only | No storage/log/egress; stale/unsupported clears every derived display field. |
| Raw page text from later approved local operation | Operation lifetime only | Memory-only; immediately discard; never enter discussion storage or snapshot. |
| Public contribution and all revisions | Until withdrawal, moderation purge, account/privacy deletion, or reset | Only current eligible body is public; terminal action removes every revision body and counts. |
| Owner-private discussion/draft | Until manual deletion, account deletion, or reset | Owner-only, non-sync local storage; no public cache/count/search or moderator access. |
| AI prompt/result/candidate | Until manual deletion, account deletion, or reset | Same isolation; publication creates a separate public record; candidate edits do not change agent type. |
| Agent definition | Until owner deletes it, account deletion, or reset | Inert declarative data; removing a definition does not relabel existing public provenance. |
| Publication/worker capability | Technical duration chosen at exact P1.7 architecture gate | Expiry revokes authority but never deletes the retained draft/candidate. |
| Open report/explanation and exact reported revision evidence | Through case review and appeal | Reporter mapping/explanation immediately removed on reporter deletion; exact reported body is assigned-case-only and edit-stable; withdrawal/account/privacy deletion purges it immediately. |
| Closed report evidence | No later than 30 days after final closure | Bounded reason/status fields only; no body, reporter explanation, or direct deleted-account mapping. |
| Minimal moderation action | 90 days after final action/reversal/appeal closure | Structured action/batch scope, reason, time, role, and outcome only; no retained removed body after appeal need ends. |
| Ordinary security/auth event | 30 days after event | Allowlisted metadata only; no content, tokens, report text, prompt/result, or full URL. |
| Incident-linked security event | 90 days after incident closure | Enumerated incident fields only; no automatic indefinite extension. |
| TopicCorrection actor/evidence mapping | At most 90 days after correction | Restricted event pseudonym and structured reason/version only; then role class only. |
| Non-personal TopicCorrection topology | Local fixture/discussion lifetime | Opaque old/new Topic/Source topology, versions, outcome, time, role; no personal/free-text source material. |
| Synthetic snapshot and safety ledger | Isolated test run until verified cleanup/reset; exact duration is an architecture-gate choice | Synthetic fixture data only; never owner real-page/private-browser-derived state; safety events override restore. |
| Future semantic query/representative | Outside P1.7 | ADR-013 and separate retention/privacy/security approval required. |
| Future export archive | Outside P1.7 | Central web privacy center and exact schema/security lifecycle required before real accounts. |

`Reset all local data` is development-only, explicitly confirmed, and clears
every declared local identity, content body/revision, private item, report,
moderation/correction record, mapping, log, capability, snapshot, projection,
and safety record. It is not a production data-lifecycle substitute.

## Account-deletion inventory

An unlisted account-linked class is a test failure, not permission to retain it.
The exact P1.7 architecture must assign each implemented class a same-
transaction purge or a named measurable cleanup deadline.

| Asset | Immediate effect at commit | Required retained minimum | Restore rule |
| --- | --- | --- | --- |
| Selected identity, sessions, previews, agent/worker capabilities | Revoke and deny | Non-linkable completion outcome only if needed for current cleanup | Never revive; stale version denies. |
| Profile, preferences, direct account mapping | Hide and deny | Non-recycled tombstone only where integrity requires it | Deletion event overrides snapshot. |
| Private discussions, drafts, prompts, AI results/candidates | Deny every read/list/cache | None after cleanup | Ineligible for snapshots; never restore. |
| Agent definitions and private agent configuration | Disable and deny | Public contribution may retain non-identifying agent type/fake provenance | Direct mapping never restores. |
| Public human contribution and every revision | Hide every body immediately | `Deleted` topology, non-identifying author type only if needed | Erasure event overrides snapshot, counts, search, and correction. |
| Public owned-agent contribution and every revision | Hide every body immediately | `Deleted` topology and non-identifying agent type only | Same; no owner/operator link restores. |
| Reactions/votes | Remove account-owned effect | Recomputed public aggregate without account link | Suppression event precedes rebuild. |
| Report submitted by account | Remove reporter link/explanation immediately | For open case, non-identifying reason/status only; otherwise none | No reporter mapping restores. |
| Exact reported revision evidence authored by account | Hide and purge immediately | Target ID/version/digest only if a still-open case needs a non-content terminal outcome | No edit, appeal, or restore recovers the body. |
| Report/action against account | Hide erased target body and close deletion terminal | Minimal bounded action/outcome under its 90-day rule | Cannot restore body or reopen appeal. |
| Suspension/ban/removal batch | Stop account enforcement after identity deletion; body deletion still wins | Non-identifying action outcome only to moderation deadline | No account/body link restores. |
| Publication/idempotency receipt | Revoke unpublished action and remove owner/private digest | Non-identifying public topology only if integrity needs it | No retry reconstructs private body. |
| Security/auth direct mapping | Restrict immediately | Non-linkable decision/outcome until approved event deadline | Direct mapping never restores. |
| TopicCorrection actor mapping | Remove direct link | Event pseudonym up to 90 days, then role-only topology | Redact before projection rebuild. |
| Synthetic restore-safety/deletion record | Restrict to lifecycle/security test | Exact opaque suppression fields until all affected synthetic snapshots cannot restore the subject | Mandatory safety replay; reset purges. |

`Account inaccessible` is reported at commit. `Service data deleted` is reported
only after every declared serving/projection copy denies the data. `Fully
purged` is reported only after every eligible synthetic snapshot and safety
record that can link the subject is gone. The local PoC makes no claim about
undeclared workstation backups.

## Centralized future export

No P1.7 endpoint, archive, worker, or download capability generates user data.
The model nevertheless records owner, actor type, visibility, revision,
moderation, deletion, and lifecycle state explicitly so a future central web
privacy center can be designed without reconstructing ownership from logs.

Before real accounts or public operation, the central website must provide a
usable data-access route and receive an exact field/value schema, third-party
data treatment, authentication, expiry, encryption, operator-access, deletion,
and store-policy review. Extensions/mobile clients link to the website rather
than implementing separate archives. Suspension/ban cannot remove the future
right to access that route. Account-deletion UI must offer the link before final
confirmation. None of these requirements authorizes implementation now.

## Synthetic snapshot and restore

Snapshot/restore exists only to prove that safety events cannot be lost. An
eligible snapshot contains generated accounts and discussion fixtures only and
atomically captures its state plus committed transition sequence. It excludes
raw/derived owner real-page context, private browser state, exports, secrets,
and provider material.

An isolated restore declares `RPO = snapshot_sequence` and lists expected loss
of later non-safety synthetic data. Before any local read-model swap it replays
every later withdrawal, account/privacy deletion, moderation removal/reversal,
suspension, ban/batch, Topic correction, containment, and policy migration;
rebuilds counts, indexes, and projections; and runs negative visibility checks.
The final atomic safety-watermark fence must still equal the replayed watermark.
A concurrent safety event makes the attempt stale and forces replay or abort.

Containment remains active during recovery. `eligible_local` means only that
the isolated synthetic fixture may be queried by its test; it is never a
reachable service or evidence of production backup/recovery. Real backup scope,
encryption, provider, region, RPO/RTO, retention, deletion, restore access,
cost, and drills require explicit later owner, provider, Security, Privacy,
Deployment, Spending, and Publication gates.

## Audit, rendering, agent-definition, and language safety

Audit events allow only event ID, time, action, object classes, event-scoped
pseudonymous principal reference, decision/reason code, policy/version, batch or
correlation ID, and enumerated outcome. They never contain bodies, prompts,
results, report explanations, credentials, full URLs, page metadata, private
source labels, export payloads, or free-form operator notes.

Append-only integrity is not authority to keep personal data. Direct mappings
and evidence are separate lifecycle objects. An accidentally logged body,
private URL, metadata value, prompt/result, report explanation, token, or direct
identifier is a security incident requiring purge; a redaction marker alone is
insufficient. A stable hash or opaque actor ID remains pseudonymous when it can
be linked and is not described as anonymous.

Every contribution, explanation, agent definition/name, language-pack string,
Topic label, and page-derived field is untrusted. Safe text rendering and
allowlisted URL schemes are mandatory. Language packs and agent definitions are
data-only signed/bundled or owner-local resources in P1.7; they cannot import
script, HTML, executable templates, prompts with platform authority, or network
tool declarations. Built-in labels use stable message keys and English fallback.

## Topic correction interaction

`Not the same topic` creates a correction signal, not a remap. Only a correction
operator may commit Source reassignment, Topic merge/split/reversal, or a whole-
subthread move under ADR-005. New lookups use a committed mapping immediately.
Automatic matchers may generate candidates but have no correction capability.

Existing public conversation is not silently moved. The operator binds an exact
root ID/version, complete reply ID/version set, and subthread-membership version.
Every reply membership change increments the fence. The atomic command
revalidates it and moves all or none; a concurrent reply makes the preview stale
and an individual reply cannot be detached. Alternatively, the subthread stays
at its old Topic with a neutral `Source mapping corrected` notice. A private
subthread remains private and never supplies public correction evidence.

History may retain event ID, operation/reason, opaque input/output Topic and
Source IDs, mapping/matcher/policy versions, outcome, time, role class, and
reversal link. It may not preserve raw URL/title/body, private AI material,
report text, IP/user-agent, or free-text evidence. Direct actor linkage is
removed on account deletion; an event-scoped pseudonym expires within 90 days,
after which role-only topology remains. Deletion tombstones override all
historical projections.

## Threats, controls, and required evidence

| Threat | Required control | Evidence owner |
| --- | --- | --- |
| Silent/background browsing collection | Popup-open gesture, one active top-level document, no background/list/all-tabs permission or loop | Platform; Trust; Quality capability tests |
| Stale/mixed-document render | Initial/final tab, URL, document/version attestation; clear all fields on mismatch/close/error | Platform; Quality navigation/concurrency tests |
| Authenticated/private-page leakage | No tokens/forms/attachments, raw memory-only, no storage/log/egress; body/AI separate from auto-load | Privacy/Trust; Quality storage/network/log tests |
| Derived AI output repeats secrets | Explicit private-content input decision, sensitive-output warning, unpublished candidate, no auto-publication | Trust/Privacy; Quality disclosure/publication tests |
| Cross-owner private read | Trusted owner scope on get/list/cache/revision paths; generic denial | Platform; Trust negative matrix; Quality generated coverage |
| Human/agent impersonation | Immutable actor type/provenance, separate constructors/filters/counts, client fields rejected | Platform; Trust; Quality provenance tests |
| Custom agent or language pack expands authority | Data-only schema, safe rendering, allowlisted definitions, platform-owned capability intersection | Platform; Trust; Quality hostile-input tests |
| Accidental/private-to-public publication | Current-revision preview, exact owner capability, root target, explicit publish, idempotent commit | Platform; Trust concurrency tests |
| Silent edit or revision resurrection | Append-only revisions; visible marker; terminal states hide/purge every revision and override restore | Platform; Privacy; Quality revision/deletion tests |
| Reply corruption during Topic correction | Root plus complete reply-set atomic move; no isolated reply move; stale versions deny | Correction/Platform; Quality topology tests |
| Opaque/manipulated ranking | Versioned public-only features, stable ties, selectable modes, no report/private signal | Product/Trust/Quality formula tests |
| Report brigading/retaliation or edit-to-evade review | No report-count action, rate class, reporter separation, exact reported-revision binding, moderator decision and appeal; withdrawal/deletion precedence | Trust/Moderation; Quality abuse/race tests |
| Bulk-ban overreach or race | Preview exact set/count/versions, confirmation, atomic visibility deny, idempotent batch, one appeal | Platform/Moderation; Quality race/rollback tests |
| Moderator private-data access | Public report context only; matrix denial; no break glass | Trust/Privacy; Quality role negatives |
| Overpowered worker | Exact receipt, no discovery, body denial, state/epoch/version binding | Platform; Trust abuse tests; Quality receipt matrix |
| Cleanup blocked by suspension/incident | Separate exact delete-only capability survives only for committed due purge | Platform; Privacy; Quality containment tests |
| Removed/deleted content restored | Terminal precedence, safety ledger, complete replay/rebuild, current watermark fence | Platform/Operations; Quality restore tests |
| Deferred-export ambiguity | No generator now; explicit owner/lifecycle fields; real-account gate requires central route | Privacy/Product; schema-readiness review |
| Audit/log privacy leak | Exact field allowlist; explanations/content separate; no full URL; retention and purge tests | Trust/Privacy; Quality static/runtime scans |
| Incident control becomes admin | Exact incident-only capability; no content/list/moderation/export authority | Security; Trust; Quality transition tests |
| XSS/link/prompt instruction injection | Treat all strings as data; safe rendering; allowlisted links; no text grants authority | Platform; Trust payloads; Quality rendering tests |
| One-person role confusion | Structural role separation and event role class; no claim of independent staffing | Lead; later independent review gate |

## Required P1.7 contract tests

The exact P1.7 architecture must map every implemented authorization cell,
state edge, retention deadline, and deletion row to a named test. An absent
reference fails the architecture gate.

| Test ID | Required coverage | Implementation/test owner | Review oracle |
| --- | --- | --- | --- |
| `P17-CONTEXT-AUTOLOAD` | Popup open starts URL/approved-metadata/local lookup without second button; active top-level only; exact scheme/origin/field/byte eligibility; authenticated/private envelope handling; frames, body, cookies, tokens, forms, and attachments denied; stale navigation/closure/unsupported/error clears all fields; no AI/storage/network | Platform/Client and Quality | Trust/Security plus Privacy |
| `P17-AUTH-MATRIX` | Every explicit cell and unlisted denial; owner/cross-owner, state/version/global epoch, generic zero-mutation failures | Platform and Quality | Trust/Security |
| `P17-IDENTITY-SESSION` | Immutable human/agent type; persistent selected identity; logout/switch/reset; suspension/ban/containment restriction; no timed logout | Platform and Quality | Trust plus Privacy |
| `P17-DISCUSSION-VISIBILITY` | Public/private next-message destination, owner-only private lists, no retroactive switch, exact-current-revision preview that publishes one private human item as a distinct public root without private parent/history, manual deletion, no moderator/private cache/search/count access | Platform and Quality | Privacy/Policy plus Trust |
| `P17-AGENT-PREVIEW` | Built-in/custom definition schema, fixed deterministic fixture producer, editable retained candidate, source/tool disclosure, human-edited marker, explicit root publication, idempotency and races, no adapter/provider/network | Platform and Quality | Trust/Security plus Privacy |
| `P17-THREAD-REVISION-SORT` | Root/reply grouping, Summary root-only, chronological replies, reference-only quotations that follow target visibility, deterministic public-only sorting, append revisions, Edited marker, all-revision withdrawal/deletion | Platform and Quality | Product, Trust, Privacy |
| `P17-MODERATION-BAN` | Report reasons/explanation isolation, exact reported-revision binding and report-vs-edit/withdraw/deletion races, no count auto-action, dismiss/remove/suspend/ban, reported-only/all-public preview with account-owned-public-set fence, concurrent-create ordering, exact batch, owned-agent inclusion, one seven-day appeal, terminal deletion races | Platform and Quality | Trust/Moderation plus Privacy |
| `P17-WORKER-INCIDENT` | Exact ordinary/cleanup receipts; worker denial on account-deletion request/confirm; discovery/body denial; containment revocation and account/global-right intersection; public read/status/logout/withdraw/delete and exact-hide allowlist; appeal-deadline pause and restore denial; close/abort scope; no capability revival | Platform and Quality | Trust/Security plus Privacy |
| `P17-DELETION` | Second-confirmation commit, every inventory row and revision, immediate deny, service/physical milestones, reporter-text removal, reference-only quotations resolving to `Deleted`, tombstone non-linkability, negative queries | Platform and Quality | Privacy/Policy plus Trust |
| `P17-RETENTION-RESET` | Manual content retention; report 30-day, moderation 90-day, security 30/90-day, correction-pseudonym 90-day boundaries; cleanup during containment; full confirmed reset | Platform and Quality fake clock | Privacy/Policy |
| `P17-RESTORE` | Synthetic-only capture, real-page/private-browser exclusion, safety replay, rebuild, watermark races, containment, abort, never-reachable assertion | Platform/Operations and Quality | Trust/Security plus Privacy |
| `P17-CORRECTION` | Not-same signal only; Source reassignment/merge/split candidates; whole-root move with subthread-membership fence and concurrent-reply rejection, or notice; no isolated reply or automatic commit; actor-deletion redaction | Correction/Platform and Quality | Trust plus Privacy |
| `P17-EXPORT-READINESS` | Every persisted class has owner, visibility, lifecycle, and future-export classification; prove no export endpoint/archive/download exists | Platform and Quality | Privacy/Policy |
| `P17-RENDER-I18N-LOG` | Hostile content/agent definitions/language packs/report text; safe rendering/link schemes; stable English fallback keys; exact log allowlist; no content/private URL/secret | Platform and Quality | Trust/Security plus Privacy |

The named roles are accountable lenses and artifacts, not claims that different
people exist. Independent qualified review remains a later real-user/publication
gate.

## P1.6 owner decisions and review status

The owner explicitly accepted the following amended package on 2026-09-24:

- owner-only local tests may use lawfully accessible public, authenticated, or
  private active pages within the no-bypass/no-background/no-egress boundary;
- opening the popup is the invocation and automatically loads URL, approved
  metadata, and local mapping without a second button;
- immutable distinct human/agent identity, provenance, counts, and rate classes;
- persistent selected synthetic identity, no password/provider, and no timed
  auto-logout;
- public Topic Discussion plus owner-only Private Discussion, explicit per-item
  publication, and no retroactive or automatic publication;
- deterministic fake-agent drafts, permission-bounded definitions, visible
  inputs/tools/sources, and extensible English message-key UI;
- root subthreads, grouped replies, root-only Summary, deterministic root
  sorting, append-only public revisions, and terminal withdrawal tombstones;
- no user mute/block; reports, moderator suspension/ban/removal, confirmed
  reported-only/all-public removal, and one seven-day appeal;
- structurally separate operators/workers, delete-only cleanup, contained-mode
  public read/exact moderation, and no private break glass;
- account deletion of every private item, direct identifier, and owned human/
  agent revision body, retaining only non-linkable reply topology;
- manual user-content retention, bounded report/moderation/security records, and
  a confirmed development-only reset;
- export deferred to one future web Account & Privacy Center;
- synthetic-only restore testing and no real backup promise;
- reviewed Topic correction with whole-subthread movement and minimized actor
  history; and
- solo local role fixtures with explicit later independent, provider, privacy,
  security, legal/store, deployment, spending, and publication gates.

The 2026-09-23 AI ACCEPT dispositions reviewed the superseded baseline and are
historical evidence, not approval of these amendments. Fresh read-only AI
Trust/Security, Privacy/Policy, and Quality reviews each returned ACCEPT on the
reconciled amended package on 2026-09-25, with no remaining blocker or major
contradiction. They are design-review lenses, not independent human, legal/
store-policy, penetration-test, or implementation evidence.

## Stop/go boundary

**GO to the architecture-authorization checkpoint:** the amended-design reviews
all ACCEPT. The owner must now separately approve one exact P1.7 architecture:
modules, state store, browser bridge fields/contexts, synthetic fixtures, fake-
agent surface, capability/cleanup/snapshot durations, tests, and excluded
capabilities. Only that later approval authorizes implementation.

**Allowed direction, not current implementation:** an exact approved local
browser bridge may automatically inspect the invoked active top-level URL and
approved metadata on owner-accessible public, authenticated, or private pages.
A later exact local body-processing experiment may use ephemeral raw content
only after its Security/Privacy gate. Neither path may persist or egress raw
page content.

**STOP:** real accounts/identifiers; external identity, AI, search, model, or
other provider; background browsing or inbox scanning; page-content persistence
or egress; reachable server/matcher/index; real public posting; production
moderation; telemetry; real backups; centralized export implementation;
infrastructure purchase; recruitment; deployment; store submission;
announcement; or publication. Each requires its own recorded owner and
applicable Security, Privacy, Policy/legal, provider, spending, deployment, or
publication approval.

The completed 6/6 synthetic owner review is not repeated. The later 200-250-pair
provenance-approved semantic review has not been bypassed; when it becomes the
next required roadmap step, work stops for explicit provenance, acquisition,
and reviewer approval.
