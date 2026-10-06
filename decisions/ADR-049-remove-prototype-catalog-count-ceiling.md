# ADR-049: Remove the prototype catalog count ceiling

Date: 2026-10-06
Status: owner-directed local PoC correction; scalable storage migration remains open

## Context and decision

The owner asked why new pages no longer found Topics. Read-only inspection of
the local SQLite database at revision 377 found exactly 100 Sources and 100
Topics, with the document only 862,696 bytes. A fixed prototype count ceiling,
not exhausted disk or lost discussions, rejected new ingestions. The owner
explicitly rejected an arbitrary page/Topic count limit.

Remove the hard Source/Topic count checks. Keep atomic rejection at the
existing 8 MiB snapshot boundary, 1 MiB catalog response boundary and a
cooperatively checked 10-second planner-work guard. None of these may silently
evict Sources, Topics, roots or replies. A failed new ingestion
must leave the old catalog readable and the database revision unchanged.
The extension must distinguish this capacity failure from a generic connection
failure. No permission, provider transfer, matching threshold, embedding
model, or retention rule changes with this correction.

## Limits of this correction

This is **not** unlimited-scale architecture. The current service rewrites one
JSON snapshot and globally replans provisional Topics on each ingestion. It
also returns a whole catalog, with a 1 MiB response ceiling. The byte and CPU
guards can still stop growth. They are operational safety boundaries, not a
product promise of a fixed number of pages.

True continued growth needs a separate reviewed design: normalized/indexed
SQLite rows, bounded candidate retrieval and incremental local regrouping,
paginated/delta catalog reads, and a rehearsed migration that preserves all
existing Source anchors, Topic/discussion identities and reply trees. Do not
migrate the owner's database, erase old data or weaken the guard as a shortcut.
That architecture/migration remains a separate owner and trust review gate.
