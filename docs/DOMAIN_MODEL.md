# Domain Model — Conceptual

Do not treat this as a final database schema. ADR-016 places canonical Source,
embedding, Topic and discussion state in a local service behind a versioned API;
the first repository is local SQLite, not an extension-owned IndexedDB database.
S1/S2 implement these entities as a bounded `demo-state/v1` aggregate behind a
repository contract; confirmed Source links remain separate from Source records.

The local R1-R3 implementation order in `plans/ROADMAP.md` and
`decisions/ADR-014-product-first-rebaseline.md` supersedes earlier module-by-module
P1.7 approval prerequisites. This model describes the destination; lifecycle
and moderation details are not all prerequisites for the first local UI.

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
active-page data. Initial local discussion slices use synthetic/opaque Source
state. Broader real-page acquisition and retention need an explicit data-flow
decision; new engineering slices do not silently expand the approved capture.

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

### UserBlock
Owner-scoped relationship that hides a blocked account's human/agent
contributions from the blocker and prevents directed interaction in the app.
It is reversible and does not remove public contributions or suspend accounts.
Apply it to lists, quotations, and rendered projections; it is not a guarantee
against reading public content outside the authenticated app.

### Report/ModerationAction
Restricted case data and audit trail for reports of public contributions or
users and moderation decisions. Reporting, personal blocking, and moderator
bans are separate actions. Moderators may dismiss, remove a reported public Contribution,
temporarily suspend, or ban an account; a confirmed ban action may remove only
the reported item or the exact set of all public human and owned-agent
Contributions. Private content is outside ordinary moderator authority. An
owner may explicitly preview and submit a chosen private AI output/excerpt as
a separate case payload; this grants access only to that submitted evidence,
never its private conversation, prompt, source page, or other drafts. Deletion
and case retention apply to the submitted copy as well.

Local appeal periods and retention deadlines are prototype defaults, subject
to applicable law and store rules before real operation. A central web privacy
center can serve all clients; access/erasure handling must exist when required,
and mobile clients must offer an account-deletion entry point.

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
- Private discussion content is never browsable by ordinary moderators; only an
  exact owner-submitted report payload becomes restricted case evidence.
- Personal blocking and in-app reports of users/content are public-release requirements.
- Topic clustering decisions must be traceable to algorithm/model versions.
- Topic merge/split and Source reassignment must preserve whole-subthread
  integrity and auditability; an individual reply is never detached.
- Proven tracking parameters should not create duplicate sources; identity-
  bearing or unknown parameters must not be dropped merely to force a match.
- Deleting/account/privacy workflows must be designed before public beta.
