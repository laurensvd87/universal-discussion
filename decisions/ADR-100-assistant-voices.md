# ADR-100: Compact assistant voices

- Date: 2026-10-12
- Status: owner-requested, implemented and offline-reviewed; local activation only
- Related: ADR-075, ADR-077, ADR-078, ADR-086, ADR-096

## Decision

The owner requests about a dozen text personalities and an easy-to-switch,
space-efficient selector directly in chat, not Settings. This means writing
style, not audio, separate models, autonomous bots or impersonation.

Provide twelve fixed IDs: Standard, Challenger, Funny, Clever, Sarcastic,
Skeptic, Pragmatist, Explainer, Optimist, Realist, Mediator and Curious. Standard
preserves the existing contributor prompt byte-for-byte. Other IDs choose a
short static high-level tone paragraph; arbitrary custom instructions are not
accepted. The shared strict enum is presentation data; backend prompt text stays
server-owned. The optional `preferences.voice` uses existing local preference
storage and deliberate request transport. Standard is omitted for compatibility.
No new browser permission, provider request on selection or account/profile data.

The small native dropdown sits beside Start a new thread and remains reachable
when the same composer moves beneath a reply. Private chats have a synchronized
composer dropdown. English labels live in language packs. Do not rebuild the
editor/options on routine updates or lose typing, selection, focus or IME input.
Public inbox previews expose no generation controls. Edit mode hides the voice.

## Boundaries

Tone never overrides factual accuracy, proportionate uncertainty, privacy,
brevity, current-page/Topic/account/target checks, research-off, opening-source
restrictions, reply discovery, citation proof or exact one-shot sharing. Humorous
styles must avoid trivializing harm; Challenger/Skeptic must not manufacture
disagreement or false balance; Sarcastic critiques ideas, not vulnerable people.
No forced catchphrase, question, heading or sign-off. These are prompt constraints,
not guarantees of live model quality.

Selection applies to a new deliberate generation or the existing accepted
private follow-up. Clicked settings are snapshotted; changing style cannot retarget
or regenerate an in-flight request, rewrite a prior post or change an uncertain
send's exact idempotent payload. Private context/debug suppression and all existing
page/provider bounds remain. No new retained post field or database schema.

This follows the static tone/task separation described in the
[official OpenAI prompting guidance](https://developers.openai.com/api/docs/guides/prompting).
The OpenAI Docs skill guided that separation; the repository's existing tool and
data authority remains authoritative. No model migration or live provider QA.

## Verification and activation

Independent tests hash all four pre-change Standard prompts and compare full
provider packets; malformed strings/getters/prototypes reject before dispatch.
All voices retain the complete base evidence/research/citation instructions.
Mocked opening/reply/private requests prove bounded context and unchanged tool
scope/debug suppression. Controller hydration/click races and failed private
send reuse preserve the selected voice without extra requests.

Actual isolated Chrome verifies twelve options, public/private synchronization,
no generation on selection, narrow layouts and unchanged private replies.
Root refines the first layout after screenshot review: a composer-header dropdown
keeps the model readable at 320px and leaves the voice available in inline replies.
Final suite/activation evidence is recorded in STATUS/HANDOFF.

The owner permits normal local-service restarts as needed; check for idle work
and preserve data/pairing/protected provider sign-in. This does not authorize
interrupting active requests, new listeners, provider inference, deployment,
spending, mail or public/store release. App sessions may need renewal on restart.
