# ADR-119: Flat replies and deliberate AI mentions

Date: 2026-10-15
Status: Implemented and verified; client 0.13.68 requires extension reload.

## Decision

The owner requests one horizontal inset for all descendants of a discussion
root. Keep canonical root/replyTo IDs, nested branch disclosure, twenty-sibling
presentation pages, original destinations, deleted connectors, editor focus and
created-post reveal. Remove additional descendant margin, padding and borders.
Show each exact parent as `@Username:`; generated parents use `@AI:` with their
existing operator/provenance description retained for accessibility.

Submitting a public root or reply containing a standalone case-insensitive
`@AI` is one deliberate request to the sender's selected model. First publish
the human message normally. After confirmed acceptance, require the same actor,
Source, Topic, generation and document resolution and resolve the accepted ID
back to the current visible canonical human message with the exact sent body.
The existing Insight controller then renews native/account/page/target checks,
uses the bounded published message/opener/current-page context, and publishes
its completed exact answer through the existing one-shot generated-reply path.
The created-post cue selects the candidate ID; it supplies no independent
provider or write authority. No unsent draft is sent to the model.

No invocation follows a failed/uncertain write, edit, changed context, polling,
old accepted cue, resumed result, quoted/code/link example or email address.
Only `@AI` invokes the model; future `@ai_shopper` handles remain inert. Missing
model/configuration or failure leaves the human message saved and offers the
existing explicit sparkle action. There is no automatic inference retry.
Private composers retain their existing separate behavior.

New human username selection and rename reject exact `AI`, prefixes `AI_` and
`_AI`, case-insensitively. Existing account names and saved records are not
rewritten. Human replies retain exact parent IDs for future notification work;
notification delivery and specialist bots are not activated here.

## Verification

Extension restricted suite: 1,573/1,573. Panel/parser checks cover root and nested
mention submission, accepted body/author identity, changed context, failed and
duplicate sends, model absence, failure guidance and quoted examples. A composed
test uses the real discussion and Insight controllers with a synthetic model
and proves human persistence followed by exactly one generated reply for a root
and a nested reply, with no replay on reopening.

Isolated packaged Chromium verifies seven reply depths share identical left and
right bounds at 320/390/480px, exact parent cues, no overflow and no uncaught
errors. Username validation covers first naming/rename/case folds, ordinary
interior `ai` names, and unchanged historical account readability. No live
provider call or test post in the owner's database was made.

## Related-page diagnostic

Read-only owner-data inspection of the two requested Kapsalon pages finds both
present. Original-E5 cosine is 0.895147813926918, above Related's 0.88 floor.
Actual exhaustive results rank the video first from the recipe and the recipe
second from the video. They have no shared canonical Topic: Ridge pair cosine
0.8183460097697829 is below 0.8639003810829322, and neither page crosses the
other's fixed reference threshold. The recipe's primary discussion has no posts;
the video's has two. Related discussions show existing posts; related-page
suggestions currently appear only in an empty feed. No thresholds, embeddings,
memberships or historical assignments were changed for this diagnosis.
