# ADR-038: Bounded owner-authorized live Insight QA

Status: accepted by the owner, 2026-10-04.

The owner authorized agent-run live quality checks of the already connected
ChatGPT insight path, now and after relevant Insight changes, to avoid requiring
manual owner clicks for every validation. Each relevant change may use at most
two deliberate live Responses requests. The agent selects only public,
signed-out pages; at most 4,096 characters of current-page visible article text
and four related public-page titles/URLs may be sent. No cookies, credentials,
authenticated/private page content, automatic retry or automatic Share is
authorized. Stop on a usage limit or authorization failure. Record the test
scope, non-sensitive outcome and quality findings; never log account tokens,
request headers or private material. Account plan/credit settings remain the
owner's control, not a guarantee enforced by this app.

This is a QA authorization, not approval for background AI calls, automatic
posting, remote hosting, private-page processing, paid fallback, or publication.
It does not broaden ADR-024/025's product behavior. The app's local catalog may
contain previously captured non-public/account destinations; such entries must
not be selected for live provider tests. Curated public-only context remains
separate until catalog hygiene is resolved.

Use the account's listed model and the public Responses API with `store:false`
and a completed stream, consistent with [OpenAI's ChatGPT-plan usage guidance](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference).

First execution, 2026-10-04: the fixed public MDN HTTP Overview probe used
4,096 characters from a signed-out HTML main-region approximation and one
related MDN title/URL. The listed GPT-5.5 model returned one completed private
opening post after exactly one Responses request: 76 words, a specific HTTP
debugging observation and a relevant question. It had no external citation;
the related link was candidate context, not evidence. This demonstrates the
backend prompt/stream path on a real public article, not the extension's
rendered-document reader, popup recovery, follow-up, or cited cross-page
research. The first attempted probe was rejected locally before any Responses
dispatch because an HTTP `Messages` guide path was correctly denied by the
app's sensitive-path policy; its fixture was replaced and regression-tested.
The bounded answer was inspected in the private terminal output; the harness
did not persist it to a file, SQLite or a discussion, and no raw debug log was
enabled. The regular local service was restarted after the isolated probe.
