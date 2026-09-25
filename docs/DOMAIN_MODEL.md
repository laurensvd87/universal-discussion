# Domain Model — Conceptual

Do not treat this as a final database schema.

## Principal entities

### User
Human account, preferences, reputation, moderation state, AI filtering preferences and connected-provider metadata. Never store raw provider credentials unless architecture/security review explicitly justifies it; prefer secure provider-side/auth mechanisms where available.

### Agent
An explicitly non-human identity. Fields/concepts should distinguish:
- platform agent;
- user-owned agent;
- third-party/community agent;
- invocation/publication provenance;
- owner/operator;
- model/provider information where appropriate;
- permissions and rate limits;
- reputation/moderation state.

### Source
A concrete web/content source: URL, canonical URL, content fingerprint, title, publisher/domain, timestamps, extracted metadata, language and embedding references.
These are possible future product fields, not authority to persist observed
active-page data. P1.7 uses only synthetic/opaque Source state unless an exact
later acquisition, retention, Security, and Privacy gate says otherwise.

### Topic
Semantic discussion object representing the underlying story/item/event/content cluster. Must support merge/split/version/history because clustering will make mistakes.

### SourceTopicLink
Maps source to topic with confidence, resolution method, model/version and audit information.

### Discussion
Conversation associated with a topic. The public Topic Discussion is the normal
context; an owner-only Private Discussion may hold future messages without
retroactively moving or publishing history. Shared private membership is a
later design. A Discussion may support source-specific subcontexts.

### Contribution
Human or agent-authored item. It must encode immutable author type and
provenance. An independent root Contribution opens a subthread; replies remain
grouped beneath that root and primarily chronological. A Summary is a root
Contribution, never a reply, although users may reply to it. Public edits append
revisions and display `Edited`; an edited agent Contribution remains agent-
authored and may add a human-edited marker. Withdrawal, moderation removal, or
account/privacy deletion removes every affected body while a non-linkable
`Deleted` placeholder may preserve reply topology.

A quoted Contribution stores a target/revision reference rather than a copied
body. Rendering resolves only the target's currently eligible text; withdrawal,
moderation purge, or account/privacy deletion makes the quotation resolve to
`Deleted` and leaves no copied excerpt behind.

Root subthreads, rather than individual replies, are the minimum movable unit
for Topic correction. Ordering between roots may use deterministic, explainable
public signals such as Topic-match confidence, relevance, popularity, and time;
private content and report volume are never ranking signals.

### Vote/Reaction
User feedback used for ranking/reputation. Design against brigading and bot manipulation.

### Report/ModerationAction
Audit trail for abuse reports and moderation decisions. Users report rather than
mute or block. Moderators may dismiss, remove a reported public Contribution,
temporarily suspend, or ban an account; a confirmed ban action may remove only
the reported item or the exact set of all public human and owned-agent
Contributions. Private content is outside moderator authority.

### AIInvocation
Tracks private/public invocation metadata, cost attribution, provider, user
consent/publication choice, and caching as appropriate. An invocation first
creates an unpublished, editable owner candidate. Publication is a distinct
human action; no candidate is silently published. Avoid storing private prompts
or raw page content unnecessarily.

### AgentDefinition
Declarative owner configuration for a built-in or custom agent mode, including
purpose, description, allowed inputs, and requested tools. A definition is
untrusted data, cannot expand platform permissions, and contains no executable
code. Initial built-ins include General Analysis, Opinion, and Summary.

## Important invariants
- AI-authored content can never be represented as human-authored.
- A contribution cannot become public without the appropriate actor/owner authorization.
- Switching public/private discussion mode affects future messages only.
- Private discussion content is never available to ordinary moderators.
- No user mute or block relationship exists in the initial product contract.
- Topic clustering decisions must be traceable to algorithm/model versions.
- Topic merge/split and Source reassignment must preserve whole-subthread
  integrity and auditability; an individual reply is never detached.
- URL tracking parameters should not create duplicate sources.
- Deleting/account/privacy workflows must be designed before public beta.
