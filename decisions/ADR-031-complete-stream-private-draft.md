# ADR-031: Complete-stream fallback for a private insight draft

Status: explicitly approved by the owner on 2026-10-03; implemented and
offline/adversarially verified, including independent Trust review. At the
owner's stated 19:41 Berlin reset time, one synthetic-public live probe
returned a private result (1,354 characters, one citation) through the strict
parser. The actual popup/real-page owner journey remains unverified. This
extends ADR-028 only for private drafts.

## Evidence and decision

An agent-run, owner-authorized synthetic-public GPT-5.5 request produced a
bounded Responses SSE stream with eight `response.output_item.done` elements:
seven reasoning/search elements and one completed assistant message at index
7. The terminal `response.completed` had `status=completed` but `output: []`.
The local parser correctly reported `response-item-prefix` under ADR-028,
because its terminal-prefix requirement could not be satisfied. The owner
explicitly approved accepting this *wholly absent terminal output* pattern
only as a private editable insight draft.

The fallback may reconstruct a candidate answer solely from complete
`response.output_item.done` elements, not deltas, when the stream has exactly
one valid `response.created` and terminal `response.completed` for the same
response ID, status `completed`, and an empty terminal output. Observed items
must form one contiguous, unique index sequence from zero through the sole
completed assistant message; each `output_item.added`, `output_text.done` and
`content_part.done` that is present must agree with the corresponding complete
item. In the empty-terminal branch, an added assistant message must start
with empty content; pre-filled, potentially contradictory answer content is
rejected. The observed reasoning items have no `status` property in either their
added or done event; this omission is allowed only for reasoning items, while
search calls and the assistant message must be completed in their done event.
Opaque `reasoning.encrypted_content` is not answer text and can differ between
added and done events; it must not be treated as a preliminary text claim.
Answer content, visible summaries and search actions remain checked for
contradictions.
The existing response, item, refusal, text, citation, size and unsafe
content checks remain. Failed/incomplete events, contradictory IDs, types,
statuses or text, duplicate assistant messages and sparse/extra items are
rejected. A nonempty contradictory terminal output is not overridden.

The resulting text enters only the existing private draft/edit/preview path.
There is no automatic Share, retry, additional provider call or authorization
for public posting. This is an owner-approved compatibility exception to the
normal documented Responses sequence, which repeats output in the terminal
event; it is not a general claim about provider behavior. Negative tests,
independent trust review and one owner-authorized synthetic-public live probe
must precede a success claim.
