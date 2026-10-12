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

## 2026-10-12 refinement: all styles must be distinguishable

The owner clarifies that Funny/Sarcastic were examples, not the only styles that
should be expressive. Strengthen the remaining nine non-Standard overlays with
concrete observable behaviours and short explicitly fictional style-only examples,
not generic personality adjectives. Keep Funny/Sarcastic's already stronger
guidance and Standard's four prompts/full provider packets byte-identical.
Every complete style suffix remains under 700 characters. No rigid catchphrase,
persona announcement, longer answer, invented facts or mandatory disagreement.

Challenger tests an assumption with a fair counterargument; Skeptic separates
evidence from inference; Realist makes constraints/consequences concrete;
Pragmatist offers a grounded next step. Clever reframes a supported implication;
Explainer makes a mechanism plain; Optimist identifies a credible opportunity;
Mediator locates agreement and the actual disagreement without false balance;
Curious explores a relevant unresolved implication without compulsory questions.
Each remains a useful forum contribution, not a performance replacing the task.

The OpenAI Docs skill guided concrete tone instructions/examples using
[official prompt-engineering guidance](https://developers.openai.com/api/docs/guides/prompt-engineering).
Prompt separation, factual/source/citation/privacy/brevity rules, fixed enums,
private payload reuse and current-page/account/target proof are unchanged.
Existing posts are not rewritten. This is backend-only; extension remains 0.13.59.
Independent offline checks/restart evidence are recorded at the top of STATUS.
The two earlier live checks covered only Funny/Sarcastic and consumed their grant;
no new provider inference or live-quality claim follows for the other voices.

## 2026-10-12 refinement: selected voice owns delivery

The owner rejects a shared neutral/critical tone for selected voices and
clarifies that Funny need not sound sober: silly, exaggerated or absurd expression
is welcome. The observed public Sarcastic dispatch fingerprint matched the exact
intended instructions, but the owner's reported answer lacked recognizable irony.
This is a style-quality failure, not evidence of missing voice transport; why
that model under-delivered is not established.

Standard retains all four historical instruction hashes and request bytes.
Non-Standard prompts no longer inherit the opening “thoughtful forum contributor”
identity or a subordinate style suffix. They begin with one server-owned selected
voice block, followed by the unchanged complete format/task/language/evidence/
research/citation core. No common instruction prescribes neutral, critical or
sober delivery. Being useful, accurate about literal claims and clear about
evidence does not require an analytical tone.

Recognizable fictional comic imagery, exaggeration and irony are allowed as
expression, not evidence, without a mandatory disclaimer on every joke. Real
facts, prices, quotations and sources must still not be invented. Funny can
carry the useful point in a comic voice throughout; Sarcastic must actually use
irony rather than mere neutral criticism, without manufacturing contradictions,
forcing negativity or mocking people/harm. Other nine voice signatures remain.
No recycled catchphrase, extra length, forced closing question or changed tool
authority follows. Fixed voice blocks are bounded at 1,050 characters; the
largest is 1,026, with no duplicated task/evidence text. This replaces the earlier
700-character suffix/layout constraint, not provider-context limits.

The OpenAI Docs skill informed the explicit separation of identity, task rules,
examples and untrusted context using [official prompt-engineering guidance](https://developers.openai.com/api/docs/guides/prompt-engineering).
Independent checks compare the shared core in all 44 non-Standard combinations,
retain Standard hashes/full packets and test opening/reply/private serialization,
source/tool/citation limits and trace identity. Actual model-style compliance
remains a live quality question; offline tests do not prove better generated text.
No new provider inference, output archive, schema, UI, permission or historical
rewrite. Backend-only idle activation is complete after the owner confirmed
crawler completion; health and protected login restore, canonical/private counts
stay exact. No new provider inference was made. Do not interrupt running work
for activation. Final tests/activation state live in STATUS.

## 2026-10-12 refinement: contribution goals, not decorated summaries

The owner reports that Funny still produces analysis with an added joke and
explicitly changes the desired task: Standard should summarize; other selections
should produce their own kind of post. This supersedes the two historical
Standard-opening hash pins and the shared synthesis/analysis task, not any source
or tool authority. Both Standard reply prompts retain their original exact hashes.

Standard openings now summarize the current page's main point, with directly
relevant proven outside information only when available under the existing rules.
The other eleven openings produce a standalone contribution: a joke, ironic take,
unusual connection, fair counterargument, warranted doubt, practical tip, simple
explanation, hopeful angle, candid tradeoff, common-ground perspective or genuine
question. A joke or connection can be the whole post; no obligatory summary,
evidence audit, explanation of significance or analytical conclusion. One-liners
are welcome, with no word-count minimum, ordinarily up to sixty words and the
existing hard prompt maximum of 120. This is a writing instruction, not a changed
transport-size validator or guarantee of live output quality.

For all nonstandard modes, comparison and judgment rules are conditional on the
actual claim/request, rather than forcing a technical tradeoff or strongest
cross-source difference into every creative contribution. Replies still answer
the selected message through the voice; a real question cannot be replaced with
a joke. Existing selected-message/opener context, private suppression, required
shopping research and citation proof remain authoritative. Recognizable fiction
and hyperbole are expression, not invented real facts/quotes/prices/sources.

Independent review hash-pins seven unchanged language/evidence/date/research/
citation spans across all 48 combinations and checks nine literal factual and
provenance protections. Serialized packets retain every field except instructions
and the already-existing voice preference. OpenAI Docs guidance informed defining
the actual task rather than applying tone over a conflicting summary task; see
[official prompt engineering](https://developers.openai.com/api/docs/guides/prompt-engineering).
No automatic/background generation or new publication behaviour: deliberate
sparkle requests keep their existing one-shot local sharing checks. No new model,
tools, retention, provider call or app permission. Existing posts stay unchanged.
Tests and safe activation status are recorded at the top of STATUS/HANDOFF.
