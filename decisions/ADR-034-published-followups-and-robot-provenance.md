# ADR-034: Published follow-ups and immutable robot contributions

Date: 2026-10-03
Status: owner-approved local prototype scope; implemented and locally verified

## Decision

The owner approved the following discussion sequence:

1. **Get insights** creates one private, short opening-post candidate for the
   currently displayed public page. A generated robot contribution may be
   shared unchanged or discarded, not edited. Human-authored text belongs in
   the ordinary human composer, not under a robot identity.
2. Follow-up research begins only from a published conversation. The user
   first publishes their question as a human reply to a shared robot post.
   **Get insights** on that own reply deliberately sends the bounded current
   page extract (at most 4,096 characters), the selected robot parent text
   (at most 2,000 characters), that human question (at most 2,000 characters),
   and already selected related-page titles/URLs to ChatGPT via the local
   service. It sends no other comments, cookies, page contents of related
   links or provider conversation history. A response is private until the
   user separately shares it unchanged as a robot reply in that subthread.
   Discard makes no post. Existing request quota, timeout, no automatic retry,
   `store:false`, citation and source safety boundaries remain.
3. A contributor may later withdraw their own human posts and robot posts
   shared through their identity. A withdrawn contribution loses its text and
   is represented as **Deleted by user** while visible descendants still need
   its place in the thread. If the root and every descendant are withdrawn,
   the whole thread is omitted from the discussion projection. Withdraw does
   not delete another person's visible reply. In this local prototype,
   identity is still a synthetic actor, not a real account.
4. Human and robot authorship remain visibly distinct (human/robot icons and
   accessible labels). Primary actions need not say “AI”; the origin of a
   robot contribution must nevertheless remain understandable. Previously
   saved manually imported or historically edited robot roots remain readable;
   no provenance is invented retroactively.

## Trust and retention boundary

The service, not page content or the popup, revalidates the selected Topic,
thread, published question, operator and catalog revision before provider
egress or robot reply creation. Only the completed result of an actor-bound,
short-lived insight operation can create a `generated` robot post. The service
checks its exact citation-formatted body, Topic, source and reply target, then
consumes the operation after a successful write. A direct `share-insight`
command carrying arbitrary text is rejected. The provider request is user-triggered and
stateless; do not use a retained provider conversation ID. Source text and
provider responses are not archived by this workflow except when the user
explicitly shares a contribution. The displayed robot text must match the
completed generated result; an edited body cannot silently retain robot
attribution. Tombstone filtering is a read projection, not a recursive
deletion or a right to erase other contributors' content.

## Evidence and unresolved work

The [OpenAI conversation-state guide](https://developers.openai.com/api/docs/guides/conversation-state)
documents `store:false` and manually supplied context. Exact file-level
tests, security review and implementation caveats are tracked in
`plans/STATUS.md`. The 2026-10-03 synthetic root/question/follow-up flow,
replay and forgery tests pass in both local-service and extension suites.
The latest captured live insight trace had zero web-search calls; supplying
related titles/URLs is not proof that linked content was reached. This decision
does not approve automatic publication,
private-page processing, a remote service, real accounts, moderation powers,
new model/provider, paid retry or app/store submission.
