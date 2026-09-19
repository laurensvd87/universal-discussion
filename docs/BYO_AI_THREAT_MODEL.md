# BYO AI Threat Model

Status: Proposed; no provider integration authorized

Last reviewed: 2026-09-19

Owners: Trust/security/privacy with Platform, Product, and Quality review

## Scope and safety objective

This model covers a future user-invoked agent that may receive an explicitly approved subset of the current public page and public discussion, return a private result, and optionally create a separately authorized public agent contribution. It exists to constrain research and design; it does not approve credentials, provider calls, page-content egress, public posting, autonomous agents, or a vendor.

Required state transition:

```text
user invocation -> approved provider payload -> private result
                                              -> explicit preview/confirm
                                              -> public AI contribution
```

There is no implicit transition from private to public. Closing a dialog, accepting provider terms, or invoking an agent is not publication consent.

## Assets and trust boundaries

| Asset | Primary risks | Required posture |
| --- | --- | --- |
| Provider credential/token | theft, logs, sync, browser/page exposure, overbroad scope | Never place a raw reusable secret in public code, page context, synced storage, analytics, or logs. Minimize scope/lifetime and provide revocation. |
| Approved page/discussion payload | browsing disclosure, copyrighted/private content, prompt injection | Show what categories leave the device; default to minimum excerpts/metadata; exclude private/authenticated contexts until separately approved. |
| Private prompt/result | cross-user reads, provider retention, backups, accidental publication | Private by default, owner-bound authorization, explicit retention/deletion, excluded from public counts/search/cache. |
| Public AI contribution | impersonation, missing provenance, confused-deputy publication | Structurally agent-authored with operator/model/provider/invocation provenance appropriate to policy; explicit preview and publish authorization. |
| Cost/budget state | stolen-key spend, loops, replay, denial of wallet | Per-user/provider rate and spend caps, idempotency, no recursive agent calls, visible usage, kill switch. |

Trust boundaries include page/DOM to extension, extension to platform, platform or local client to provider, provider response to private UI, and private result to public contribution. Webpage text, comments, provider output, and agent instructions are untrusted data at every boundary.

## Credential architecture options requiring research

No option is accepted. Provider terms, delegated-auth availability, scopes, retention controls, revocation, regional processing, and whether developer/API access is distinct from consumer subscriptions must be verified from current primary sources.

1. **Provider-delegated authorization:** preferred when a provider offers a suitable third-party OAuth/delegation flow. Limits raw-key handling but still requires token vaulting, scope, refresh, revocation, and provider-term review.
2. **Server-side encrypted user key vault:** operationally straightforward but makes the platform a high-value credential custodian. Requires explicit owner acceptance, key-management design, isolated decryption/inference path, access audit, rotation/revocation, incident response, and proof secrets never enter general logs/backups.
3. **Ephemeral local/browser credential:** avoids server custody but exposes the key to extension compromise and may be incompatible with provider CORS/terms. The credential may exist only in a reviewed isolated context and memory for the invocation; never page context or persistent/synced extension storage.
4. **User-operated local gateway:** strongest custody separation for technical early adopters but adds installation, origin-authentication, update, and local-network attack risks.

Do not invent an OAuth flow, treat a consumer chat subscription as API authorization, or select an option only because it is easiest to prototype.

## Threats and mandatory controls

### Prompt injection and tool abuse

- Agent input cannot grant authority, reveal secrets, change publication state, choose recipients, call arbitrary URLs/tools, or override system policy.
- The first proof, if authorized, is tool-free and cannot post. Prompt wording is not a security boundary; permissions and code enforce the boundary.
- Delimit and label untrusted page/comment content, cap it, and test direct/indirect injection, encoded instructions, data exfiltration requests, and agent-to-agent amplification.

### Secret theft and disclosure

- Use exact structured log allowlists; reject credential-bearing URLs/fields; sanitize errors before logging.
- Secret/token access is isolated to the narrow provider adapter. General application, semantic workers, browser pages, and moderators cannot read it.
- Provide immediate revocation/disconnect and document what cached tokens, encrypted material, logs, and backups retain and for how long.
- Secret scanning, packaged-extension inspection, dependency review, and credential leak incident drills are gate evidence.

### Private-output authorization

- Every invocation and private result has an owning human account and deny-by-default object authorization.
- Cross-user read, list, cache, export, publish, edit, and delete tests are mandatory.
- Public counts, recommendations, and semantic clustering never incorporate private output.
- A publish request is a separate authenticated action bound to the result, owner, current preview digest, target topic, and single-use/idempotency token. Re-authenticate or reconfirm after material edits or stale sessions.

### Provenance and impersonation

- Human and agent actor types are disjoint and server-enforced; an agent cannot select `human`.
- Published output identifies the agent class/operator and retains an auditable invocation/publication record without unnecessarily exposing the private prompt or secret.
- Third-party autonomous posting is denied. Any future capability requires registration, review, narrow scopes, rate limits, reputation/moderation, and a new decision.

### Provider/data-handling risk

- Before a call, state the exact transmitted fields, purpose, provider, retention/training setting, region where relevant, and user control.
- Do not send authenticated/private pages, cookies, form values, full history, unrelated discussion content, or hidden DOM by default.
- Provider responses are untrusted: render as text/sanitized structured content, allowlist links/schemes, and never execute returned code or instructions.
- Define deletion/export behavior across platform and provider limitations; surface what the platform cannot delete.

### Cost and abuse

- Enforce server-side or local hard limits before each call: input/output size, calls per user/agent/topic, concurrency, retry count, and monetary budget.
- Cache only with compatible privacy/ownership semantics. A private response is not a shared cache entry.
- Prevent replay and recursive loops; require idempotency; expose usage to the credential owner; provide global/provider/user kill switches.

## Minimum verification gate

- Current provider-specific terms/auth/data-handling research with dated primary sources and an accepted adapter/credential ADR.
- Data-flow inventory showing every credential and content copy, encryption boundary, log field, retention, deletion, and operator access.
- Tests proving raw secrets/private prompts/results are absent from extension persistence, sync, logs, traces, crash reports, analytics, URLs, and ordinary backups.
- Authorization matrix covering owner/non-owner reads, publish, edit/delete, replay, stale preview, actor impersonation, and scope escalation; all negative cases deny.
- Prompt-injection tests proving hostile content cannot reach secrets, tools, network destinations, publication, or policy controls.
- Provider-response rendering tests for HTML/script, malicious links, oversized output, malformed structured data, and instruction text.
- Rate/budget/retry/idempotency tests plus disconnect/revocation and incident-response exercises.
- Explicit UX test: output is visibly private by default; publication requires a separate preview and affirmative action; published output is conspicuously AI-authored.
- Trust, Quality, and owner sign-off before any real credential or provider call.

## Stop/go

**STOP** while provider auth/terms are unverified, raw keys would need persistent extension storage, exact page-data disclosure is undefined, object authorization is untested, private output can affect public state/counts without a separate action, provenance can be omitted, or spend cannot be hard-capped.

**GO only for a fake local adapter** before those decisions. A fake adapter uses no secret/network/provider, returns labeled deterministic test data, and can validate private/public state transitions without implying provider feasibility.
