# Phase 1 auth, identity, moderation, and data-lifecycle threat model

Status: Proposed P1.6 local/synthetic design; AI Trust/Security,
Privacy/Policy, and Quality review ACCEPT; explicit owner gate open;
implementation not authorized

Date: 2026-09-23

Owners: Trust, Security, Privacy, and Policy, with Platform, Lead, and Quality
review

## Scope and non-claims

This document defines the minimum authorization and lifecycle contract needed
before a disposable P1.7 local API experiment. It covers synthetic identities,
object authorization, human/agent separation, private-to-public publication,
reports, blocks, moderation, operator access, audit, account deletion/export,
retention, backup expiry, and incident states.

P1.6 is documentation only. It creates no account, authentication mechanism,
identity-provider integration, database, network listener, real-user record,
telemetry, provider call, public post, deployment, or legal-compliance claim.
The first implementation may use only deterministic synthetic principals in a
network-denied local process after both the P1.6 gate and the separate owner
authorization for the exact disposable-local P1.7 architecture are accepted.

The broader product may eventually have a global public Topic/Discussion
namespace. That does not make account-owned drafts, private agent results,
block relationships, reports, exports, or operator notes public. “Tenant” in
the authorization checks below means the owning security scope; it does not
commit the product to a commercial multi-tenant model.
`public` or `public_visible` in P1.7 means visible only to authorized synthetic
principals inside the disposable, network-denied process; it is not Internet
publication or a publicly reachable post.

## Safety objectives and invariants

1. Every request is denied unless an exact action is allowed for a
   server-derived principal, object, lifecycle state, and current version.
2. Human and agent actor types are immutable and disjoint. A client, page,
   model, comment, or agent cannot select or upgrade its actor type.
3. An agent cannot authenticate as a human, publish autonomously, moderate,
   report, change permissions, or execute Topic corrections in the initial
   design.
4. Private agent input and output are owner-bound, excluded from public
   search/counts/caches, and invisible to moderators during ordinary work.
5. Publishing agent output is a separate human-owner action bound to the
   current preview digest, target Topic, actor provenance, expiry, and a
   single-use publication capability plus a separately replayable exact-command
   idempotency key. It creates a distinct public agent-authored Contribution;
   it never relabels the private result or a human actor.
6. Public counts include only currently public and visible Contributions and
   keep humans and agents separate. Reports, drafts, private results, removed
   content, and deletion tombstones never count.
7. Moderation, privacy deletion, and account deletion override Topic lineage,
   correction history, projections, caches, exports, and restored backups.
8. A report alone grants no authority and does not reveal private content or
   automatically prove abuse. Moderator actions are explicit and auditable.
9. Blocks are private account-owned controls. They are not public reputation
   signals and cannot grant access to another object. A distinct mute feature
   is deferred rather than conflated with block semantics in P1.7.
10. No ordinary role is a universal administrator. Moderation, privacy,
    correction, and security/restore authorities are separate scopes even if
    synthetic tests are currently operated by one project owner.
11. The first local contract has no in-place public Contribution edit. A later
    edit feature requires append-only revision semantics and a new reviewed
    action; clients cannot overwrite author text or provenance.
12. Human and agent actions use separate rate classes. An agent produces at
    most one bounded private result per invocation and cannot invoke another
    agent or retry recursively.
13. Every relationship action authorizes all participating objects and their
    versions atomically. A readable global-public object never lends write
    authority to a private or cross-partition object.
14. One immutable private-result version can create at most one public
    Contribution. Idempotent retries may return that same Contribution, but no
    new preview or token can publish it twice or retarget it.
15. Public queries and counts implement explicit `human`, `agent`, and `all`
    modes. Agent content cannot enter a human-only result and separate counts
    are derived from immutable actor types rather than client labels.

## Assets and classification

| Asset | Classification | Minimum handling |
| --- | --- | --- |
| Session/authentication material | Secret | Never accept through page content, URLs, logs, analytics, or fixtures; revoke on suspension/deletion; no real secret in P1.6/P1.7. |
| Human account identifiers/profile | Restricted personal data | Owner and narrowly scoped operators only; minimize, export, and delete under an accepted policy. |
| Agent identity/provenance | Public when attached to a public Contribution; otherwise restricted | Actor class is immutable; owner/operator and model/provider fields follow explicit disclosure/minimization rules. |
| Public Contribution and revision history | Public-intended, integrity-critical | Safe rendering, stable author type, revision/moderation state, deletion override, and no silent reauthoring. |
| Private prompt/result/draft | Highly restricted owner content | Owner-only; no public count/search/shared cache; no ordinary moderator access; memory or disposable synthetic state for at most 24 hours. |
| Block relationship | Restricted social graph | Visible only to the blocker and authorization service; never exposed to the blocked actor as a list. |
| Report and reporter identity | Restricted abuse data | Reporter and scoped moderation roles only; protect against retaliation and report brigading. |
| Moderator note/action | Restricted operational data | Scoped moderators; bounded structured reason/evidence codes only in P1.7; free text is deferred. |
| TopicCorrection event | Integrity-critical audit data | Correction operator only; retain non-personal topology history while deletion/redaction overrides personal payloads. |
| Security/auth audit event | Restricted security data | Allowlisted metadata only; no content, tokens, raw browsing URLs, or private prompts/results. |
| Export bundle | Highly restricted temporary copy | Owner-bound, encrypted where persisted, single-purpose, short expiry, no other users’ private/moderator data. |
| Deletion ledger and backup inventory | Restricted operational data | Privacy/security operator only; restoration must reapply deletions before service. |

## Principals and authority scopes

| Principal | Intended authority | Explicit denial |
| --- | --- | --- |
| Anonymous reader | Read public, visible Topic/Discussion/Contribution data if the owner later approves unauthenticated reading | Every mutation, private data, reports, blocks, exports, audit, operator data |
| Human account | Act as itself; read public data; own private results; explicitly submit human Contributions; preview/publish its agent result; manage its block list; request export/deletion | Choosing another actor/owner, self-assigning roles, autonomous agent publication, moderation/correction/restore |
| Scoped agent runtime | An internal-job principal, not a direct agent credential; read only the invocation’s approved input and write one bounded private result for its owning human | Human authorship, general object listing, public posting, reports, moderation, correction, export/deletion, tools/network unless separately approved |
| Moderator | Read public content and assigned reports; quarantine/remove/restore under policy; record bounded actions | Routine private-result access, human/agent impersonation, account export, backup restore, Topic correction unless separately scoped |
| Correction operator | Execute reviewed TopicCorrection commands under ADR-005 conditions | Contribution reauthoring/publication/deletion, private-result access, backup restore |
| Privacy operator | Execute verified export/deletion workflow and inspect its status | Reading unrelated content bodies, moderation merits, public posting, Topic correction |
| Security/operations operator | Revoke sessions, contain incidents, run authorized backup/restore, and use the narrow incident-control session described below | Routine content browsing, publication, moderation merits, changing audit history |
| System worker | Perform one exact queued ordinary or delete-only safety-cleanup action over an allowlisted object set under the bound policy/epoch | Ambient role authority, object discovery, inventing authority, changing actor type/owner/target, expanding scope, replay after expiry/revocation |

Role aliases in a local fixture are not evidence of independent people,
separation of duties, or production staffing. A qualified independent human
security/privacy/policy review becomes necessary before real accounts, real
personal data, network exposure, or a public alpha; it is not needed merely to
draft or test the synthetic contract.

## Deny-by-default authorization decision

Every boundary evaluates an immutable canonical command equivalent to:

```text
authorize(
  principal_id, principal_type, authenticated_session_version,
  session_class, global_security_state, global_capability_epoch,
  action,
  participants[(relationship_role, object_type, object_id,
    authorization_partition_id, owner_scope_id, object_state, object_version)],
  policy_version, request_nonce?, idempotency_key?, capability_digest?,
  expires_at?
)
```

The trusted adapter derives principal identity, type, roles, session class and
version, global security state/capability epoch, participant relationships, and authorization partitions. Client-supplied
actor, owner, visibility, moderator, model, Topic, parent, report target, block
target, or tenant fields are untrusted requested values, never authority.
Every action has an exact participant schema. Unknown fields, actions, roles,
object states, extra/missing participants, cross-scope identifiers, stale
versions, expired capabilities, and missing context deny before mutation.
Parent/child, reply, report, block, publication, correction, export, and worker
commands validate every participant; any required same-partition relation must
hold atomically. A global-public participant grants read context only.
Existence-sensitive failures use a generic response so object IDs cannot be
enumerated.

Authorization and mutation occur in one transaction or one pure local state
transition. Every commit revalidates the global security state/capability epoch
plus every participant/session/lifecycle/policy version. A successful check
cannot be reused for a later version or epoch. Ordinary workers carry a receipt
bound to exactly one action, object set, partition, participant versions,
global epoch, policy version, and expiry; either account hold, global
containment, deletion commitment, or session-version change revokes it.
They do not inherit the queue producer's privileges and cannot list or discover
objects. Logs record only event ID, time, action, object classes, pseudonymous
principal reference, decision/reason code, policy version, and correlation ID.
They never record bodies, prompts, results, credentials, unreviewed URLs,
export payloads, block graphs, or free-text evidence.

Two narrow safety capabilities prevent containment from blocking recovery or
privacy deadlines:

- A `safety_cleanup` worker receipt is issued by the trusted lifecycle engine,
  not by a user session. It permits only an already-authorized delete/expire
  step for the exact lifecycle classes declared below: expired sessions,
  previews, and capability/worker/publication receipts; private results;
  disposable-campaign primary/derived/cache/index state; exports; block edges;
  committed account deletion; post-withdrawal or privacy-erasure payloads/
  projections; snapshots; restore/deletion ledgers and non-linkable outcomes;
  closed-report evidence; moderation actions; security/auth and incident
  events; and TopicCorrection evidence/operator mappings. It may read
  identifiers, state, and enumerated outcome fields needed for that exact purge,
  but no content body, and it cannot create, disclose, export, publish, restore,
  change a moderation outcome, or broaden a target/deadline. Account holds and
  global containment do not pause it. The receipt records the current global
  capability epoch. Every
  global-security transition atomically consumes each outstanding cleanup
  receipt and, for every still-current pending step, issues a replacement with
  the same target/action/deadline plus current object/stage versions in the new
  epoch. A stale or completed step gets no replacement. If that replacement set
  cannot commit, the security transition does not commit. Reset or completion
  consumes it without replacement.
- Opening containment with an ordinary current Security session atomically
  issues one `incident_control` session bound to the incident ID/version,
  containment epoch, policy, and non-sliding campaign deadline. It survives
  that containment only to read the exact incident state, close it, or abort
  its isolated restore. It has no user/content/list/export/moderation power and
  expires on incident closure or reset. Losing/expiring it leaves the local
  fixture safely contained until visible reset; no production recovery claim
  follows.

A separate hold-scoped export capability does not survive containment. A
moderation hold first revokes every pre-hold session, export job, and ordinary
worker. The owner may then obtain the purpose-limited session described below
and request a new export. Its serializer receives a `moderation_hold_export`
receipt bound to that owner request, immutable export snapshot/schema,
moderation-hold ID/version, clear security-hold state, account lifecycle/session
versions, global clear state/epoch, policy, and expiry. It has no list/discovery
or unrelated-object authority. A moderation-hold change, security hold,
containment, deletion, session-version change, or expiry revokes it. It is not a
safety-cleanup capability.

All mutations serialize under a monotonic transition sequence and revalidate
every participant version, account lifecycle epoch, and global security state/
capability epoch at commit. A stale or losing command returns a conflict with
zero mutation. If privacy/deletion
and another transition race, committed sequence—not wall-clock comparison—is
the tie rule, and a committed privacy/deletion transition prevents any later
visibility restoration. An exact retry with the same idempotency key and
identical canonical command returns the recorded outcome; reuse of that key
with any differing byte, participant, version, or policy value denies.

## Authorization matrix

`C` means allowed only with the stated condition. `D` means deny. `BG` means a
separately approved, time-bounded break-glass incident/legal path; it is not an
ordinary moderator permission.

| Action | Anonymous | Owning human | Other human | Scoped agent | System worker | Moderator | Privacy operator | Correction operator | Security/ops |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Read public visible content/counts | D initially | C | C | C: invocation allowlist only | C: exact receipt only | C | C: workflow need only | C | C: incident need only |
| Read one private agent result | D | C: exact owner | D | C: current invocation readback only | C: exact invocation or export receipt only | D | D | D | BG |
| List owned private agent results | D | C: bounded exact-owner list | D | D | D | D | D | D | D |
| Submit a human-authored Contribution | D | C: explicit submit as self | C: as self | D | D | D | D | D | D |
| Authorize one bounded fake-agent invocation | D | C: exact owner/agent/input/rate class, global clear | D | D | D | D | D | D | D |
| Produce a private agent result | D | D | D | C: one owner-bound invocation | D | D | D | D | D |
| Edit a private agent result | D | D: immutable in P1.7 | D | D | D | D | D | D | D |
| Delete a private agent result | D | C: exact owner/current version | D | D | C: exact `safety_cleanup` receipt | D | D | D | D |
| Expire a private agent result | D | D | D | D | C: exact `safety_cleanup` version/deadline | D | D | D | D |
| Bind an initial unpublished preview | D | C: exact owner/current canonical digest | D | D | D | D | D | D | D |
| Replace an unpublished preview | D | C: exact owner/current digest; revoke prior capability | D | D | D | D | D | D | D |
| Publish a root-level agent Contribution | D | C: current preview/capability, null parent, and all participant versions | D | D | D | D | D | D | D |
| Edit a public Contribution | D | D: unsupported in P1.7 | D | D | D | D | D | D | D |
| Withdraw an owned Contribution | D | C: exact owner/current version | D | D | C: exact committed-deletion receipt only | D | C: committed-deletion workflow only | D | D |
| Report a public Contribution | D | C: authenticated human, rate-limited | C: as self | D | D | D | D | D | D |
| Triage an open report | D | D | D | D | D | C: assigned scope, open -> triaged | D | D | D |
| Dismiss a triaged report | D | D | D | D | D | C: assigned scope, triaged -> closed_dismissed | D | D | D |
| Submit an appeal | D | C: affected human or owner of affected agent Contribution | D | D | D | D | D | D | D |
| Uphold an appeal | D | D | D | D | D | C: appeal_open/current action -> upheld_final | D | D | D |
| Reverse an appeal and restore content | D | D | D | D | D | C: atomic current appeal+Contribution transition | D | D | D |
| Create a block | D | C: blocker is self | C: blocker is self | D | D | D | D | D | D |
| Revoke a block | D | C: exact blocker/current version | C: exact blocker/current version | D | C: endpoint `safety_cleanup` only | D | D | D | D |
| View reporter identity or moderation notes | D | D | D | D | D | C: assigned scope | C: deletion-relevant mapping/status only | D | BG |
| Read retained body of moderation-removed content | D | D | D | D | D | C: assigned appeal/policy need only | D | D | BG |
| Action a triaged report and quarantine content | D | D | D | D | D | C: atomic triaged+visible -> closed_actioned+quarantined | D | D | D |
| Remove quarantined public content | D | D | D | D | D | C: quarantined -> removed, policy/version/reason | D | D | D |
| Place a moderation account hold | D | D | D | D | D | C: clear -> held, exact reason/version | D | D | D |
| Clear a moderation account hold | D | D | D | D | D | C: own held -> clear, current version | D | D | D |
| Place a security account hold | D | D | D | D | D | D | D | D | C: clear -> held, exact reason/version |
| Clear a security account hold | D | D | D | D | D | D | D | D | C: own held -> clear, current version |
| Open a security incident and enter global containment | D | D | D | D | D | D | D | D | C: ordinary current session; atomically issue incident control |
| Read exact contained-incident state | D | D | D | D | D | D | D | D | C: matching `incident_control` session only |
| Close a security incident and clear global containment | D | D | D | D | D | D | D | D | C: matching `incident_control` session/current version |
| Execute Topic merge/split/reversal | D | D | D | D | D | D | D | C: accepted ADR-005 command | D |
| Request an owner export | D | C: fresh ordinary or held-purpose reauthentication; security hold/global containment clear | D | D | D | D | D | D | D |
| Generate an export | D | D | D | D | C: exact ordinary or `moderation_hold_export` receipt/schema/snapshot; security hold/global containment clear | D | D | D | D |
| Expire/purge a session, preview, or capability/worker/publication receipt | D | D | D | D | C: exact `safety_cleanup` class/version/deadline receipt | D | D | D | D |
| Purge due disposable-campaign primary/derived/cache/index state | D | D | D | D | C: exact `safety_cleanup` class/version/deadline receipt | D | D | D | D |
| Purge an export | D | D | D | D | C: exact `safety_cleanup` for downloaded/expired/revoked/failed job | D | D | D | D |
| Expire/purge a synthetic snapshot | D | D | D | D | C: exact `safety_cleanup` snapshot/deadline receipt | D | D | D | D |
| Reduce or purge a lifecycle ledger | D | D | D | D | C: exact `safety_cleanup` stage/schema/deadline receipt | D | D | D | D |
| Purge due report evidence or moderation action | D | D | D | D | C: exact `safety_cleanup` class/state/deadline receipt | D | D | D | D |
| Purge due security/auth or incident event | D | D | D | D | C: exact `safety_cleanup` class/state/deadline receipt | D | D | D | D |
| Purge due TopicCorrection evidence/operator mapping | D | D | D | D | C: exact `safety_cleanup` class/state/deadline receipt | D | D | D | D |
| Advance committed withdrawal/privacy-erasure cleanup | D | D | D | D | C: exact `safety_cleanup` object/state/deadline receipt | D | D | D | D |
| Download an owner export | D | C: same owner/fresh ordinary or held-purpose reauthentication; security hold/global containment clear; single use | D | D | D | D | D | D | D |
| Request account deletion | D | C: exact owner/current lifecycle epoch | D | D | D | D | D | D | D |
| Cancel uncommitted account deletion | D | C: exact owner/current `deletion_requested` | D | D | D | D | D | D | D |
| Confirm irreversible account deletion | D | C: fresh ordinary or held-purpose reauthentication/current lifecycle epoch | D | D | D | D | D | D | D |
| Advance committed deletion cleanup | D | D | D | D | C: exact `safety_cleanup` stage/version/deadline receipt | D | D | D | D |
| Inspect own lifecycle status | D | C | D | D | D | D | C: exact assigned case/status only | D | D |
| Read security audit | D | D | D | D | D | D | C: deletion-relevant subset | D | C: scoped incident |
| Build an isolated restore | D | D | D | D | C: exact approved snapshot/receipt, global clear | D | D | D | C: ordinary session approves exact plan |
| Swap an isolated restore into the local read model | D | D | D | D | C: current safety watermark/receipt, global clear | D | D | D | C: ordinary session approves exact local-only swap |
| Abort an isolated restore | D | D | D | D | C: revoked receipt stops work | D | D | D | C: matching `incident_control` session/current attempt |
| Change actor type, owner, or provenance | D | D | D | D | D | D | D | D | D |

Every `BG` cell is denied in P1.7. A future break-glass capability requires a
new owner-approved ADR with a declared incident/legal purpose, exact objects,
short expiry, non-self approval, immutable access event, post-use review, and
user notice where safe and legally appropriate. The one-person PoC cannot
claim that production separation exists.

## State transitions

### Session, holds, and account lifecycle

```text
session: issued -> active -> logged_out | expired | revoked
reauth_receipt: issued -> used | expired | revoked

moderation_hold: clear -> held -> clear       (moderator's scope only)
security_hold:   clear -> held -> clear       (security scope only)

deletion_active -> deletion_requested -> deletion_active  (owner cancel)
deletion_requested --fresh reauthentication + confirm-->
  deletion_committed -> identity_disabled -> primary_tombstoned
  -> service_erasure_complete -> snapshot_suppression_pending
  -> physical_expiry_complete
```

Every ordinary session, reauthentication receipt, preview capability, worker
receipt, export job, and restore attempt records the global capability epoch at
issue and denies when it differs at authorization or commit. The sole
containment-surviving exception is the exact `incident_control` session issued
atomically for that new epoch. Each global-security transition atomically
replaces outstanding delete-only `safety_cleanup` receipts with otherwise
identical receipts bound to the new epoch; old-epoch cleanup receipts deny, and
their replacements are permitted by the contained-state policy.

The operational account state is active only while both independent hold fields
and global containment are clear and deletion has not committed. Each authority
may clear only the hold type it placed; a moderator cannot clear a security
hold and Security cannot reverse a moderation hold. Privacy uses deletion
states, never a generic hold. Entering either hold revokes ordinary sessions
and ordinary delegated work and denies new Contributions, invocations,
publication, blocks, votes, and ordinary jobs. It never stops an authorized
delete-only `safety_cleanup` receipt. A moderation-hold export is the only
data-producing exception: it must be requested after the hold through the
purpose-limited session and uses a newly issued `moderation_hold_export`
receipt. A security hold or global containment denies that exception.
Existing public Contributions remain visible unless a separate, scoped content
quarantine/removal, withdrawal, or privacy-erasure event changes visibility.
Under a hold, the owner may receive a purpose-limited fresh session only for
the exact actions below. `C` means conditionally allowed; `D` means denied:

| Exact authorization-matrix action | Moderation hold only | Security hold only | Both holds | `held_purpose_reauth` required |
| --- | --- | --- | --- | --- |
| `Submit an appeal` | C | C | C | No |
| `Request an owner export` | C | D | D | Yes |
| `Download an owner export` | C | D | D | Yes |
| `Request account deletion` | C | C | C | No |
| `Cancel uncommitted account deletion` | C | C | C | No |
| `Confirm irreversible account deletion` | C | C | C | Yes |
| `Inspect own lifecycle status` | C | C | C | No |

Every other owner action, including private-result deletion, Contribution
withdrawal, ordinary reads, and content/publication mutations, is denied while
either hold is set. System cleanup follows its separate exact receipt. Global
containment denies all owner sessions; it does not pause already committed
privacy/expiry cleanup. Ordinary public reads through a held account remain
denied.

Every pre-hold reauthentication receipt remains revoked. A purpose-limited
session may issue a new single-use `held_purpose_reauth` only for the three
table actions marked `Yes`. The receipt binds owner, that exact action, both
hold IDs/versions, account lifecycle/session versions, global clear state/
epoch, policy, and five-minute deadline. Any hold-vector change, containment,
deletion, session-version change, use, or expiry revokes it; it cannot authorize
another table action or an ordinary read, Contribution, invocation,
publication, block, vote, or job.

`deletion_requested` has no erasure effect and is the only cancellable deletion
state. Fresh reauthentication plus explicit confirmation is the atomic commit
point. Commitment immediately revokes all sessions, reauthentication receipts,
ordinary worker receipts, preview capabilities, ready exports, and visibility,
then issues exact delete-only `safety_cleanup` receipts. There is no grace or
cancellation afterward. Cleanup remains retryable without restoring access.
`service_erasure_complete` means every declared serving store, derived
view, index, cache, and count denies the account's payloads; it does not claim
that an isolated unexpired snapshot has physically disappeared.
`physical_expiry_complete` is reached only after the last affected snapshot and
safety-ledger record expire. The UI/status contract reports these two milestones
separately. A committed deletion is irreversible, and an identity is never
recycled.

### Public Contribution

Human drafts remain client-local and outside P1.7. An explicit submission
creates an immutable public human Contribution; the publication path below
creates an immutable public agent Contribution. Each has orthogonal state
fields rather than one misleading chain:

```text
moderation: visible -> quarantined -> moderation_removed
            quarantined/moderation_removed -> visible  (appeal reversal)
owner:      retained -> author_withdrawn                 (terminal in P1.7)
privacy:    retained -> privacy_erased                   (terminal)
payload:    present -> tombstone -> purged
```

The effective-state precedence is `privacy_erased`, then `author_withdrawn`,
then moderation, then visible. A moderator may reverse only its moderation
field; reversal cannot undo withdrawal or privacy erasure. Either terminal
owner/privacy state immediately denies the body and derives a reply-safe
tombstone, followed by bounded payload purge. Public bodies are immutable after
submission, and author-withdrawal restoration is denied in P1.7. No transition
changes human to agent authorship, changes owner, or silently moves content.
Reply-tree placeholders may preserve structure but reveal no deleted body or
direct identifier.

### Private agent result and publication

```text
retention:   retained -> expired | owner_deleted
publication: unpublished -> preview_bound -> published
preview_bound --human owner + current single-use capability
  + exact-command idempotency key--> published
published + exact idempotent retry -> original Contribution ID
```

Private results are immutable in P1.7. A different body or target requires a
new bounded fake-agent invocation and result ID; rebinding an unpublished
preview invalidates its prior capability. Publication does not mutate the
private result into public data. The commit atomically consumes the capability,
sets the independent publication field to `published`, stores a minimized
retry receipt, and creates exactly one structurally agent-authored public
Contribution. The retention field can still move from `retained` to `expired`
or `owner_deleted` after publication without affecting that separate public
Contribution. A later token or preview cannot create a second Contribution
from that result version.

The canonical UTF-8 publication digest binds the result ID, version, and exact
body; owner and agent IDs/types; public provenance version; target Topic and
Discussion IDs plus correction revisions; account lifecycle/session/policy
versions; global security state/capability epoch; `reply_mode=root`;
`parent_contribution_id=null`; capability expiry; and idempotency key. Agent
replies are deliberately unsupported in P1.7, so a
non-null parent or any other reply mode denies. Same key plus the identical
canonical command returns the original Contribution ID; the same key with a
different command denies. Neither the agent runtime nor a worker may cross the
publication edge. The minimized receipt retains invocation/result IDs and
versions, fake-adapter and policy versions, agent actor, target revisions,
digest, consent time, and resulting Contribution ID, never the private prompt
or result body. After private-body expiry/deletion, an identical command digest
can still return the recorded ID; no retry reconstructs or reveals the body.

### Public authorship and provenance

Every public Contribution exposes immutable `author_type` as `human` or
`agent`. A local human Contribution also exposes only its generated public
author label. A local agent Contribution additionally exposes an opaque agent
ID, `agent_class=user_owned_fake`, generated owner/operator public labels,
`adapter_id` and version, `provider=none`, `model=synthetic`, provenance-policy
version, and publication-receipt ID/time. Internal owner IDs, session data,
private prompt/result bodies, and unpublished provenance never appear.

The query contract requires an explicit `human`, `agent`, or `all` filter and
returns separate human/agent counts in every mode. `human` is enforced from the
immutable actor record and can never contain an agent Contribution. A missing,
unknown, or client-forged filter/author type fails closed. Account deletion
removes direct owner/operator mappings and bodies while retaining only the
non-identifying `human` versus `agent` type where needed for reply/correction
topology.

### Report, moderation, and appeal

```text
report: open -> triaged -> closed_dismissed
        triaged --atomic content quarantine--> closed_actioned
        open/triaged/closed_actioned -> subject_erased_closed
        open/triaged/closed_actioned -> content_withdrawn_closed
        open/triaged/closed_actioned -> content_privacy_erased_closed
appeal: closed_actioned -> appeal_eligible -> appeal_open -> upheld_final
        appeal_open --atomic content restoration--> reversed_final
        appeal_eligible -> appeal_expired
        appeal_eligible/appeal_open -> subject_erased_closed
        appeal_eligible/appeal_open -> content_withdrawn_closed
        appeal_eligible/appeal_open -> content_privacy_erased_closed
```

Report volume alone does not create a moderation action. Reports contain only
bounded enumerated `reason_code` and optional project-created `evidence_code`;
P1.7 stores no reporter free text. Actioning the report and quarantining its
current Contribution version is one atomic multi-object transition. The
affected human—or the
owning human for an agent Contribution—may file one appeal against a current
action within seven fake-clock days of `closed_actioned`. The assigned scoped
moderator either upholds it or atomically records `reversed_final` and restores
the Contribution moderation field. A failure or stale participant version
changes neither object and is exactly retryable. If privacy erasure, owner
withdrawal, or subject deletion commits first, it atomically reaches the
corresponding `content_privacy_erased_closed`, `content_withdrawn_closed`, or
`subject_erased_closed` terminal, makes the reversal stale, and prevents
restoration; if reversal commits first, a later erasure still wins by sequence.
Reporter identity and internal notes are never shown to the affected
actor. A reporter sees only receipt plus coarse `open`/`closed` status, not
internal evidence or the affected actor's private data. The affected actor
sees the action, public reason code, appeal deadline, and outcome, never the
reporter. An appeal cannot reverse author withdrawal or privacy erasure.

On reporter-account deletion, the direct reporter mapping is removed at
deletion commit. Only the enumerated reason/evidence codes for an already-open
case may remain through final closure plus 30 days; they cannot identify or be
revealed as the reporter. On subject-account deletion, `subject_erased_closed`
is reached atomically from every nonterminal report/appeal state; direct
Contribution privacy erasure and author withdrawal similarly reach their named
terminals. In every case the effective visibility state wins and the content
body/direct subject mapping are purged as applicable.
Already-terminal dismissed/upheld/reversed/expired cases keep their terminal
status but lose those same mappings and payloads.

### Block

```text
active -> revoked
account deletion -> deleted
```

The proposed minimum block hides the blocked actor's Contribution bodies from
the blocker, renders only a neutral reply-shape placeholder for existing
context with no reveal control, and denies new direct reply/mention interactions
targeting the blocker. It does not globally remove content, reveal the block
list, or change Topic resolution. Deletion of either endpoint removes the
relationship and its derived enforcement/cache entries.

### Export, deletion, backup, and restore

```text
export_requested -> generating -> ready -> downloaded -> purged
export_requested/generating/ready -> cancelled | revoked | expired -> purged
generating -> failed -> purged

snapshot_capture -> atomic(state image + transition sequence)
backup_restore -> isolated_restore(snapshot sequence)
  -> replay_safety_events_through_watermark -> rebuild_and_verify
  -> atomic_safety_watermark_fence -> eligible_for_local_read_model
atomic_safety_watermark_fence(stale) -> replay_safety_events_through_watermark
```

An export job is bound to one owner, immutable data snapshot, exact schema,
account lifecycle version, and worker receipt. The worker rechecks all bindings
when committing the archive and again at download. Download is atomic and
single-use: first success moves it to `downloaded` and immediately queues purge;
concurrent attempts lose with no bytes. Deletion commit revokes every pending
or ready export. A copy already downloaded to the user's device cannot be
recalled, which the download UI must state.

The export schema rejects unknown fields and uses explicit `null` for an absent
optional value. Arrays contain only records owned by or directly submitted to
the requester and are deterministically ordered. The complete P1.7 field
allowlist is:

| Record | Exact allowed fields |
| --- | --- |
| Top level | `schema_version`, `export_id`, `account_lifecycle_version`, `snapshot_sequence`, `generated_at`, `expires_at`, `account`, `agents`, `contributions`, `private_agent_results`, `reports_submitted`, `blocks`, `moderation_decisions`, `publication_receipts`, `topic_context`, `source_context` |
| `account` | `account_id`, `public_label`, `locale`, `content_view` |
| `agents[]` | `agent_id`, `public_label`, `agent_class`, `adapter_id`, `adapter_version`, `provider`, `model`, `created_at` |
| `contributions[]` | `contribution_id`, `author_type`, `agent_id`, `topic_id`, `discussion_id`, `parent_export_ref`, `body`, `created_at`, `moderation_state`, `owner_state`, `privacy_state` |
| `private_agent_results[]` | `result_id`, `agent_id`, `invocation_at`, `expires_at`, `prompt`, `body`, `publication_state`, `published_contribution_id` |
| `reports_submitted[]` | `report_id`, `target_export_ref`, `reason_code`, `evidence_code`, `status`, `created_at`, `closed_at` |
| `blocks[]` | `block_id`, `blocked_actor_export_ref`, `blocked_actor_type`, `created_at` |
| `moderation_decisions[]` | `action_id`, `target_contribution_id`, `public_reason_code`, `state`, `created_at`, `appeal_deadline`, `appeal_outcome` |
| `publication_receipts[]` | `receipt_id`, `result_id`, `agent_id`, `topic_id`, `discussion_id`, `command_digest`, `consent_at`, `contribution_id` |
| `topic_context[]` | `topic_id`, `public_label` |
| `source_context[]` | `source_id`, `fixture_label` |

`target_contribution_id` appears only in a decision about the requester's own
Contribution. `parent_export_ref`, `target_export_ref`, and
`blocked_actor_export_ref` are freshly generated, bundle-local, non-linkable
aliases; they cannot equal or be resolved to an internal ID, public actor ID,
Contribution ID, or label. Thus a parent/report/block relationship can be
represented without exporting a third party's direct identifier. No
other preference, profile, context, URL, body, note, evidence, security, audit,
or correction field is allowed. A delegated worker serializes the schema;
human operators may inspect lifecycle status but not the body or bundle.

Value inclusion is also exact. An owned Contribution's `body` is a string only
when moderation, owner, and privacy states are respectively `visible`,
`retained`, and `retained`; otherwise it is `null`, while the state fields and
user-facing decision explain why. A private-result record exists only while its
retention state is `retained`; expired/owner-deleted results are absent. A
`reports_submitted[]` record exists only while its structured-evidence retention
deadline is current. Within an included report record, `reason_code` is the
retained enumerated string and an unused optional `evidence_code` is explicit
`null`; at expiry the entire report record is omitted, rather than retaining a
shell with null codes. Context arrays contain only the opaque fixture IDs/labels
referenced by another included owner record. Account deletion revokes the whole
export rather than producing a post-deletion bundle.

Snapshot capture atomically records the complete eligible state image and the
global committed transition sequence. If that pair cannot be captured in one
pure transition/transaction, snapshot creation fails; a deletion racing capture
is therefore either already reflected in the image or has a later sequence that
must replay. Each snapshot also declares the exact local recovery point:
`RPO = snapshot_sequence`. New non-safety data after that point (for example a
new Contribution or reaction) is deliberately absent and listed in the test's
expected-data-loss manifest. This is synthetic restore behavior, not acceptable
production recovery evidence.

Restore replays every later privacy erasure, account deletion, author
withdrawal, moderation quarantine/removal, block create/revoke, account or
global security hold, ready-export revocation, and policy migration through the
current safety watermark; rebuilds indexes, caches, counts, and account-specific
projections; and runs negative visibility checks. The final local read-model
swap succeeds atomically only if that safety watermark is unchanged. A
concurrent safety event makes the attempt stale and forces replay. P1.7 never
promotes a restore to a reachable service; `eligible_for_local_read_model`
means only that the isolated fixture may be queried by its contract test.

Deletion is idempotent after commitment. Cleanup failure stays retryable without
restoring access. Completion cannot be reported while a declared snapshot could
be locally swapped without current safety-ledger replay. An owner may
separately finish a single export before confirming deletion, but export never
delays commitment;
confirmation revokes it immediately.

### Audit redaction

Append-only integrity does not mean personal data forever. Audit events use
opaque references, enumerated reason codes, bounded structured fields, and no
free text in the minimum slice. Account/profile mappings, evidence blobs, and
internal notes are separate lifecycle objects that can expire or be
pseudonymized without changing non-personal event topology. An accidentally
logged body, prompt/result, token, raw URL, or direct identifier is a security
incident requiring purge; adding a redaction marker alone is insufficient.

A stable opaque actor reference remains pseudonymous, not anonymous. The
privacy-minimizing local default removes the actor mapping after its 90-day
limit and retains only the role class in non-personal correction topology; it
does not retain a domain-scoped actor pseudonym for the test lifetime.

### Topic correction interaction

ADR-005 correction history may retain event ID, operation type, input/output
Topic and Source identifiers, policy version, outcome, timestamps, and role
class. It may not use “append-only” to preserve deleted bodies, private agent
content, raw personal identifiers, IP/user-agent data, or unbounded free-text
evidence. On account deletion, direct actor identifiers and personal evidence
must be removed or pseudonymized under the accepted policy while non-personal
topology remains reconstructable. Moderation/deletion tombstones override all
historical projections and counts.

## Proposed `local-synthetic-v1` lifecycle policy

P1.7, if separately authorized, should keep only generated identities,
reserved-domain fixtures, opaque domain IDs, and deterministic fake output in
process memory or an explicitly disposable temporary store. It should make no
network listener externally reachable, use no real account identifiers, write
no content logs, create no analytics, and create no real infrastructure
backup. “Backup” below means a synthetic application snapshot used only to
exercise restore safety. A visible reset operation clears the local campaign.

A fake clock drives every deadline. Expiry is inclusive: access denies and
cleanup becomes due when `now >= expires_at`. Deadlines never slide on read,
retry, preview, export generation, or restore; the shortest applicable limit
wins. A visible reset atomically denies access and clears every declared
primary, derived, snapshot, export, log, receipt, and safety-ledger object
for that local campaign. These are test-policy constants, not approved
real-data or legally validated retention periods:

| Data class/state | `local-synthetic-v1` limit | Required behavior |
| --- | --- | --- |
| Synthetic ordinary session | 30 minutes from `issued_at` | Logout, expiry, either hold, global containment/epoch change, session-version change, or deletion commitment revokes it; no refresh extends the original session |
| Held-purpose session | 30 minutes from `issued_at`, never beyond the campaign deadline | Issued only after a hold; bound to the full hold vector, account lifecycle/session/global epochs, policy, and the action intersection allowed by the current holds; any bound-state change revokes it and no refresh extends it |
| Incident-control session | Incident closure, visible reset, or non-sliding campaign deadline, whichever comes first | Issued atomically on containment; bound to exact incident/version/epoch; only incident-state read, close, and restore-abort actions |
| Fresh-reauthentication receipt | Five minutes from `issued_at`, single use | Bound to owner, action, lifecycle epoch, global epoch, and session version; logout/hold/containment/deletion revokes it |
| Held-purpose reauthentication receipt | Five minutes from `issued_at`, single use | Issued only from a purpose-limited post-hold session; bound to exact action, full hold vector, lifecycle/session/global epochs, and policy; any bound-state change revokes it |
| Moderation-hold export receipt | 15 minutes from `issued_at`, never beyond the purpose session or campaign deadline | Issued only after the hold from a purpose-limited owner session; exact owner/request/snapshot/schema/moderation-hold version plus clear security/global state; any bound-state change revokes it |
| Delete-only safety-cleanup receipt | Exact stage completion, reset, or bound cleanup deadline, whichever comes first | Lifecycle-engine issued for an enumerated retention class; survives holds/containment only for the exact expire/purge action; no body/disclosure/create/export/publish/moderation/restore authority |
| Private fake-agent prompt/result | 24 hours from original `invocation_at` | Owner-only while retained; no edit extends it; publishing creates a separate public agent Contribution; exclude from logs, shared cache, search, counts, clustering, and every synthetic backup |
| Publication preview/capability | 15 minutes from `bound_at`, never beyond result expiry | One active preview per unpublished result version; rebind revokes prior capability; publish consumes it |
| Publication/idempotency receipt | Through the non-sliding campaign deadline, at most 24 hours | Exact retry only; minimized fields, no private body; owner deletion of the private result does not remove it; account deletion or reset does |
| Disposable manual-demo primary store | 24 hours from `campaign_created_at` | Non-sliding; visible reset clears all declared campaign data; no claim about undeclared workstation backup/indexing |
| Generated export archive | One hour from `ready_at`, or immediately after first successful download/deletion | Owner-bound, exact allowlist; atomic single download; exclude from snapshots |
| Primary deletion/cache/index cleanup | 24 hours from irreversible `deletion_committed_at` | Access and display deny at commit; cleanup is retryable/idempotent; service-erasure completion requires every declared derived copy to deny |
| Synthetic application snapshot | Seven days from atomic `snapshot_created_at` | State image and transition sequence captured atomically; private fake-agent content and exports absent; restore stays isolated through safety replay/fence; RPO is the captured sequence |
| Restore-safety/deletion ledger | Later of `effect_verified_at + 24 hours` or every affected snapshot's `expires_at + 24 hours`; with no affected snapshot, the first anchor applies | Exact fields are `event_id`, `event_type`, `subject_tombstone_id`, `committed_sequence`, `participant_refs`, `state_after_code`, `snapshot_ids`, `policy_version`, `effect_verified_at`, `expires_at`, `stage`, `outcome`; no profile/direct account field or free text. Opaque refs remain restricted pseudonymous data only to this expiry |
| Non-linkable lifecycle outcome | 30 days from `ledger_expired_at` | Exact fields are `event_id`, `event_type`, `committed_sequence`, `policy_version`, `completed_at`, `outcome_code`, `purge_at`; no subject/object/snapshot reference, payload, or free text; purge at deadline |
| Closed report structured evidence | 30 days from final appeal/case `closed_at` | Only enumerated reason/evidence codes; direct reporter mapping is removed earlier on reporter deletion; purge codes/direct mappings at expiry |
| Minimal moderation action | 90 days from final action/reversal/appeal `closed_at` | Structured action, target tombstone, policy/reason code, time, role class, and reversal/appeal link only |
| Ordinary security/auth decision event | 30 days from `event_at` | Allowlisted metadata only; no bodies, prompts/results, tokens, block graph, report evidence, or raw browsing URL |
| Incident-linked security event | 90 days from synthetic incident `closed_at` | Purpose/scoped incident record; fixtures must close; no automatic indefinite extension |
| TopicCorrection evidence/operator mapping | 90 days from correction `event_at` | Separate from topology; structured/redactable; no raw URL/title/body/private output/free text |
| Non-personal TopicCorrection topology | System/test-fixture lifetime | Event/operation type, opaque Topic/Source IDs, versions/partition, policy/resolver version, outcome, time, role class, and reversal link only |
| Active block | Until owner revokes it or either synthetic account is deleted | Blocker/enforcement visibility only; no public or moderator list and no unbounded history |

`participant_refs` is an ordered array of exact
`(relationship_role, object_type, opaque_object_id, object_version)` records;
it is not an open map. `state_after_code`, `stage`, `outcome`, and every event
type are enumerated. At ledger expiry the transition to the non-linkable outcome
atomically drops `subject_tombstone_id`, `participant_refs`, `state_after_code`,
and `snapshot_ids`. Visible reset or a shorter campaign limit wins over both
deadlines.

Fixtures must include at least two authorization partitions plus global-public
objects so cross-partition private, parent/child, reply, report, block, list,
count, search, cache, export, and worker paths can be denied explicitly. Public Contribution
bodies use the privacy-first local default: immediate visibility denial and a
reply-safe tombstone after account/privacy erasure. Privacy erasure is
irreversible; moderation reversal cannot restore it.

The owner must explicitly accept or revise every logical duration and the
public-Contribution tombstone rule. Any private-alpha/production retention,
real backup, legal hold, statutory retention, age/identity verification, or
jurisdiction-specific rule requires a new qualified Policy/legal review.

### Account-deletion inventory

The generated deletion oracle covers every declared subject-linked class; an
unlisted class is a test failure, not permission to retain it.

| Asset | Immediate effect at commit | Primary/derived treatment and retained minimum | Deadline | Snapshot/restore rule | P1.7 oracle owner |
| --- | --- | --- | --- | --- | --- |
| Sessions, reauth receipts, worker receipts, previews | Revoke/deny | Purge secret/capability material; retain only non-linkable outcome | Immediate, verified within cleanup window | Never present in snapshot; stale receipt denies | Platform implementation; Trust negative cases; Quality matrix |
| Pending/ready export | Revoke/deny download | Purge archive/job payload; retain non-linkable outcome | Immediate queue, at most 24 hours from deletion commit | Excluded; revocation event replays | Platform; Privacy/Policy field oracle; Quality race test |
| Profile, preferences, direct account mapping | Hide/deny | Purge values and direct mapping; tombstone non-recycled opaque ID only where integrity requires | At most 24 hours from commit | Safety-ledger replay before local swap | Platform; Privacy/Policy oracle; Quality fake clock |
| Public human Contribution | Hide body | Reply-safe tombstone; retain non-identifying human type and topology only | Serving/derived body and direct ID at most 24 hours; an isolated pre-deletion snapshot may retain suppressed synthetic bytes only to its seven-day expiry | Erasure event overrides snapshot and fence; snapshot never serves | Platform; Privacy/Policy fields; Quality restore/count tests |
| Public owned-agent Contribution and agent record | Hide body | Tombstone; remove owner/operator mapping; retain non-identifying agent type plus synthetic adapter/provenance minimum needed for topology | Serving/derived body/direct mapping at most 24 hours; isolated suppressed snapshot bytes only to snapshot expiry | Erasure event overrides snapshot and fence; snapshot never serves | Platform; Trust provenance oracle; Quality filter/count/restore tests |
| Private fake-agent input/result | Revoke/deny | Purge body, index/cache, invocation capability, and owner mapping | Immediate queue, at most 24 hours from commit or original TTL, whichever is earlier | Never included | Platform; Privacy/Policy exact-field oracle; Quality negative query |
| Votes/reactions | Remove effect | Purge subject-owned record and recompute aggregate without revealing identity | At most 24 hours | Suppression event plus aggregate rebuild | Platform; Quality aggregate/restore test |
| Report submitted by subject | Remove reporter mapping | If already open, retain only enumerated non-identifying `reason_code`/`evidence_code` needed to close; otherwise purge them; never reveal reporter | Mapping at most 24 hours; retained codes 30 days from final closure | Safety replay; no direct mapping | Platform; Privacy/Policy case oracle; Quality field diff |
| Report/action against subject | Hide erased target body | Close `subject_erased_closed`; retain structured action/reason/topology only, no direct subject mapping or reporter disclosure | Body/mapping at most 24 hours; minimal action 90 days from closure | Safety replay prevents body restoration | Platform/Moderation; Privacy/Policy oracle; Quality appeal/restore test |
| Block with subject at either endpoint | Stop enforcement/listing | Purge relationship and derived cache entries | At most 24 hours | Suppression event plus projection rebuild | Platform; Trust bypass cases; Quality both-endpoint test |
| Publication receipt | Revoke unpublished intent | Purge private digest/session/owner mapping; public tombstone may retain non-identifying receipt ID/time and agent type | Private mapping at most 24 hours; campaign deadline for minimum | Suppression replay | Platform; Trust provenance oracle; Quality replay test |
| Moderator evidence/note | Restrict immediately | Purge subject-linked free text/direct mapping; retain bounded structured action fields | At most 24 hours for direct mapping; action limit above | Suppression replay; no erased body | Moderation/Platform; Privacy/Policy oracle; Quality field diff |
| Security/auth event mapping | Restrict immediately | Remove direct account mapping; retain only non-linkable decision/outcome to event deadline | At most 24 hours for direct mapping | Replay suppression; never restore mapping | Security/Platform; Privacy review; Quality log scan |
| TopicCorrection evidence/operator mapping | Deny direct lookup after cleanup | Replace direct actor link with event-scoped pseudonym until its 90-day limit, then role class only; retain non-personal topology | Direct mapping at most 24 hours; pseudonym at most 90 days from event | Redaction/suppression replay before topology rebuild | Correction/Platform; Privacy/Policy oracle; Quality history test |
| Restore-safety/deletion ledger and deletion receipt | Restrict to Privacy/Security workflow | Remove direct account/profile mapping; retain exact ledger fields/stage receipt needed for snapshot suppression and service/physical completion, then atomically reduce to the exact non-linkable outcome schema | Direct mapping at most 24 hours; opaque refs to later of verified-effect+24 hours or affected-snapshot expiry+24 hours; non-linkable outcome 30 further days | Mandatory replay source; local swap cannot bypass it | Platform; Privacy/Security field oracle; Quality no-snapshot/snapshot/post-expiry tests |

The public/non-personal remainder never contains a body, direct account ID,
private agent material, report evidence, block edge, or free-text evidence.
Platform owns transition/unit implementation; Trust owns abuse and negative
oracles; Privacy/Policy owns exact field, deletion, export, and retention
oracles; Quality owns generated coverage, fake-clock, concurrency, and recovery
evidence; Operations owns the isolated-restore procedure. One builder may run
these fixtures under role aliases but cannot claim reviewer independence.

## Threats, controls, and required evidence

| Threat | Required control | P1.7/P1.8 evidence owner |
| --- | --- | --- |
| IDOR/cross-owner private read | Server-derived principal, ownership/scope check on every get/list/cache/export path, generic not-found denial | Platform implements; Trust supplies cases; Quality reproduces |
| Cross-object authority laundering | Exact participant schema, all-object version/partition/lifecycle checks, atomic same-partition relationships, global-public read never lends write | Platform; Trust relationship cases; Quality generated coverage |
| Human/agent impersonation or filter leakage | Immutable server actor type and provenance; separate constructors; client fields rejected; explicit human/agent/all filters and counts | Platform; Trust review; Privacy field review; Quality negative/filter tests |
| Confused-deputy or duplicate publication | Owner-only canonical digest/capability, all participant revisions, one result/one Contribution, exact idempotent outcome | Platform; Trust adversarial tests; Quality concurrency/replay |
| Stale/replayed mutation | All participant/session/lifecycle/policy versions, monotonic sequence, capability consumption, exact-command idempotency | Platform and Quality |
| Overpowered background worker | Single action/object-set/partition/version/policy/expiry receipt, no discovery, lifecycle revocation; exact `moderation_hold_export` and retention-only `safety_cleanup` classes cannot broaden their named authority | Platform; Trust abuse cases; Quality receipt matrix |
| Moderator/correction privilege escalation | Separate scopes, exact action matrix, no wildcard administrator, reason/version bounds | Trust matrix; Platform enforcement; Quality all-role negatives |
| Report brigading and retaliation | Authenticated human reporters, rate class, duplicate/coordinated signals, no automatic guilt, reporter confidentiality | Trust/Moderation design; Quality abuse cases |
| Block bypass | Check target interaction and presentation paths; prevent alternate actor/agent delegation from bypassing owner block | Platform; Trust abuse cases; Quality integration |
| Removed/deleted content resurrection | Tombstone/deletion ledger overrides lineage, cache, counts, export, search, and restore | Platform; Quality fake-clock/restore tests; Trust review |
| Export data leak | Reauthentication, owner-bound job/download, exact schema, short expiry, one-user fixtures, no moderator notes/other private data | Platform; Privacy review; Quality fixture diff |
| Audit/log privacy leak | Structured allowlist, bounded reason codes, redaction, access scopes, no raw content/secrets/URLs | Trust/Privacy; Quality static/runtime log tests |
| Insider/break-glass misuse | Deny break-glass entirely in P1.7; a future design needs a new ADR, narrow scope, exact-object/time approval, immutable access event, post-review, and kill switch | Security/Privacy owner; Quality incident drill before real data |
| Malicious content/link/XSS | Treat all text as data, safe rendering, allowlisted link schemes, no instruction authority | Platform; Trust payloads; Quality rendering tests |
| Race/double publication or deletion | Atomic state transition, expected versions, single-use publication capability, replayable exact-command idempotency outcome, conflict/no-mutation result | Platform; Quality concurrency tests |
| Conflicting account holds | Independent versioned moderation/security fields; each scope clears only its own; content visibility changes separately | Platform; Trust/Security; Quality composition tests |
| Backup capture/restore loses or resurrects state | Atomic image/sequence capture, declared snapshot-sequence RPO, full safety replay, rebuild, current watermark fence, stale retry, local-only eligibility | Quality/Operations with Privacy and Platform review |
| Incident control silently changes content/authority | Exact global containment states/capability epoch; deny sessions/publication/workers/swap without content visibility or moderation authority | Security/Platform; Quality transition tests; Privacy field review |
| Account deletion leaves sessions/jobs alive | Immediate session/delegation revocation, queue cancellation/version check, staged deletion receipt | Platform; Privacy test plan; Quality fake-clock tests |
| Enumeration and excessive access | Generic denials, bounded pagination, rate classes, no cross-scope counts/list endpoints | Platform; Trust abuse review; Quality boundary/load tests |

## Incident and operator rules

```text
global_security: clear --open incident--> contained
global_security: contained --close incident--> clear
restore_attempt: planned -> isolated -> rebuilding
restore_attempt: isolated/rebuilding -> restore_aborted
```

- Every global-security transition increments the global capability epoch and
  atomically performs the cleanup-receipt replacement defined above. Opening a
  synthetic incident also creates the incident record. `contained` denies
  ordinary session issuance, publication, export generation, ordinary/data-
  producing worker execution, and local restore swap; it revokes ordinary
  sessions, previews, and ordinary worker receipts. Exact delete-only
  `safety_cleanup` continues so privacy/retention deadlines cannot be suspended.
  The atomic open also issues the narrow `incident_control` session.
  Containment does not hide/remove existing content or grant content ownership
  or moderation authority.
- Closing requires that incident-control session plus current incident,
  containment, and epoch versions. Its atomic epoch change consumes the control
  session and replaces only still-current cleanup receipts; it does not revive
  any revoked ordinary capability or session. Aborting an isolated restore uses
  the same control session and makes that attempt terminal; a new attempt needs
  a new ordinary recovery approval after containment clears.
- The incident record allows exactly `incident_id`, `state`, `reason_code`,
  `opened_at`, `contained_at`, `closed_at`, `security_role_class`,
  `capability_epoch`, `policy_version`, and `expires_at`. Codes are enumerated;
  there is no free text, content, affected-user list, or private evidence. Only
  Security/operations can read it. “Keep everything” is not an incident policy.
- A compromised moderator cannot change actor type, publish private output,
  export an account, restore backups, or erase its own action history.
- A compromised worker receipt expires and is bound to one action/object set,
  global epoch, participant versions, and worker class; replay or target/class
  substitution denies. A safety-cleanup receipt cannot read a body or mutate a
  non-deletion field.
- Notification, regulator, law-enforcement, takedown, and legal-hold procedures
  require qualified Policy/legal review before real data. This document makes
  no jurisdiction-specific timing promise.
- Legal hold and real takedown/disclosure handling are disabled in P1.7. A
  synthetic state fixture may test denial, but cannot contact anyone, create a
  real hold, or extend retention.

## Required P1.7 contract tests

P1.7 must generate a coverage manifest that references every matrix cell,
state-transition edge, expiry boundary, and deletion-inventory row exactly once
or more. An absent reference fails the gate. Planned evidence ownership is:

| Test ID | Required coverage | Implementation/test owner | Review oracle | Expected gate artifact |
| --- | --- | --- | --- | --- |
| `P17-AUTH-MATRIX` | Every explicit cell and every unspecified principal/action/object/state combination; generic zero-mutation denial | Platform implements/unit-tests; Quality generates matrix | Trust validates negative/abuse cases | Machine-readable matrix coverage plus denial report |
| `P17-RELATIONSHIP` | Parent/child, reply, report, block, publication, correction, export, and worker participant sets; all versions/lifecycle epochs; global-public read cannot lend write; cross-partition failures; agent reply/parent retargeting denies | Platform and Quality | Trust | Relationship/partition report with stale conflicts |
| `P17-WORKER-SESSION-HOLD` | Exact ordinary-worker, `moderation_hold_export`, and delete-only `safety_cleanup` issuance/scope; discovery/body/disclosure denial; expiry/revocation, completion/reset consumption, and atomic same-target cleanup epoch replacement; every declared safety-cleanup target maps to one matrix action; ordinary and held-purpose session/reauth issue/logout/use/expiry, full-hold-vector binding, and freshness; every cell and unlisted-action denial in the exact held-purpose action table, including the three actions requiring reauth; global containment denies all owner/export sessions while exact safety cleanup continues | Platform and Quality fake clock | Trust/Security plus Privacy/Policy cleanup oracle | Receipt/session/hold/containment transition report |
| `P17-PRIVATE-PUBLISH` | Owner-authorized bounded fake-agent invocation; owner/non-owner read/list/cache/delete/expiry; immutable edit denial; preview rebind/expiry; one-result-one-Contribution; same-key same-command outcome; differing-command denial; retained private body expiry/deletion after publication while receipt retry works; deletion/publication and incident-open/global-epoch races against invocation, preview binding, and publication commit | Platform and Quality concurrency harness | Trust/Security | Invocation/publication/retention state, digest, idempotency, and race report |
| `P17-PROVENANCE-VIEWS` | Required human/agent public fields, immutable provenance, `human`/`agent`/`all` filtering, separate counts, separate rate-class limits, no private field disclosure | Platform and Quality | Trust plus Privacy/Policy field oracle | Schema/filter/count/rate report |
| `P17-MODERATION-APPEAL` | Report triage/closure, atomic action+quarantine, removal, atomic appeal reversal+restore with zero-mutation failure, one appeal within seven days, every `subject_erased_closed`, `content_withdrawn_closed`, and `content_privacy_erased_closed` edge; subject-deletion, withdrawal, privacy-erasure, and reversal races; actor/status visibility | Platform; Quality transition/concurrency generator | Trust/Moderation and Privacy/Policy | Complete state-edge, atomicity, race, and field-visibility report |
| `P17-BLOCK` | Create/revoke, private list, existing placeholder, new reply/mention denial, alternate actor/agent bypass, both-endpoint deletion; mute unsupported | Platform and Quality | Trust | Interaction/projection report |
| `P17-EXPORT` | Every named field and unknown-field rejection; owner receipt worker; freshly generated bundle-local aliases, including `parent_export_ref`; Contribution-body string versus explicit `null` for every moderation/owner/privacy state; omission of expired/deleted private-result records and whole expired report records; retained report reason string plus explicit `null` for an unused optional evidence code; immutable snapshot/lifecycle/hold/containment rechecks; moderation-hold allow versus security-hold/containment deny; atomic single download, expiry/revocation/purge, concurrent deletion | Platform; Quality fixture diff/concurrency | Privacy/Policy | Field/value-level bundle manifest and lifecycle report |
| `P17-DELETION` | Every deletion-inventory row including cleanup receipt and safety ledger; cancellable request versus irreversible commit; immediate revocation; service versus physical completion; snapshot and no-snapshot ledger anchors; transition to the exact non-linkable outcome schema and its 30-day purge; pseudonymous-ref expiry; derived count/cache/index cleanup | Platform; Quality generated inventory/fake clock | Privacy/Policy and Trust | Asset-by-asset deletion coverage and negative-query report |
| `P17-RETENTION` | Every anchor at one unit before, exactly at, and after expiry; every physical purge due during a hold/containment maps to an exact no-body `safety_cleanup` matrix action, while visible reset consumes all receipts/state without replacement; no-snapshot and affected-snapshot safety-ledger anchors; atomic reduction to the exact post-expiry non-linkable schema and purge 30 days later; non-sliding deadlines; shortest-limit/reset precedence; incident closure requirement | Platform and Quality fake clock | Privacy/Policy | Boundary report for every lifecycle-table row and post-expiry schema |
| `P17-RESTORE` | Atomic state-image/sequence capture including capture races; declared snapshot-sequence RPO and expected data-loss manifest; every safety event; rebuilds; concurrent safety events during local swap; stale-fence retry; never reachable service | Platform; Operations isolated procedure; Quality concurrency harness | Privacy/Policy and Trust | Restore transcript, capture/fence trace, RPO manifest, and visibility/count report |
| `P17-INCIDENT` | Atomic open/contain plus `incident_control` issuance and its incident-read/close/restore-abort-only scope; lost/expired control leaves contained until visible reset; global-capability-epoch binding/revalidation and open races against active/issuing sessions, invocation/preview/publication, ordinary-worker/export commit, and restore swap; denied ordinary session/export/publication/worker/swap; atomic old-to-new-epoch `safety_cleanup` replacement and continued cleanup; no content visibility change; exact incident fields/retention | Platform and Quality concurrency harness | Trust/Security plus Privacy/Policy field oracle | Incident/containment transition, race, cleanup, and field report |
| `P17-RENDER-LOG-CAPABILITY` | Safe rendering/link schemes; hostile inputs; log/error exact allowlist; no secrets/content/private URLs; network/DNS/process/provider denial; clean-checkout reproduction | Platform and Quality | Trust/Security | Rendering/log scan, restricted-run, and reproduction report |

The named roles are accountable lenses and artifacts, not claims that different
people exist. Separate human independence is still required before the later
real-data/public-alpha gate.

## P1.6 gate decisions

Before P1.6 is accepted, separate Trust/Security, Privacy/Policy, and Quality
dispositions must be recorded, and the Lead/owner must explicitly ACCEPT,
REVISE, or REJECT every default below. Any revision/rejection or unmapped test
keeps P1.7 blocked:

- anonymous-read denial and held-account read behavior in the local contract;
- the immutable human/agent model, public provenance fields,
  `human`/`agent`/`all` filtering, and separate counts/rate classes;
- one-result-one-Contribution root-only publication, deferred agent replies,
  owner-authorized bounded fake-agent invocation, 15-minute preview, separate
  single-use capability/exact idempotency behavior, private-body expiry after
  publication, owner-only transition, and incident-open/global-epoch races;
- the complete `local-synthetic-v1` profile, including the 24-hour private
  fake-result limit and exclusion from snapshots/logs/shared derived views;
- ordinary and held-purpose session/reauth TTLs and bindings, no server-side
  human drafts, absence of public/private in-place edit, and at least two
  synthetic authorization partitions;
- neutral block placeholders, denial of new replies/mentions, relationship
  privacy, and both-endpoint deletion;
- enumerated report fields, moderation states, atomic quarantine/reversal,
  every `subject_erased_closed`, `content_withdrawn_closed`, and
  `content_privacy_erased_closed` edge, one seven-day appeal, visibility, and
  reporter/subject/content-deletion treatment;
- independent moderation/security holds, hold-clear ownership, session
  revocation, every exact held-purpose allowlist/denial/reauth cell, the exact
  15-minute moderation-hold export receipt, global containment composition,
  continued delete-only cleanup for every declared retention class, and
  continued visibility of public content absent a content event;
- ordinary operator scopes, global-epoch binding, narrow `incident_control` and
  delete-only `safety_cleanup` exceptions, atomic cleanup-receipt epoch
  replacement, loss/expiry behavior, local break-glass denial, and the separate
  future gate for any broader capability;
- cancellable deletion request, irreversible reauthenticated commit with no
  grace, service-versus-physical completion, and every deletion-inventory row;
- every proposed anchor/duration, inclusive expiry, non-sliding deadlines,
  shortest-limit precedence, visible-reset scope, no-snapshot safety-ledger
  anchor, exact post-expiry non-linkable schema, and its 30-day purge;
- the exact per-record owner-export schema, bundle-local third-party aliases,
  lifecycle-conditioned body/null values, whole-record omission after private-
  result/report expiry, retained-report optional-null behavior, worker-only
  serialization, hold/containment behavior, single-download behavior, and
  export-before-delete choice;
- atomic snapshot image/sequence capture, snapshot-sequence RPO and expected
  loss, complete safety ledger, and atomic local-swap watermark fence;
- the non-personal TopicCorrection fields retained after actor deletion;
- the local default of an event-scoped actor pseudonym for at most 90 days and
  only a role class afterward;
- exact incident/containment actions and fields, capability-epoch effects,
  incident-control issuance/recovery/loss, safety-cleanup continuity and epoch
  replacement, restore-abort behavior, and future legal-hold boundaries; and
- the residual fact that one-person development cannot evidence independent
  moderation, security, privacy, or operations staffing.

## Stop/go boundary

**GO only after both prerequisites:** (1) the P1.6 review/owner gate accepts an
amended ADR-012 and this model, and (2) the owner separately authorizes the
specific disposable-local P1.7 architecture. Only then may an API contract use
synthetic principals, deterministic fixtures, a fake clock, local
memory/disposable state, and network denial.

**STOP:** real accounts or personal data; an external identity provider;
browser or service egress; a reachable server; private AI output beyond the
accepted 24-hour synthetic test TTL; provider/model
calls; real or publicly reachable posting; autonomous agents; production
moderation; telemetry; infrastructure purchase; deployment; recruitment; store
submission; or publication. Each needs its own recorded owner and applicable
Security/Trust, Privacy, Policy, provider, spending, deployment, or publication
approval.
