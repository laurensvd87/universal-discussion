# AI Agents, BYO Compute and Economics

Updated: 2026-09-29. ADR-014 and roadmap R3 govern sequencing. This is product
design, not an implemented provider integration. Dated primary-source evidence:
`research/PRODUCT_RESET_2026-09-27.md`.

Latest owner-requested priority: investigate source-grounded insights about the
current page and relevant other sites as immediate personal value, then deliberate
public contribution. [Current evidence](../research/AI_INSIGHT_COLD_START_2026-09-29.md)
distinguishes useful research, willingness to share and native participation.
The intended result is reusable public discussion, not a private-chat-only tool
or automatic filler. No provider/build/publication permission follows.

## Economic principle
The platform should not fund unrestricted third-party inference.

### Platform agents
Small number of high-value agents funded by the platform. Use sparingly, cache
only explicitly approved public outputs, never raw/private page context, and
enforce budgets.

### User-owned agents
Users may connect supported AI developer/API credentials or other technically valid provider mechanisms. Consumer subscriptions must NOT be assumed to provide API rights. Provider support and terms must be researched at implementation time.

An API key should not be required for the basic contribution experience. Prefer:

1. **Manual handoff/import:** preview an editable prompt and exactly the context
   the user chooses to copy into their existing AI application. Paste a response
   back as a private AI draft with user-declared provenance, then review/publish.
   No hidden clipboard/history reading or automation of provider websites.
2. **Supported AI-host connector:** ChatGPT/Claude or another supported host calls
   our authenticated tools to read allowed public Topics and submit an owner-
   private draft. The host supplies inference; our service supplies narrow tools.
   No publish privilege in the first connector, and no consumer tokens in our app.
3. **Supported consumer-plan delegation:** current official OpenAI documentation
   describes ChatGPT plan use for eligible OSS/local apps through explicit OAuth.
   This is not permission to reuse browser credentials or a guarantee of project,
   account, search or future commercial/mobile eligibility. No project license or
   provider is selected; see the current research and retained approval gates.
4. **Optional direct API/on-device inference:** a later reviewed adapter with its
   own supported auth/model license, device/cost limits and disclosure.

These are alternatives, not guaranteed subscription benefits. Connector
availability/terms vary; no unlimited background generation is promised. Manual
handoff preserves a useful route if a connector disappears. The first local
fixture can test draft UX without disclosing data to any provider.

The planned initial selector will use built-in declarative definitions such as General
Analysis, Opinion, and Summary. Owner-defined definitions may add modes by
declaring purpose, allowed inputs, and needed tools, but cannot expand platform
permissions. Import, subscriptions, and an agent catalog are later gated
features.

Benefits to early adopters:
- useful content even when no human discussion exists;
- ability to interrogate page + discussion context only under the exact
  user-controlled input, privacy, retention, and provider boundary;
- optional publication of useful agent output;
- potential reputation/status for their agent later.

Benefits to network:
- one user's inference can create a persistent public contribution that later users read without regenerating it;
- semantic clustering can expose one useful contribution from multiple relevant source URLs.

### Third-party agents
Developers operate/fund their own compute. Platform supplies controlled read/post APIs and event mechanisms. Commercial access may later be monetized.

Require an accountable operator, scoped identity, quotas, idempotency, provenance,
moderation and revocation. An agent without an operator is not a funding or
accountability model. Start with private draft submission; autonomous public
posting is a later separately approved capability. Avoid agent-to-agent loops.

## Cold start and incentives

Offer immediate personal value, then make voluntary publication easy. A source-
grounded insight, comparison or question is more useful than generic filler on
every new Topic. AI judgments of bias remain analysis, not objective verdicts;
current prices need current evidence. Cache only authorized public contributions.

Candidate incentives: curator credit, useful-vote reputation, selected/followed
agents and reusable high-quality insights. Do not reward posting volume, bot
voting or disclosure of private context. Keep duplication suppression, AI filters
and sponsorship disclosure. Seed only labeled contributions after publication
approval; measure organic and seeded participation separately.

BYO compute still leaves hosting, moderation, abuse, support and model-distribution
costs. Paid specialist agents and affiliates are later business experiments,
subject to actual store/payment/disclosure rules and owner spending/publication
approval. Do not inject affiliate links or build an advertising profile from
browsing signals. See `research/PRODUCT_RESET_POLICY_2026-09-27.md`.

## Permissions
Default user agent capabilities should be conservative:
- read current supported content: user-controlled;
- read public discussion: yes when invoked;
- generate an unpublished editable candidate: yes;
- public post: explicit preview and user approval by default;
- autonomous public posting: privileged capability requiring registration/review/rate limits/reputation.

Public Topic Discussion is the normal destination, with an explicit owner-only
Private Discussion mode. That does not make AI output public by default: a new
AI result remains an unpublished candidate until the owner publishes it. A
Summary is a root Contribution rather than a reply. Human edits preserve AI
identity and add a human-edited marker.

## Provider neutrality
Design an adapter/interface so the product does not depend on one LLM vendor. Research current auth, API, data handling and ToS for each supported provider.

## Security
Never put raw API secrets in publicly readable extension storage or logs. Threat-model credential handling before implementing BYO keys. Consider local-only secret handling or server-side vault approaches only after security review.

## Cost model to track
For every AI/embedding workflow capture estimates for:
- per-new-source processing;
- per-topic resolution;
- per-agent invocation;
- cached vs uncached response;
- storage/vector index;
- moderation inference;
- abuse/spam defense.

Set hard budget alarms before public beta.
