# ADR-029: Ephemeral, content-free insight structure trace

Status: owner requested meaningful research logs on 2026-10-03; local
structure-only diagnostic implemented and independently reviewed. Raw
response logging is **not** approved by this decision.

## Context

Repeated live Create attempts returned fixed error codes, including
`response-final-item-missing`. Those codes prevent exposing provider/page
content but do not show which typed streaming events and item relationships
the service actually received. Guessing from one code has cost owner time and
potential ChatGPT usage.

## Decision and limits

When an explicitly clicked research request reaches bounded SSE parsing, the
local service prints one `INSIGHT_TRACE` line in its interactive terminal.
Earlier HTTP, media-type, body or timeout failures retain their existing fixed
codes and do not produce a trace. The adapter must build a
small fixed-schema summary of recognized event kinds, bounded counts/order,
item type/status/index and identity-equality checks, terminal shape, and the
local parse outcome. Map arbitrary provider strings to fixed enums. Never
copy raw SSE, answer/delta text, page text, URLs, provider IDs, account data,
tokens, raw headers, token counts or exception messages into the trace.
The callback must not influence acceptance, retries or sharing. No log file,
SQLite record, HTTP diagnostics expansion, network sink or automatic provider
request is introduced. The line survives only as long as the operator's
terminal or its own scrollback/history settings retain it; the operator should
review it before sharing. Existing fixed codes remain the user-facing result.

Tests must inject synthetic secrets/IDs and prove they are absent from the
trace, including on error and callback failure. A separate explicit privacy
decision is required for raw provider-response capture or persistent logs.

Verification: service offline suite 173 passed, 2 opt-in Windows tests
skipped; extension restricted 838/838. Independent read-only Trust review
found no raw-data escape or callback-result coupling. Live provider shape has
not yet been observed with this trace.
