# ADR-013: Future on-device content-derived private matching

Status: Owner-approved future local-test direction; exact architecture and
implementation remain proposed; no model, egress, retention, provider,
deployment, spending, store, or publication approval

Date: 2026-09-24

Owners: Lead/Product, Semantic, Platform and Client, Trust/Security/Privacy/
Policy, and Quality

## Context

URL and metadata matching cannot reliably connect different pages that carry
the same underlying content. The owner wants a future edition that may examine
bounded page content locally, derive a comparable fingerprint or embedding on
the end user's device, and use that signal privately to resolve a Topic and its
Discussion. Other users must never see the signal. A similar-phishing-email
discussion is an illustrative high-risk limit case, not a separate committed
feature.

Local transformation reduces raw-content egress but does not itself settle
website terms, copyright, store policy, or privacy. Stable hashes are
dictionary/linkability targets, and dense embeddings can leak or permit partial
input reconstruction. A derived representation is therefore not a secret or
anonymous merely because a human cannot read it directly.

The owner has directed planning to assume that an explicit, user-invoked local
semantic derivation is permitted under the owner's interpretation of website
terms. The desired match is semantic similarity across different content, not
byte identity; an exact hash is only a duplicate/control baseline. On
2026-09-24 the owner approved, in principle, an owner-only local test on
lawfully accessible public, authenticated, or private active pages, including a
manually opened webmail page. That approval has no implementation until an
exact Security/Privacy architecture gate passes, and it is not an independent
legal/store conclusion or approval for external testers.

`research/CONTENT_ACQUISITION_AND_STORE_POLICY.md` records the current official
store/rights evidence, embedding-inversion evidence, design constraints, and
qualified-review boundary.

## Proposed direction

For a separately approved future branch:

1. Require an explicit user action and an exact approved content/context
   contract. Opening the extension may be that gesture for URL/approved
   metadata/local lookup; raw-body derivation remains a separately disclosed
   local operation. Extract and minimize locally; never send raw page/message
   content.
2. Version the local canonicalization, redaction, model/fingerprint, and output
   schema. Reject unsupported, ambiguous, oversized, or negatively signalled
   contexts. Authenticated/private input is not rejected merely for being
   private in the owner-only experiment, but it receives the stricter controls
   below and can never flow into automatic publication or provider egress.
3. Classify every fingerprint, embedding, centroid, similarity score, and
   derived identifier as restricted content/browsing-interest data. Encryption
   and access control protect it; they do not make it anonymous.
4. Send one authenticated purpose-bound query signal to a private matcher. Keep
   it only in bounded process memory for that transaction; exclude it from
   logs, analytics, queues, caches, exports, and backups; delete it immediately
   after match/no-match.
5. Return only an authorized `TopicId`/Discussion resolution or no-match. Never
   return the matcher signal/index, vectors, fingerprints, nearest neighbours,
   raw scores, or stable cross-user signal IDs to the client, users, moderators,
   or public APIs. A client/extension that derives the query locally must never
   render, persist, log, or otherwise expose it.
6. To support future matches, retain at most one protected, versioned
   per-Topic representative or adopt a separately proven private-comparison
   protocol. The representative remains restricted derived content with its
   own access, retention, rotation, poisoning, correction, and deletion rules.
7. Do not update a representative from each query automatically. A no-match may
   seed a provisional Topic only under an approved provenance/consent and abuse
   policy; otherwise discard the signal and remain unmapped.
8. Keep Discussion content and identity separate from matching material. A
   Contribution references the resulting Topic; it never contains or grants
   access to the source content, query signal, representative, or match score.

This is the desired architecture to investigate, not an accepted design or an
implementation authorization.

## High-risk private-message stress case

Private messages/webmail require a later, stricter exact gate. No passive inbox
scan, attachment inspection, or automatic background derivation is proposed.
Model and transformation validation starts with one project-created synthetic
message. After that evidence and an explicit Security/Privacy checkpoint, the
owner-approved local scope may use one manually opened real message that the
owner may lawfully access. The operation locally removes or generalizes
addresses, names, signatures, quoted history, message/order IDs, unique/tracking
URLs, fine timestamps, tokens, and other recipient-specific values before
derivation. No raw or derived value leaves the device in that experiment.

A resulting Topic may represent a suspected campaign, but no Discussion is
shown across accounts until an approved minimum-cohort/anti-correlation rule
passes. Participants cannot learn another recipient's identity, provider,
message, vector, match, or score. Community statements such as “this looks like
phishing” remain unverified guidance, and the design needs poisoning, attacker
participation, rate-limit, provenance, moderation, and correction tests.

The example demonstrates how far the generic mechanism might later extend; it
does not authorize inbox enumeration, a multi-user private-message feature,
remote matching, or publication of message-derived material.

## Consequences

- Raw-content egress and per-observation server retention can be avoided.
- Some durable comparable state is still required for later matching. Deleting
  every representation after assigning a Topic would make future semantic
  matching impossible unless Topic IDs are derived deterministically or a
  private protocol replaces the index.
- A protected Topic representative has lower per-user retention than storing
  every observation, but it can still leak content properties, be poisoned,
  and become a browsing-interest oracle if access controls fail.
- Model/version drift, cross-language behavior, false joins, adversarial text,
  device cost, and correction semantics become measurable product risks.
- Store/rights obligations continue to follow the source access and derived
  data; the approach cannot be advertised as automatically ToS-safe.

## Alternatives considered

- **Send raw content to the server:** rejected as the default because it
  maximizes disclosure, rights, retention, and breach impact.
- **Expose or download the server vector index:** rejected as the default
  because it conflicts with the non-disclosure boundary and enables probing.
- **Delete query and every Topic representation:** privacy-minimal but cannot
  match later users except by an exact deterministic identifier.
- **Per-device salted hashes:** reduce cross-user linkability but also prevent
  the required cross-user matching.
- **Shared client-side secret/HMAC:** insufficient as a durable secret because
  a key distributed to untrusted clients can be extracted; exact matching also
  does not solve semantic similarity.
- **Exact content hash as the product resolver:** retained only as a duplicate
  control because it cannot join semantically similar non-identical content.
- **Private-set-intersection, OPRF, secure-enclave, homomorphic, or other
  private-query designs:** retain as research candidates; none is assumed
  practical or approved without a threat/performance proof.
- **Per-site APIs:** optional higher-trust adapters only, not the general core.

## Required gates

Before even a local implementation:

- owner approval of the exact project-created or owner-authored synthetic
  fixtures, content region, redaction, transformation, model/licence, and
  success/stop metrics; synthetic evidence comes first;
- Trust/Security and Privacy review of local extraction, derived-data leakage,
  malicious input/model files, device isolation, and deletion verification;
- Policy/rights/store review that explicitly rejects any claim that local
  hashing/embedding alone supplies permission; and
- Quality ownership for deterministic reproducibility, inversion, membership,
  linkability, collision/false-join, poisoning, language, and resource tests.

Before any signal leaves a device, separately approve the exact payload,
purpose, authentication/account linkage, matcher/index design, Topic
representative lifecycle, minimum-cohort rule, logs, retention/deletion/
backups, security response, provider/model, cost, deployment, and rollback.
Before exercising the already approved owner-only real-page direction, stop for
the exact extractor/model/redaction Security, Privacy, and Policy checkpoint.
No new generic owner-scope permission is needed, but the exact technical design
must be accepted. Operating a reachable matcher, purchasing resources, store
submission, and publication each remain their own explicit owner and applicable
Security/Privacy/Policy/provider/spending/deployment/publication gate.

An independent qualified IP/platform-terms reviewer is required before external
testing, generalized product support for third-party/private content, store
submission, or publication. It is not required for the approved owner-only,
network-denied local experiment. The solo owner and AI review cannot substitute
for that later assignment.

## Relationship to the current roadmap

ADR-011/P1.5c remains the completed two-route metadata experiment. ADR-013 does
not broaden its completed evidence. The owner-approved automatic-on-popup URL/
metadata lookup and owner-only active-page direction are successor requirements
in ADR-012, not retroactive evidence for ADR-011 or authorization for this
semantic branch. P1.6/P1.7 remain local identity/lifecycle contracts. The
content-derived branch begins only at its separately listed roadmap task and
never bypasses the later 200-250-pair provenance-approved semantic review gate.
