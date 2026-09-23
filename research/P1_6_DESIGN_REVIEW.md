# P1.6 synthetic identity and lifecycle design review

Status: Trust/Security, Privacy/Policy, and Quality AI review lenses ACCEPT;
explicit owner dispositions remain open and P1.7 remains blocked

Review date: 2026-09-23

Reviewed artifacts:

- `docs/PHASE_1_AUTH_AND_DATA_LIFECYCLE_THREAT_MODEL.md`
- `decisions/ADR-012-local-identity-publication-moderation-lifecycle.md`
- the P1.6/P1.7 gate and status statements in `plans/ROADMAP.md`,
  `plans/STATUS.md`, and `README.md`

## Scope and non-claims

This was a read-only design review of a synthetic, network-denied local
contract. It reviewed authorization, human/agent provenance, private-to-public
publication, reports/appeals/blocks, holds, worker capabilities, export,
deletion, retention, restore, and incident composition. It did not review an
implementation because P1.7 has not started.

The named reviewers are AI review lenses, not independent people, qualified
legal advice, a penetration test, or evidence of production separation of
duties. The solo owner may exercise deterministic role fixtures, but an
independent qualified human review is still required before real accounts,
personal data, network exposure, or a public alpha.

## Reviewer provenance

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

## Findings and remediation record

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

## Final dispositions

| Review lens | Final disposition | Basis |
| --- | --- | --- |
| Trust/Security | **ACCEPT** | No remaining blocker or major contradiction in object authorization, capability scope, hold/containment composition, publication, incident recovery, or race behavior |
| Privacy/Policy | **ACCEPT** | No remaining blocker or major contradiction in exact export values, deletion assets, retention anchors, cleanup continuity, audit minimization, or non-claims |
| Quality/test traceability | **ACCEPT** | Every reviewed control/state/race/default maps to a named deterministic P1.7 evidence owner and artifact; no implementation claim is made |

The iterative re-audit and the fresh final audit each returned all three ACCEPT
dispositions after the final held-purpose and expired-report clarifications.

## Static verification

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

## Residual gates

The AI dispositions establish design readiness only. P1.6 remains open until
the owner explicitly ACCEPTS, REVISES, or REJECTS every ADR-012 disposition.
After that, P1.7 still requires a separate owner authorization for one exact
disposable, network-denied, synthetic architecture before implementation.

No part of this review authorizes a real account or identifier, personal data,
external identity provider, reachable listener, browser/service egress,
provider/model call, real/public posting, production moderation, telemetry,
infrastructure purchase, deployment, store submission, announcement, or
publication. The later 200–250-pair provenance-approved semantic review is not
the next task and has not been started or bypassed.
