# ADR-028: Strict finalized-item fallback for a private insight draft

Status: approved by owner on 2026-10-02; implemented with offline synthetic
tests and independent Trust review. Live provider success is unverified.

## Context and decision

The owner deliberately clicked Create with model “5.5” and received
`response-final-item-missing`: one completed assistant `response.output_item.done`
was observed, but the terminal `response.completed.response.output` did not
repeat it. The normal official Responses streaming example repeats the item
there. Treating stream deltas or a search/tool result as an answer would be
unsafe; rejecting every such response prevents a potentially usable private
answer. The owner separately approved a narrow exception for an editable
private draft, not automatic sharing or a claim of general provider support.

After a complete, bounded SSE stream with exactly one `response.created` and
one terminal `response.completed/status=completed`, the local service may use
exactly one completed assistant `response.output_item.done` absent from final
output only when response ID, item ID, output/content indices and finalized
`response.output_text.done` text agree. Any observed `output_item.added` or
`content_part.done` for that slot must agree too. Conflicting final output,
duplicate assistant item, failed/incomplete item or response, refusal, unsafe
text, malformed event, and incomplete stream remain rejected. Existing output
length, citation URL and text validations still apply. The candidate is never
treated as shared: the existing private editable draft, Preview and explicit
Share gates remain. No retry or second provider request is added.

This accepts text omitted from the provider's terminal output, so it is an
explicitly approved compatibility exception, not proof that the provider
intended final publication. Synthetic positive/negative tests and a separate
Trust review cover contradictions; the owner must test one deliberate public
page insight to establish whether their live response now yields a draft.
Never request raw provider output, page content, authorization URLs or tokens.
