# ADR-012: Local identity, publication, moderation, and lifecycle contract

Status: Proposed; AI Trust/Security, Privacy/Policy, and Quality review ACCEPT;
explicit P1.6 owner gate open; implementation not authorized

Date: 2026-09-23

Owners: Lead/Product, Platform and Client, Trust/Security/Privacy/Policy, and
Quality

## Context

P1.7 needs a local API skeleton that can distinguish public human activity,
public agent activity, and private agent output without implementing a real
identity provider or handling real users. ADR-005 also needs deletion and audit
rules before Topic corrections can be accepted. A permissive role flag or a
single administrator would make cross-user access, agent impersonation,
accidental publication, and deletion resurrection easy to hide in a demo.

`docs/PHASE_1_AUTH_AND_DATA_LIFECYCLE_THREAT_MODEL.md` supplies the full threat,
authorization, transition, lifecycle, and test detail. This ADR is the
decision-ready summary. It is not accepted merely because it is written.
Here, `public` means visible only inside a network-denied synthetic contract;
it does not mean an Internet-reachable post.

## Proposed decision

For the disposable local P1.7 experiment:

1. Use deterministic synthetic principals behind a trusted local auth adapter.
   Derive principal ID, immutable type, roles, session/lifecycle versions, and
   owner scope on the trusted side; reject client attempts to set them.
2. Use exact deny-by-default authorization over the principal, action, every
   participating object/relationship/state/version/partition, global security
   state/capability epoch, and policy. Revalidate them atomically at commit.
   Unknown, stale, expired, replayed, extra/missing, or cross-scope values deny
   before mutation; readable global-public context never lends write authority.
3. Keep human, agent, moderator, correction, privacy, and security/operations
   authorities structurally separate. Local role fixtures prove policy paths,
   not independent staffing.
4. Permit an owner to authorize one bounded fake-agent invocation. The scoped
   agent may consume only that approved input and create one immutable
   owner-bound private result. Only the owning human may bind a 15-minute
   preview and use a single-use capability plus a separately replayable
   canonical exact-command idempotency key to create one root-level public
   agent Contribution per result version. Agent replies are deferred.
   Expiry/deletion of the private body remains possible after publication.
5. Never relabel agent output as human. Public agent Contributions disclose the
   synthetic agent class, owner/operator labels, adapter/version,
   `provider=none`, `model=synthetic`, and publication receipt/time without the
   private prompt/result. Public queries require `human`, `agent`, or `all` and
   keep counts/rate classes separate.
6. Represent moderation, independent moderation/security account holds, and
   privacy as distinct versioned fields/events. Reports do not prove abuse.
   P1.7 report evidence is enumerated, not free text. Report action plus
   quarantine and appeal reversal plus restoration are atomic; one seven-day
   appeal and every subject-erasure, content-withdrawal, and content-privacy-
   erasure edge are explicit. Blocks hide existing bodies behind neutral
   placeholders and deny new direct replies/mentions only for the blocker;
   mute is deferred.
7. Make a deletion request cancellable only before a fresh-reauthenticated,
   irreversible commit. Commit revokes access immediately; service-erasure and
   final snapshot expiry are separately reported. The asset-by-asset deletion
   inventory governs profiles, public/private content, owned agents, reports,
   blocks, reactions, receipts, operator records, and correction mappings.
8. Make deletion/moderation tombstones override TopicCorrection history,
   projections, counts, caches, exports, and backup restores. Preserve only
   the non-personal topology fields required to reconstruct a correction after
   actor deletion; redact or pseudonymize personal/free-text audit payloads
   under the accepted policy.
9. Execute export only through an exact owner-granted worker receipt and field
   and value allowlist. Third-party relationships use fresh bundle-local,
   non-linkable aliases, and lifecycle state determines whether each body is a
   string, explicit `null`, or absent. Entire expired private-result/report
   records are omitted; explicit `null` is used only for an allowed optional
   field inside an included record. Human operators cannot inspect the bundle;
   download is owner-only, atomic, single-use, and revoked by deletion. A
   moderation hold may issue a new purpose-limited export receipt only after
   revoking all pre-hold work; security hold or containment always denies it.
10. Bind ordinary workers to one action/object set/partition/version/global
    epoch/policy/expiry with no ambient role or discovery. Holds, containment,
    deletion, session changes, and expiry revoke their receipts. A separate
    lifecycle-engine-issued `safety_cleanup` receipt may survive holds or
    containment only for an already-authorized exact delete/expire step over a
    lifecycle class enumerated in the threat model, with no body, disclosure,
    creation, export, publication, moderation-outcome, or restore authority. A
    global-security transition atomically consumes and replaces every still-
    current outstanding cleanup receipt with the same target/action/deadline
    and current object/stage versions in the new epoch.
11. Capture snapshot state plus transition sequence atomically. Restore only in
    isolation at the declared snapshot-sequence RPO, list expected loss of
    later non-safety data, replay every later safety event, rebuild derived
    views, and atomically verify the safety watermark before a local test swap.
    This is not production recovery evidence.
12. Use exact synthetic incident/containment states. Every global-security
    transition increments the global capability epoch. Containment denies
    ordinary sessions, publication, export, ordinary/data-producing workers,
    and restore swaps without hiding content or granting moderation authority.
    Its atomic open issues one narrow, expiring `incident_control` session for
    the exact incident-state read, close, or isolated-restore abort; it grants
    no user/content/list/export/moderation access and cannot revive revoked
    work. Exact cleanup receipts are atomically replaced into the new epoch.
13. Keep the first implementation synthetic and disposable: local process or
   disposable test state, fake clock, no real backups, no external listener,
   no real identifier, no content logging, no telemetry, and no provider.

## Proposed owner dispositions

The following defaults are recommended but remain unapproved until the P1.6
gate:

| Decision | Recommended `local-synthetic-v1` default |
| --- | --- |
| Public reading and held accounts | Deny anonymous reads. Authenticated synthetic humans may read public-visible objects only while operational. Either hold revokes ordinary sessions. The threat model's exact held-purpose table is authoritative: moderation-only permits submit appeal, request/download export, request/cancel/confirm account deletion, and inspect lifecycle status; security-only or combined holds permit the same except both export actions. Request/download export and confirm deletion require `held_purpose_reauth`. Every unlisted owner action denies. Global containment denies owner sessions; exact delete-only cleanup continues; existing public content stays visible unless a separate content action applies |
| Human/agent identity and views | Immutable disjoint types; no client-selected actor/owner/provenance. Agent public records expose only the frozen synthetic provenance fields. Require `human`, `agent`, or `all`; keep counts and rate classes separate |
| Session and reauthentication | Ordinary session expires 30 minutes from issue; ordinary fresh reauthentication expires after five minutes and is single-use; logout, either hold, global containment/epoch change, session-version change, or deletion revokes both. A post-hold purpose session also has a non-sliding 30-minute limit and binds the complete hold/lifecycle/session/global versions plus allowed-action intersection. It may issue a five-minute single-use `held_purpose_reauth` bound to one exact allowed action; any bound-state change revokes both |
| Private agent result | Immutable, synthetic-only, owner-bound, and 24 hours from original invocation; no backup, log, shared cache, search, count, clustering, moderator access, or edit extension. Retention remains independent after publication; private-result expiry/owner deletion preserves only the minimized retry receipt and separate public Contribution, while account deletion or reset clears the receipt |
| Fake-agent invocation | The owning human explicitly authorizes one exact fake agent, input, target scope, and rate class while the account/global state is clear; no ambient or autonomous invocation |
| Agent publication | Root-level only (`reply_mode=root`, null parent); one active 15-minute preview; global-state/epoch-bound single-use capability plus exact-command idempotency key; one public Contribution per result version; identical retry returns original ID while same-key/different-command or parent retargeting denies; incident-open races revalidate at commit |
| Public/private editing | No server-side human draft or in-place private/public edit in P1.7; a later feature needs reviewed provenance/revision semantics |
| Public agent provenance | Opaque agent ID, class `user_owned_fake`, generated owner/operator labels, adapter/version, `provider=none`, `model=synthetic`, policy version, and publication receipt/time; never private prompt/result or internal owner/session ID |
| Block | Hide existing blocked-actor bodies behind a neutral no-reveal placeholder; deny new direct reply/mention interactions; keep relationship private; delete it when either endpoint is deleted. Defer a distinct mute action |
| Moderation and appeal | Exact `open`, `triaged`, `closed_dismissed`, `closed_actioned`, `appeal_eligible/open/expired`, `upheld_final`, `reversed_final`, `subject_erased_closed`, `content_withdrawn_closed`, and `content_privacy_erased_closed` states; enumerated report codes only; action+quarantine and reversal+restore are atomic; one seven-day appeal; no report-count auto-removal |
| Reporter/subject/content deletion | Remove direct reporter mapping at deletion commit; retain only enumerated non-identifying reason/evidence codes for an already-open case through closure+30 days. Every nonterminal subject-deletion, owner-withdrawal, or content-privacy-erasure case reaches its named terminal; body/direct mapping cannot be restored |
| Account holds | Independent versioned moderation/security fields; each scope clears only its own hold; Privacy uses deletion, not holds; content visibility changes only through a separate scoped content event |
| Ordinary operator and worker model | Separate moderator, correction, privacy, and security/restore scopes. Ordinary workers have one global-epoch-bound exact receipt and no discovery/ambient authority. Holds, containment, deletion, session change, or expiry revoke ordinary delegated work. Break-glass private-content access is disabled and needs a new owner-approved ADR |
| Moderation-hold export capability | Entering the hold revokes every pre-hold session/job. A later purpose-limited owner session may request one 15-minute `moderation_hold_export` receipt bound to owner/request/snapshot/schema/hold version plus clear security/global state. Hold change, security hold, containment, deletion, session change, or expiry revokes it; it has no discovery/unrelated-object authority |
| Safety-cleanup capability | Lifecycle-engine-issued, exact delete/expire target/action/stage/deadline only for the threat-model physical-purge classes: sessions/previews/receipts, private results, campaign primary/derived state, exports, blocks, committed deletion, withdrawn/privacy-erased payloads, snapshots/ledgers/outcomes, report/moderation records, security/auth/incident records, and correction evidence/mappings. It has no body/disclosure/create/export/publish/moderation/restore authority. Holds and containment do not pause it. Every global-security transition atomically consumes and replaces still-current receipts into the new epoch; completion/reset consumes them without replacement |
| Incident-control capability | Opening containment atomically issues one incident/version/epoch/policy/campaign-deadline-bound session. It permits only exact incident-state read, close, or isolated-restore abort and has no user/content/list/export/moderation authority. Closure/reset expires it; loss/expiry leaves the fixture contained until visible reset |
| Account deletion commit | Request is cancellable with no erasure effect; fresh reauthentication explicitly commits irreversible deletion with no grace, immediately revoking access, jobs, previews, and exports |
| Account deletion payloads | Follow the threat model's complete asset inventory; tombstone public human/agent bodies and purge direct identifiers, private material, reaction effects, blocks, and subject mappings while retaining only reply-safe/non-personal topology |
| Deletion completion | Report service-erasure only after all declared serving/derived copies deny; report physical completion only after the last affected snapshot/suppression record expires |
| Expiry/reset semantics | Fake clock only; expire at `now >= expires_at`; deadlines do not slide; shortest limit wins. Visible reset clears every declared campaign primary/derived/snapshot/export/log/receipt/ledger object |
| Disposable campaign | Non-sliding 24 hours from campaign creation for manual-demo primary state; no claim about undeclared workstation backup/indexing |
| Primary synthetic cleanup | Immediate deny/hide at deletion commit and at most 24 hours for declared primary/cache/index cleanup |
| Synthetic snapshot/restore | Atomic state-image/sequence capture; seven days from creation; RPO equals captured sequence and later non-safety data loss is listed; restore replays all later safety events, rebuilds projections, and passes an atomic current-safety-watermark fence before local-test swap; never a reachable service |
| Restore-safety/deletion ledger | Exact threat-model fields cover deletion, withdrawal, moderation, blocks, holds/containment, export revocation, and migration through the later of verified-effect+24 hours or every affected snapshot expiry+24 hours; with no affected snapshot, verified-effect+24 hours applies. At expiry, atomically retain only the exact non-linkable outcome schema for 30 further days, then purge |
| Closed report structured evidence | Enumerated reason/evidence codes only; 30 days from final appeal/case closure; direct mappings may be removed earlier; purge at expiry |
| Minimal moderation action | 90 days from final action/reversal/appeal closure; structured fields only |
| Security/auth decision log | 30 days from ordinary event or 90 days from synthetic incident closure; exact incident fields only; no content, token, private result, block graph, report evidence, or raw browsing URL |
| Export bundle | Exact per-record field and value schema in the threat model; fresh bundle-local non-linkable aliases including `parent_export_ref` for parent/report/block third parties; Contribution bodies are strings or explicit `null` only as moderation/owner/privacy states permit; expired/deleted private-result records and whole expired report records are omitted, while an included report has a reason string and explicit `null` for an unused optional evidence code; automated worker only; moderation-hold export allowed, security-hold/containment denied; one hour from ready; immutable owner snapshot/lifecycle binding; atomic single download; purge on download/expiry/deletion; exclude snapshots; downloaded user copy cannot be recalled |
| TopicCorrection history after actor deletion | System/test-fixture-life non-personal topology; direct mapping removed within cleanup; event-scoped pseudonym at most 90 days from event, then role class only; no personal/free-text material |
| Legal hold/takedown | Disabled locally; future real handling requires qualified review and a separate accepted policy/ADR |

## Consequences

- P1.7 can test meaningful authorization and lifecycle failures without an
  identity vendor, network, database commitment, real user, or legal claim.
- Private/public and human/agent separation are domain invariants rather than
  UI labels.
- Moderator convenience is deliberately limited; ordinary moderation cannot
  inspect private agent output or perform privacy exports/restores.
- Deletion and restore are multi-stage, testable processes rather than a flag.
- The proposed durations and account-deletion behavior are consequential
  product/privacy/policy choices and require explicit owner disposition.
- Exact provenance/filtering, export fields, expiry anchors, appeal window,
  deletion inventory, and restore fence enlarge the local test surface but
  remove ambiguous authority and completion claims.
- One builder may exercise synthetic role fixtures but cannot claim real
  separation of duties or independent operational review.

## Alternatives considered

- **Single local administrator:** rejected because it cannot demonstrate
  object authorization, private-output isolation, or least privilege.
- **Client-supplied user/agent flags:** rejected because hostile clients could
  impersonate humans, owners, or moderators.
- **Mutate a private result to public:** rejected because a confused-deputy or
  stale UI could silently cross the publication boundary and obscure what was
  approved.
- **Let agents post directly:** rejected for the initial product because it
  violates explicit publication consent and magnifies spam/loop risk.
- **Delete audit/correction history wholesale:** rejected because it destroys
  integrity and reversibility; retain minimized non-personal topology instead.
- **Keep every audit/content field forever:** rejected because append-only
  integrity is not authority to retain personal or deleted content.
- **Choose a production identity provider now:** deferred until local
  contracts and ADR-003/P1.9 evidence define actual requirements.

## Validation and gate

Acceptance requires:

- a separately recorded Trust/Security disposition for the complete matrix,
  multi-object/worker/publication contracts, operator boundaries, races, and
  residuals;
- a separately recorded Privacy/Policy disposition for exact fields,
  retention anchors, deletion/export/restore behavior, audit minimization,
  incident/break-glass boundary, and non-claims;
- a separately recorded Quality disposition confirming that every matrix cell,
  state edge, expiry boundary, and deletion row maps to a reproducible named
  P1.7 test owner/artifact and no implementation claim is made; and
- explicit Lead/owner ACCEPT, REVISE, or REJECT for every proposed disposition
  in the table above.

Any REVISE/REJECT or unmapped control holds the gate. Only all review ACCEPTs
plus owner ACCEPT (possibly with recorded amendments) can close P1.6, and P1.7
also needs its separately recorded disposable-local-architecture authorization.
Acceptance would still authorize no real account, identity provider, personal
data, reachable service, provider call, real or publicly reachable posting,
deployment, spending, store submission, or publication.

## Relationship to ADR-005

This proposal answers ADR-005's lifecycle direction by making deletion and
moderation override correction history and by retaining only minimized
non-personal topology after actor deletion. ADR-005 remains proposed until its
reversal-ID choice, this P1.6 gate, and executable correction tests are all
accepted. ADR-012 acceptance alone does not authorize correction
implementation.
