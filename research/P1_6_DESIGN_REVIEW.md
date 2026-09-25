# P1.6 identity, discussion, moderation, and lifecycle design review

Status: 2026-09-23 baseline AI reviews ACCEPT; owner accepted a materially
amended package on 2026-09-24; fresh amended-design Trust/Security,
Privacy/Policy, and Quality AI reviews ACCEPT on 2026-09-25; P1.7 remains
blocked on exact architecture authorization

Review dates: 2026-09-23 baseline; 2026-09-24 owner amendment; 2026-09-25 fresh
amended-design review

Reviewed artifacts:

- `docs/PHASE_1_AUTH_AND_DATA_LIFECYCLE_THREAT_MODEL.md`
- `decisions/ADR-012-local-identity-publication-moderation-lifecycle.md`
- the P1.6/P1.7 gate and status statements in `plans/ROADMAP.md`,
  `plans/STATUS.md`, and `README.md`

## Historical baseline scope and non-claims

The 2026-09-23 pass was a read-only design review of a synthetic,
network-denied local contract. It reviewed authorization, human/agent
provenance, private-to-public publication, reports/appeals/blocks, holds,
worker capabilities, export,
deletion, retention, restore, and incident composition. It did not review an
implementation because P1.7 has not started.

The named reviewers are AI review lenses, not independent people, qualified
legal advice, a penetration test, or evidence of production separation of
duties. The solo owner may exercise deterministic role fixtures, but an
independent qualified human review is still required before external users,
real accounts, persisted or egressed real personal data, network exposure, or a
public alpha.

## Historical baseline reviewer provenance

| Review pass | Lens/provenance | Initial disposition | Purpose |
| --- | --- | --- | --- |
| Initial audit | Read-only AI `p16_security_audit` | REJECT/REVISE | Authorization, capability, identity/provenance, deletion/export, retention, restore, incident, and test-owner completeness |
| Transition/race audit | Read-only AI `transition_race_review`, spawned by the initial audit | REVISE | Atomic transitions, replay/idempotency, privacy/moderation races, snapshot capture, restore fencing, and containment reachability |
| Iterative re-audit | Read-only AI `p16_reaudit` plus bounded follow-ups | REVISE, then final ACCEPT | Verify each remediation and search for composition contradictions across the detailed model, ADR defaults, and required tests |
| Fresh final audit | Separate read-only AI `p16_fresh_final_review` | REVISE, then final ACCEPT | Independently re-read the final contract, especially hold-purpose authority and export value-state determinism |
| Cross-file final audit | Separate read-only AI `final_doc_consistency` | REVISE, then PASS | Verify status/gate sequencing, review claims, references, future semantic direction, and non-authorization language across all eight documents |
| Reconciliation | Lead/orchestrator AI | Not a separate disposition | Apply bounded documentation corrections, keep status/gates aligned, and run static checks |

No reviewer edited the artifacts it reviewed. AI review independence is limited
to separate read-only passes and must not be described as independent human
staffing.

## Historical baseline findings and remediation record

| Finding family | Earlier disposition | Final contract/remediation | Evidence location |
| --- | --- | --- | --- |
| Incomplete object authorization and ambient operators/workers | REJECT/REVISE | Canonical deny-by-default command binds every participant, relationship, partition, state/version, session/lifecycle/policy version, global security state/epoch, and exact worker class; unspecified cells deny | Threat model authorization decision and complete matrix |
| Human/agent ambiguity and accidental publication | REVISE | Immutable disjoint actor types, explicit views/counts/provenance, owner-authorized bounded fake invocation, root-only one-result/one-Contribution publication, 15-minute capability, and separate exact-command idempotency | Threat model private/public and provenance sections; `P17-PRIVATE-PUBLISH`; `P17-PROVENANCE-VIEWS` |
| Private-result/publication lifecycle coupling | REVISE | Private body retention is orthogonal after publication; expiry/owner deletion preserves only the minimized retry receipt, while account deletion/reset clears it | Threat model publication and retention sections; ADR-012 private-result default |
| Appeal, withdrawal, and privacy races | REVISE | Action+quarantine and reversal+restore are atomic; subject deletion, owner withdrawal, and content privacy erasure each have explicit terminal states and win by committed sequence | Threat model moderation state machine; `P17-MODERATION-APPEAL` |
| Export of third-party identifiers or stale/forbidden values | REVISE | Fresh bundle-local aliases replace third-party IDs; exact field/value allowlist rejects unknowns; body strings/nulls follow lifecycle state; expired private-result and report records are omitted as whole records; retained optional report evidence uses explicit `null` | Threat model export schema/value rules; ADR-012 export default; `P17-EXPORT` |
| Snapshot ambiguity and deletion resurrection | REVISE | State image and transition sequence capture atomically; RPO equals the captured sequence with expected later non-safety loss; all later safety events replay; an atomic current-watermark fence gates only an isolated local read model | Threat model export/snapshot/restore section; `P17-RESTORE` |
| Containment could revoke its own recovery authority | REVISE | Opening containment atomically issues an incident/version/epoch-bound `incident_control` session restricted to exact incident read, close, and restore abort; loss/expiry stays contained until visible reset | Threat model safety-capability and incident sections; `P17-INCIDENT` |
| Pre-containment work could survive a global state change | REVISE | Every ordinary session/capability/worker/preview/export/restore path binds and revalidates global state/epoch at commit; every global transition increments the epoch | Threat model authorization, hold, and incident sections |
| Cleanup could deadlock behind holds/containment | REVISE | Lifecycle-engine-issued `safety_cleanup` is delete/expire-only, has no body/disclosure/create/export/publish/moderation/restore authority, covers every declared physical-purge class, and is atomically replaced into a new epoch only for still-current steps | Threat model safety capability and matrix; `P17-WORKER-SESSION-HOLD`; `P17-RETENTION` |
| Moderation-hold export was allowed but its ordinary worker was revoked | REVISE | All pre-hold work is revoked; a post-hold purpose session may issue one 15-minute owner/request/snapshot/schema/hold/epoch-bound `moderation_hold_export`; security hold, containment, deletion, or any bound-state change revokes it | Threat model hold capability/table and retention profile; ADR-012 moderation-hold export default |
| Held-purpose action names and reauthentication were ambiguous | REVISE | Exact action table enumerates seven possible owner actions for moderation-only, security-only, and combined holds; only request export, download export, and confirm deletion require a five-minute single-use full-hold-vector-bound `held_purpose_reauth`; every unlisted action denies | Threat model held-purpose table; `P17-WORKER-SESSION-HOLD`; ADR-012 held-account/session defaults |
| Deletion-ledger expiry and no-snapshot case were incomplete | REVISE | Exact ledger schema uses the later of verified effect +24 hours or every affected snapshot expiry +24 hours; with no snapshot the first anchor applies; expiry atomically reduces to an exact non-linkable schema for 30 days, then purges | Threat model retention table and deletion inventory; `P17-DELETION`; `P17-RETENTION` |
| Test ownership did not cover every decision edge | REVISE | Named P1.7 tests now require coverage of every authorization cell, state edge, expiry boundary, deletion row, value-state rule, race, and narrow capability; absence is a gate failure | Threat model required P1.7 contract-test table |

## Historical baseline final dispositions

| Review lens | Final disposition | Basis |
| --- | --- | --- |
| Trust/Security | **ACCEPT** | No remaining blocker or major contradiction in object authorization, capability scope, hold/containment composition, publication, incident recovery, or race behavior |
| Privacy/Policy | **ACCEPT** | No remaining blocker or major contradiction in exact export values, deletion assets, retention anchors, cleanup continuity, audit minimization, or non-claims |
| Quality/test traceability | **ACCEPT** | Every reviewed control/state/race/default maps to a named deterministic P1.7 evidence owner and artifact; no implementation claim is made |

The iterative re-audit and the fresh final audit each returned all three ACCEPT
dispositions after the final held-purpose and expired-report clarifications.

Those dispositions apply only to the 2026-09-23 baseline. The owner amendments
below materially replace its session, publication, moderation, retention,
export, restore, and active-context assumptions; the earlier ACCEPT results are
therefore historical evidence, not acceptance of the amended package.

## Owner amendment accepted on 2026-09-24

The solo owner completed the gate point by point and then accepted the
consolidated package. Implementation was intentionally held until every point
was decided. The accepted dispositions are:

| # | Accepted disposition |
| ---: | --- |
| 1 | Owner-only local tests may eventually process a lawfully accessible public, authenticated, or private active page without bypass, background/inbox scanning, cookie/token/form/attachment access, raw-source persistence, logging, backup, or egress. Exact body-derived testing still needs its own architecture and Security/Privacy/Policy gate. |
| 2 | Human and agent identities, provenance, views, counts, permissions, and rate classes remain immutable and distinct. |
| 3 | P1.7 uses a persistent selected synthetic identity with no password/provider or timed logout. Real login is deferred. |
| 4 | A normal Topic Discussion is public. An easy owner-only Private Discussion switch affects future Contributions only; a private item needs a separate explicit publish action and nothing publishes silently. |
| 5 | Empty Discussions may offer deterministic fake-agent candidates. Built-ins include General Analysis, Opinion, and Summary, with Price Comparison optional; declarative owner-defined agents are supported in principle, while catalogs/subscriptions/providers remain later gates. |
| 6 | Discussions have root Contributions and grouped chronological replies. Summary is always a root and may receive replies. Root sorting is deterministic and explainable using only approved public signals. Public edits append revisions and show `Edited`; human-edited AI remains agent-authored; withdrawal leaves a neutral tombstone. |
| 7 | There is no user mute or user-to-user block. |
| 8 | Public Contributions can be reported. A moderator may dismiss, remove the reported item, temporarily suspend, or ban. Ban-time bulk removal uses an exact displayed count and selects leave prior content, remove only the reported item, or remove all public human and owned-agent Contributions. Removed bodies become neutral `Deleted` placeholders; private content remains inaccessible; one appeal is available. |
| 9 | Suspended or banned users may read public content, inspect status, appeal, withdraw their own content, log out, delete the account, and later use the centralized export route; they cannot create, reply, react, invoke AI, publish, or edit. |
| 10 | Moderator, correction, privacy, security, and worker scopes remain separate even when one owner exercises them. Cleanup is delete-only. Containment stops new content, AI, publication, export, ordinary jobs, and restore promotion while permitting public reads and exact moderator hiding; there is no private-content break glass. |
| 11 | Passwordless-PoC account deletion uses a second confirmation; a later real-login system requires reauthentication. Deletion removes profile/direct identifiers, private Discussions, drafts, prompts/results, agent definitions, reactions, and every revision body of public human and owned-agent Contributions. Other users' replies remain; retained topology is non-linkable `Deleted`; quotes are references; deletion is staged inaccessible/service-deleted/fully-purged. |
| 12 | User content remains until manual deletion, withdrawal, moderation, account deletion, or explicit local reset. Raw page text is ephemeral. Reports last through review and the seven-day appeal window plus at most 30 days; moderation proof lasts 90 days; ordinary security logs 30 days and incident logs 90 days; correction actor pseudonyms last at most 90 days. There is no inactive-account auto-deletion. |
| 13 | User export is deferred to one future central web Account & Privacy Center to which clients link. No extension/mobile export generator is built in P1.7; an adequate access route is required before real accounts or public operation. |
| 14 | The PoC has no real/cloud backup. Restore tests use isolated synthetic fixtures with replay/watermark safeguards; real backup requires later provider, security, privacy, deployment, and spending gates. |
| 15 | `Not same topic` reports feed moderator/correction review. The matcher suggests only. Reassignment, merge, or split never silently moves an existing conversation; a root plus every reply moves atomically or remains with a notice. Audit data is minimized and the actor pseudonym lasts at most 90 days before role-only retention. |
| 16 | The solo owner may exercise separate role fixtures locally. An independent qualified person becomes mandatory before external testers, real accounts/personal data, reachable networking, public operation, deployment, or store/publication review. Future embeddings are not anonymous by default. The later 200–250-pair provenance-approved review remains a separate stop. |

The owner also amended the interaction contract: opening the extension is the
explicit gesture and should automatically load only the active top-level URL,
approved metadata, and local mapping/discussion lookup. No second button is
required. Popup open does not authorize automatic body extraction, AI
invocation, publication, persistence, or egress. The result must bind to the
tab/document/version and stale state must clear on navigation, close, failure,
or a superseding lookup.

These amendments authorize design reconciliation only. They do not authorize
P1.7 code, real accounts, a provider/model, networking, deployment, spending,
store submission, or publication.

## Fresh amended-design review

The amended package received three fresh read-only review lenses. No reviewer
edited the artifacts it reviewed.

| Review pass | Lens/provenance | Progression | Purpose |
| --- | --- | --- | --- |
| Amended Trust/Security | Read-only AI `p16_amended_security_review` | Candidate findings, remediation re-read, final **ACCEPT** | Authorization, active-context binding, private/public publication, moderation and collection races, containment, deletion, restore, custom data, and gate boundaries |
| Amended Privacy/Policy | Read-only AI `owner_gate_delta_map`, fresh follow-up assignment | **ACCEPT**, low-severity clarifications reconciled, final **ACCEPT** | Active/private-page boundary, raw/derived classifications, private output, retention, report evidence, deletion, centralized future export, restore, rights/store non-claims, and later gates |
| Amended Quality/traceability | Read-only AI `roadmap_status_delta`, with read-only `static_trace_check` | Candidate findings, **REVISE**, remediation re-read, final **ACCEPT** | Sixteen-decision and auto-load traceability, named tests, status/gate sequencing, P1.7/P1.10/P1.11 boundaries, implementation non-claims, paths, tables, and static consistency |
| Reconciliation | Lead/orchestrator AI | Not a separate disposition | Apply bounded documentation corrections, freeze before each final re-read, and run local static checks |

The fresh review findings and reconciliations were:

| Finding family | Reconciliation | Evidence owner |
| --- | --- | --- |
| Private human item was publishable in prose but absent from transitions | Added exact-current-revision preview and idempotent copy to a distinct public human root; private parent/history never transfers | ADR-012 public/private section; authorization matrix/state machine; `P17-DISCUSSION-VISIBILITY` |
| Bulk ban and subthread move lacked collection-membership race fences | Added account-owned-public-set and subthread-membership versions, serializable ordering, stale-preview failure, and concurrent create/reply tests | Threat model moderation/correction sections; `P17-MODERATION-BAN`; `P17-CORRECTION` |
| Containment rights and deletion-worker authority were ambiguous | Defined the account-state/global-state intersection, paused appeal deadline, denied restoration, denied workers request/confirm authority, and retained only post-commit delete-only cleanup | Authorization matrix and containment section; `P17-WORKER-INCIDENT` |
| Editing after report could replace the evidence under review | Bound the case to the exact revision that was public when reported; assigned-case access expires with appeal and withdrawal/account/privacy deletion purges the body | ADR-012 moderation section; threat-model asset/lifecycle tables; `P17-MODERATION-BAN` |
| Source fields, quotations, and AI caching needed privacy qualifiers | Made Source fields non-authorizing, quotations reference-only and deletion-following, and caching limited to explicitly approved public outputs | Domain model; AI economics; `P17-THREAD-REVISION-SORT`; `P17-DELETION` |
| Popup/body scope and P1.7/P1.10/P1.11 language could overclaim | P1.7 now permits only URL/approved metadata/local lookup and a fixed fake fixture; body derivation stays in gated P1.11; P1.10 adds the optional adapter contract | ADR-012 boundary; roadmap; `P17-CONTEXT-AUTOLOAD`; `P17-AGENT-PREVIEW` |
| Cross-file status, moderation options, ADR-005/ADR-013 wording, tense, and references diverged | Aligned all three ban choices, kept ADR-005 conditional, recorded ADR-013 as an approved direction but unapproved implementation, used future tense, and root-qualified repository paths | Roadmap, status, README, AI model, acquisition policy |

Final dispositions on the reconciled frozen package:

| Review lens | Final disposition | Basis |
| --- | --- | --- |
| Trust/Security | **ACCEPT** | No critical, high, medium, blocker, or major authorization/security contradiction remains; residual architecture durations/modules and implementation evidence stay at P1.7 |
| Privacy/Policy | **ACCEPT** | No blocker, major contradiction, or material privacy/policy issue remains; this is not legal or independent-human evidence |
| Quality/test traceability | **ACCEPT** | All owner decisions and auto-load map coherently to status, gates, and named test families; no current implementation is overstated |

P1.6's design gate is complete. These are AI design-review lenses, not
independent human staffing, legal/store advice, a penetration test, or review of
P1.7 code.

## Historical baseline static verification

The final documentation check must include both tracked and new files. Evidence
recorded for this review:

| Check | Result |
| --- | --- |
| Root-qualified Markdown references | PASS across all eight changed/new documents; zero missing paths |
| Markdown table structure, trailing whitespace, and final newlines | PASS across all eight changed/new documents |
| High-confidence changed-document secret scan | PASS across all eight changed/new documents: zero findings for six patterns; matched values are never printed |
| Package `npm run check:secrets` | PASS before final staging: 95 package files, zero findings, six detector self-tests; this package-scoped scanner does not cover root documentation |
| Cross-file status/gate consistency | PASS after the separate read-only final audit and correction of two stale headers |
| `git diff --cached --check` | PASS across the full staged diff, including all new files |
| Product test suites | Not rerun: this change is documentation/design only and makes no implementation claim |

## Final amended-package static verification

| Check | Result |
| --- | --- |
| Root-qualified Markdown references | PASS across all ten changed documents; zero missing paths |
| Markdown table structure, trailing whitespace, and final newlines | PASS across all ten changed documents |
| High-confidence changed-document secret scan | PASS across all ten changed documents: zero findings for six patterns; matched values are never printed |
| Package `npm run check:secrets` | PASS: 95 package files, zero findings, six detector self-tests; this package-scoped scanner does not cover root documentation |
| Fresh cross-file review | Trust/Security, Privacy/Policy, and Quality each **ACCEPT** the reconciled amended package |
| `git diff --check` | PASS across the full documentation diff before staging |
| Product test suites | Not rerun: this is a documentation/design change and makes no implementation claim |

## Residual gates

The owner dispositions and fresh amended-design reviews are complete; P1.6's
design gate is closed. P1.7 still requires a separate owner authorization for
one exact disposable, network-denied local architecture before implementation.

No part of this review authorizes a real account or identifier, external
identity provider, reachable listener, browser/service egress, provider/model
call, real/public posting, production moderation, telemetry, infrastructure
purchase, deployment, store submission, announcement, or publication. The
owner-approved possibility of a later owner-only, locally processed active-page
test remains behind its exact architecture and Security/Privacy/Policy gate.
The later 200–250-pair provenance-approved semantic review is not the next task
and has not been started or bypassed.
