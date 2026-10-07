# ADR-056: Web citation display metadata is not citation authority

Date: 2026-10-07
Status: implemented locally; owner-browser verification open

## Context and decision

The owner reported `response-web-citation` on a deliberate Insight. The code
used to reject a `url_citation` when its provider-supplied **title** was absent,
empty, too long or contained unsafe display characters, even if the cited URL
was one of the exact selected sources and the annotation span was valid.
Official Responses web-search annotations carry URL, title and text offsets;
the title is display metadata, not the source identity. For an exact selected
URL with a valid span, use the locally validated selected Source title when
the provider title is unusable. Keep the exact request-scoped URL allowlist,
public-HTTPS URL validation, completed-search requirement, span validation,
unsafe-link rejection, private draft and explicit Share rules unchanged.

The former `response-web-citation` detail grouped several failures. A
content-free `INSIGHT_TRACE` v2 now classifies rejection as `invalid-url`,
`current-source-url`, `unselected-url` or `invalid-span`. The trace contains
no URL, page/provider text, title, account, token or ID. Normal mode prints
the trace in the local service terminal only; the owner's separately
approved debug mode may persist bounded traces under the OS temp directory.

## Limits and verification

The reported real-world failure was not captured with raw or structural
diagnostics. The title bug is reproduced synthetically and fixed, but this
does **not** prove it caused the owner's particular error. A provider citation
to the current article URL, a redirect/canonical variant, or any other URL
outside the exact five candidates still fails. Relaxing that boundary needs
separate evidence and a trust decision; it is not silently inferred from the
error code. No extra provider request, automatic retry, source fetch, new
browser permission, account action or publication follows.

The local-service suite passed 255 tests with four optional skips; fixed-port
integration passed 2/2 after the already running service was temporarily
stopped, and the secret scan found zero findings. An independent read-only
trust review found no blocker. A one-shot public-page live probe could not
start because the protected ChatGPT connection reported the plan unavailable;
**zero** Responses requests were sent. The service was restarted with the
same extension Origin, pairing and SQLite state.

Official contracts:
https://developers.openai.com/api/docs/guides/tools-web-search and
https://developers.openai.com/api/reference/resources/responses/streaming-events.
