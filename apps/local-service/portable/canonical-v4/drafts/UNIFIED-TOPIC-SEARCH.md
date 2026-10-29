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
the final UI/cutover. Guarded tests pass665 and controller tests70. The first owned
SQL run passes the first six new cases, then fails an assertion in the role/index
case. The exact assertion detail is not retained. All2627 pins authenticate,
the created scratch database drops, exact smart-stop/empty Job/closed handles
succeed, stderr is empty and emergency false; the second database is not reached.
Source review identifies a planner-dependent GIN-only assertion on a tiny table.
The corrected fixture requires a normal indexed plan and separately proves GIN
eligibility with only the new directory's competing indexes removed inside a
rollback, then verifies their restoration. This is index availability evidence,
not a normal production query latency measurement. Production SQL/read/worker
code and original resource limits are unchanged. Updated execution is pending;
the consumed first source/catalog/output remain immutable and are not adopted.
The next run passes the index case, including isolated GIN and the covering feed
probe, plus posting/search during a held worker clock. It then refuses the fixture's
limit100 in the withdrawal read: the real public facade's unchanged maximum is50.
A guarded causal test exercises that real facade and proves refusal before SQL.
The fixture now requests50 while retaining the immediate withdrawal assertion.
Again all2627 pins and normal owned cleanup pass; the created scratch database
drops, the second is not reached, stderr is empty and emergency false. Production
code and limits remain unchanged.

The corrected owned run passes all160 mandatory reports, including all ten new
global-search cases. Guarded Node tests pass667 and pure controller tests70. Both
scratch databases drop, exact smart-stop succeeds, the Job is empty, all handles
close, stderr is empty, emergency is false and all2627 execution pins authenticate.
The same public HTTP contract opens and replies to original canonical threads;
page size2 and50 produce the same complete ordered directory without duplicate
scopes. Actual Source erasure preserves expressly public names/original threads
while the exact derived-edge foreign keys remove withdrawn activity witnesses.

Production is unchanged from `ebb79376`; corrected fixture source is `c3d9f29f`,
catalog commit `40f0b15b`, execution map
`e50564a3258e53e9e08600fa6e43d1786465c634aad9b4fb7cd33554172e4525`.
Run `run-78dcba6a5575674591737f27ce5e2a185107d281d16e8fcd` has result SHA256
`06d971fe33e4e21dbfb1679ca533b04929b869a940d2025cb200681cae2cdcc5` and stdout
SHA256 `b899def685738abb559b02e6de98dbc0c7611222a142c1fbd22b5fd6957bee16`.
Root audit is retained locally as `unified-topic-search-native-root-audit-20261029.json`.
The earlier failed runs remain unadopted. This component now has actual SQL proof;
combined fixed/learned authored scope, complete18 install/startup/recovery and
representative quality/UI/latency/load/cutover are still required before activation.
No representative quality, browser/provider, many-user or live speed claim follows
from invented native fixture titles/coordinates.
