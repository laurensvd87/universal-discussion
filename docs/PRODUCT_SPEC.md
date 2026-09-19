# Product Specification v0

## Vision
Create a universal discussion layer for internet content. A person should be able to encounter an article, product page, video, post, paper or other supported content and discover the relevant conversation without depending on the publisher to host comments.

## Core abstraction
Do not equate a discussion with a URL.

1. A client observes content and its URL/metadata.
2. The platform canonicalizes and fingerprints the content.
3. The platform resolves it to a semantic Topic.
4. The Topic has a Discussion.
5. Multiple sources/URLs may map to the same Topic.
6. A source-specific subthread may exist where appropriate.

Example: Reuters, BBC and a company newsroom may publish separate pages about the same announcement. Users should be able to reach the shared discussion, while retaining source-specific context when useful.

## Target platforms
Eventually:
- Chrome/Chromium desktop browsers
- Firefox desktop
- Safari/macOS if feasible
- Android
- iOS

Do not require identical UX across platforms. The invariant is access to the same identity/topic/discussion network.

## First client
A desktop browser extension is the likely validation client because it can observe the page context and surface a discussion count with minimal user effort. This is a hypothesis, not a permanent product limitation.

## Key user experiences
### Discovery
While browsing, the user can see that discussion exists without first visiting a separate social network. Ideally show a compact count/status such as human comments, agent insights or topic activity.

### Discussion
Users can:
- read a topic discussion;
- distinguish human from AI contributions at a glance;
- reply;
- vote/react using a deliberately chosen reputation model;
- report content;
- sort/filter;
- view source-specific context;
- navigate related sources.

### AI filtering
At minimum support views equivalent to:
- All
- Humans only
- AI/agents
- Followed/selected agents (later)

### Early-adopter AI
A user may connect supported AI/API credentials. Their private agent can read the current content and discussion and provide immediate value even on an otherwise empty topic.

Possible functions:
- summary/context;
- source discovery;
- claim/source inspection;
- counterarguments;
- discussion summary;
- domain-specific assistants.

Private output remains private unless the user explicitly publishes it. Published AI output is permanently and conspicuously labeled as AI and records appropriate provenance.

## AI contribution philosophy
AI should solve empty-room utility, not fabricate a human community. Never make AI accounts look human. Avoid flooding new topics with generic generated text.

A useful initial state could distinguish:
- `0 human comments`
- `3 agent insights`

rather than pretending there are `3 comments` from a community.

## Semantic clustering
Clustering is considered a core adoption feature because otherwise discussion fragments across near-duplicate URLs.

The system should use a layered resolution pipeline, potentially including:
1. canonical URL normalization;
2. content fingerprint/hash;
3. metadata/title/entity matching;
4. embeddings + approximate nearest-neighbor retrieval;
5. higher-precision verification for ambiguous candidates;
6. confidence threshold and safe fallback to a separate topic;
7. later merge/split tooling.

Do not assume every similar page belongs to the same topic. Topic granularity is a major product/research problem.

## Network-effect strategy
The product must remain useful before a large human network exists. Candidate mechanisms:
- semantic clustering concentrates discussion;
- early adopters use their own AI compute;
- persistent useful AI contributions benefit later visitors;
- related-source aggregation;
- platform-generated/cached utility only where justified;
- activity/count indicators make existing discussion discoverable.

## Non-goals for initial validation
- Full social feed
- Creator monetization marketplace
- Ads business
- Every content type on day one
- Complex native mobile UI before core behavior is validated
- Owning large GPU infrastructure

## Initial product hypothesis
People will install/use a client if it reliably reveals useful discussion/context about what they are already consuming, and semantic topic aggregation makes the network feel denser than URL-by-URL comments.

## Metrics to define before beta
The product/agent team must propose exact definitions, but consider:
- extension install -> retained active user;
- pages where indicator is shown;
- indicator click-through rate;
- discussion read depth;
- human contribution rate;
- AI invocation rate;
- private AI -> explicit public contribution rate;
- topic clustering precision/merge error rate;
- reports/abuse rate;
- D1/D7/D30 retention;
- cost per active user and per newly processed content item.
