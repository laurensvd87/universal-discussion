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

### Topic
Semantic discussion object representing the underlying story/item/event/content cluster. Must support merge/split/version/history because clustering will make mistakes.

### SourceTopicLink
Maps source to topic with confidence, resolution method, model/version and audit information.

### Discussion
Conversation associated with a topic. May support source-specific subcontexts.

### Contribution
Human or agent-authored item. Must encode author type and provenance. Replies form a conversation tree or chosen alternative.

### Vote/Reaction
User feedback used for ranking/reputation. Design against brigading and bot manipulation.

### Report/ModerationAction
Audit trail for abuse reports and moderation decisions.

### AIInvocation
Tracks private/public invocation metadata, cost attribution, provider, user consent/publication choice, and caching as appropriate. Avoid storing private prompts/content unnecessarily.

## Important invariants
- AI-authored content can never be represented as human-authored.
- A contribution cannot become public without the appropriate actor/owner authorization.
- Topic clustering decisions must be traceable to algorithm/model versions.
- Topic merge/split must preserve discussion integrity and auditability.
- URL tracking parameters should not create duplicate sources.
- Deleting/account/privacy workflows must be designed before public beta.
