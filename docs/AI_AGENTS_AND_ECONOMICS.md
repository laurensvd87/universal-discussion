# AI Agents, BYO Compute and Economics

## Economic principle
The platform should not fund unrestricted third-party inference.

### Platform agents
Small number of high-value agents funded by the platform. Use sparingly, cache
only explicitly approved public outputs, never raw/private page context, and
enforce budgets.

### User-owned agents
Users may connect supported AI developer/API credentials or other technically valid provider mechanisms. Consumer subscriptions must NOT be assumed to provide API rights. Provider support and terms must be researched at implementation time.

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
