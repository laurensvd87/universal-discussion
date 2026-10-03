# ADR-030: Owner opt-in raw insight debug dump

Status: owner approved during local development on 2026-10-03. This does not
authorize publication, telemetry, remote logging, or continuous production
capture.

## Context

The owner received `response-item-prefix` after repeated insight attempts and
asked the agent to inspect diagnostics directly, including raw ChatGPT and page
data, instead of requesting pasted terminal logs. The prior structural trace
went only to an inaccessible older backend terminal and was insufficient to
distinguish every prefix branch. The owner also explicitly allowed the agent
to use the existing local pairing and ChatGPT OAuth connection for debugging.

## Decision

Add an explicitly selected local debug mode for insight requests. It writes
the exact request envelope sent to ChatGPT (including the bounded page prefix
and selected context links) and the bounded raw Responses body/status/media
type to a known per-user temporary `.log` file, alongside a separate
content-free structural trace. Never capture Authorization, refresh/pairing
tokens, callback URLs, cookies, full browser page, model-account identity or
unrelated browser traffic. The debug sink is off by default; no extra provider
request, retry, automatic publication, network sink or store permission is
added. The file must be size/count bounded and local. It may contain sensitive
page or provider output, so it must not be committed or shared, and should be
deleted after diagnosis. The agent may run one deliberate synthetic/public
insight test using the owner's already-connected account, within the existing
request limits. Any broader or paid use remains a separate owner gate.

The local CLI opt-in is `--debug-insight-raw`. It records at most three
request exchanges and 1 MiB in the user temp directory. Only in this mode is
the separate allowlisted structure trace also saved to a bounded temp `.log`;
normally ADR-029's trace remains terminal-only. Raw files contain only the
insight request envelope and the bounded successful Responses body/status/
media type, not authentication headers. An early transport or non-SSE failure
may leave a request-only entry. The Windows user-temp ACL on this owner's
current machine was checked and has no broad Everyone/Users allow entry;
general Windows ACL enforcement remains unverified and is a release gap.

The debug mode is for the local owner-only prototype and must not be enabled
by default in a distributable build. The cause of the live failure and the
correct parser change must be established from actual diagnostics before
loosening acceptance.

## Live diagnostic finding

The agent ran one owner-authorized synthetic-public GPT-5.5 research request
using the protected saved login. It reproduced `response-item-prefix`: the
bounded stream contained seven completed reasoning/search items and one
completed assistant message at index 7, while the terminal
`response.completed` reported `status=completed` and `output: []`. The
structural trace recorded `fallbackBranch=length`. This is evidence of a
provider-envelope mismatch, not evidence that the answer is safe to import.
ADR-028 required the terminal prefix to agree with observed item identities.
The owner subsequently approved the narrow private-draft exception in ADR-031;
that change remains subject to its own tests and trust review.
