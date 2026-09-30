# BYO AI Threat Model

Status: baseline threat model; ADR-024 now authorizes a bounded owner-invoked
local ChatGPT PoC. Production/private/remote integration remains gated.

Last reviewed: 2026-09-29

## Current implementation boundary

[ADR-024](../decisions/ADR-024-local-ai-insights-and-chatgpt-poc.md) records the
owner's explicit ChatGPT connection and public-text/source-research approval.
The local implementation uses popup-memory input/result previews, memory-only
OAuth credentials in the paired service, no paid API fallback and a separate
local Share action. Provider web research is restricted to supplied source
domains and cannot inherit browser login cookies. The original first-proof
tool-free rule below applies to the synthetic transport/auth proof; the owner-
requested research step specifically permits the bounded hosted web tool, not
custom tools, autonomous posting, shell, MCP or arbitrary browsing capture.

Synthetic demo actor selection is not secure multi-user ownership. Private
article drafts never enter local-public projections unless explicitly reviewed
and shared as text; this is not ready for remote users. Visible page prose may
contain secrets despite form/hidden-content exclusions. Preview and public-only
scope are required, not a guarantee of automated secret removal. `store:false`
does not establish zero provider retention. All later private/remote/spending/
publication gates survive.

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

ADR-014/R3 adds local draft import and a future AI-host connector as alternatives
to credential custody. A synthetic fixture can test import/preview without a
provider gate; real handoff/connector disclosure still requires its exact approved
boundary. This does not authorize general page capture or public posting.

## Handoff and AI-host connector boundaries

- Manual import treats response text/links and claimed provenance as untrusted.
  Mark provider/model provenance user-declared when not verifiable; never upgrade
  it to an attested invocation or human-authored content. No clipboard polling,
  chat-history scraping, extracted cookies or invented subscription API.
- Preview the outbound prompt/context before copying or handing it off; copying
  private context into another app is still disclosure. No raw source body is
  implicitly included. The user can remove details before leaving this device.
- In a supported connector the AI host calls our service. Authenticate the human
  principal via supported resource authorization; bind draft ownership server-side,
  never trust a model-supplied user/actor ID. Start with public read and private
  draft scopes, no publish tool. Apply quotas, idempotency, revocation and bounded
  rendering. Do not collect the AI subscription token.
- The provider receives tool results and the conversation the user supplies.
  MCP does not make data local/private or remove provider retention obligations.
  A remote endpoint is deployment and requires that separate approval.
- Generated output can be reported before publication. The user previews and
  selects the exact report material; moderators gain no access to private history.

See `research/PRODUCT_RESET_2026-09-27.md` for supported mechanisms and limits.

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

These are the original architecture alternatives. ADR-024 now selects a local
service-owned delegated ChatGPT flow with memory-only tokens for this owner PoC,
not a production credential vault. Other providers, persistent secrets and remote
custody remain unapproved. Provider terms, scopes, retention, revocation, regional
processing and consumer-plan eligibility still require current evidence for any
expanded deployment.

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
- Tests proving raw provider secrets and automatically captured source context
  are absent from extension persistence. Only explicitly approved owner-private
  contributions/drafts/candidates may persist under the scoped lifecycle,
  ownership and deletion controls. R1 permits deliberately entered demo state,
  not real captured context or credentials. Private prompts/results remain
  excluded from sync, logs, traces, crash reports, analytics, URLs and ordinary
  backups; a synthetic actor selector is not secure real-user isolation.
- Authorization matrix covering owner/non-owner reads, publish, edit/delete, replay, stale preview, actor impersonation, and scope escalation; all negative cases deny.
- Prompt-injection tests proving hostile content cannot reach secrets, tools, network destinations, publication, or policy controls.
- Provider-response rendering tests for HTML/script, malicious links, oversized output, malformed structured data, and instruction text.
- Rate/budget/retry/idempotency tests plus disconnect/revocation and incident-response exercises.
- Explicit UX test: output is visibly private by default; publication requires a separate preview and affirmative action; published output is conspicuously AI-authored.
- Trust, Quality, and owner sign-off before any real credential or provider call.

## Stop/go

**STOP** while provider auth/terms are unverified, raw keys would need persistent extension storage, exact page-data disclosure is undefined, object authorization is untested, private output can affect public state/counts without a separate action, provenance can be omitted, or spend cannot be hard-capped.

**GO for a fake local adapter or fixture-only import/preview** before those
decisions. Both use no secret/network/provider and validate private/public
transitions without implying provider feasibility. A real connector or automated
handoff must satisfy applicable controls before activation; direct inference
must additionally satisfy the selected provider credential/cost controls.
