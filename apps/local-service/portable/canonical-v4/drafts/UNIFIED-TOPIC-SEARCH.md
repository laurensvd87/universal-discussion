# Global public topic search

Explicit, unregistered hierarchy18 composition. One Search Topics query combines
installed fixed topics, current learned/page scopes and saved public canonical
conversations that have no fixed or authored scope. No current page, embedding,
Source catalog read, model call or per-user preparation is involved. Specific
saved discussions remain explicit search targets under broad owner defaults.

Fixed labels come from the existing public taxonomy. A legacy title is the public
canonical Topic title of an actual visible public root. It is not inferred from
today's Source or retrospectively claimed as that root's authored topic. Legacy
routes retain the exact original canonical Topic/discussion, even if that root
later acquires a derived assignment. Fixed/named/page routes remain unchanged.
The explicit search refuses an installed topology above512 nodes or with reserved
subject-/page-/legacy- namespaces; it never guesses between colliding routes.

Public root events are independent append-only rows. Background maintenance in
the existing coordinator handles at most8 events/turn and8 fixed ancestors/root.
Per-root activity rows and one indexed directory row per scope prevent a popular
conversation's many roots from filling a page with duplicates. GIN title lookup
and ordered directory indexes serve search/browse; current visibility, canonical
destination, title and classification are checked before a saved card is returned.
Static root activity has an exact cascading original-edge FK. Withdrawing a root
or erasing a Source cannot leave its deleted derived witness in the directory.
Caption changes enqueue one scope repair. Existing public roots are seeded once
at installation, without scanning the crawled Sources. No foreground writer takes
the worker clock or updates a shared hot-topic row.

Search uses one keyset order across all four kinds: human activity, latest root
ordinal, kind, ID. Cursor binding includes normalized terms, generation, page size
and the unified schema, preventing accidental reuse of a named-only cursor.
Legacy root/thread/target reads preserve normal public DTO and reply checks; the
membership extension admits only the original canonical destination. Existing
body revisions, receipts, stale-target guards and AI proof boundaries remain.

`unifiedTopicSearch:true` explicitly selects the new read composition.
`topicSearch` adds the execute-only maintenance port to the existing automatic
coordinator. Neither option is enabled by ordinary startup. This component does
not implement combined fixed/learned authored scope, complete18 schema/recovery or
the final UI/cutover. Its native cases and guarded tests are pending execution.
No representative quality, browser/provider, many-user or live speed claim follows
from invented native fixture titles/coordinates.
