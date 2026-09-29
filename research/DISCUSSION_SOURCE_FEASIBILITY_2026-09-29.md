# Independent discussion sources: feasibility checkpoint

Date: 2026-09-29. **Research, not an adopted product integration.**
Implementation remains owner-local 0.11.0. This investigates the owner's request
for broad public first-use value without reliance on a few large platforms or
many bespoke website adapters. AI supply is still an unselected idea.

## Latest owner clarification: comments must be readable inside the extension

After the probe, the owner rejects onboarding many specialized sources as the
product's answer and requires seeing the actual comments inside the extension,
not merely opening links to other forums. This materially raises the acceptance
bar: a title/link discovery feed alone is insufficient. The completed test is
technical evidence, not validation of the requested first-user experience.

One parser avoids separate format implementations, but not source selection,
content rights, complete reply retrieval, updates/deletions or moderation. Do not
recommend a growing specialist-forum feed collection as the next product build.
Direct in-extension reading would need an allowed comments API/feed or official
embedding mechanism. Publicly accessible posts and software licenses alone do
not authorize mirroring. No iframe restriction bypass or copied forum corpus.

A common discussion-network API is a better *candidate shape*, not a selected
provider: Lemmy explicitly supports alternative frontends through its API and
federates posts/comments between community servers. Its federation documentation
also warns that content/comments are not universally or completely present on
every server. The documented interoperability with Piefed/Mbin is federation,
not proof that all three share one client API. Breadth/relevance and permitted
display still require evidence; this is no proven global cold-start solution.
[Lemmy API/custom frontends](https://join-lemmy.org/docs/contributors/04-api.html),
[federation/comment limits](https://join-lemmy.org/docs/administration/federation_getting_started.html).

Any permitted external comments must retain source, author and thread/reply
identity in the UI, separate from native posts. Reading externally sourced
comments does not imply automatic cross-posting of our users' replies. The new
UX requirement does not approve a provider, remote fetch, cache, comment mirror,
account, expanded permissions or public release. The cold-start strategy remains
unresolved; source independence, broad existing supply and low integration effort
cannot currently be promised together.

## Verdict

A small RSS/Atom reader serving many source operators is technically plausible;
the approved probe successfully parsed three live public RSS feeds with one reader.
There are further feed advertisements across products, sport, travel, cars and
games. This does **not** establish useful discussions for arbitrary visited pages,
independent ownership of every source, permitted commercial indexing, or growth.
The owner subsequently approved testing a few public pages; the bounded transient
probe below is complete. Do not build
a general crawler, a full federation server or a large platform integration first.

The initial probe investigated finding relevant public conversations elsewhere,
then offering a separate native cross-site conversation. The owner's subsequent
inline-comments requirement above means outbound links alone do not meet the
desired experience. Neither links nor displayed external posts prove native
replies, retention or acquisition. Broad category support is compatible with a
small diagnostic test; the test is not a single-interest launch restriction.

## Documentation review and evidence limits

The lead and three bounded Sol research/review slices inspected primary standards,
platform documentation and public site pages. The lead checked key claims and
corrected an authenticated-feed example. In that initial review no feed XML was
fetched or parsed. No API search was executed or discussion corpus acquired. Public research
pages can themselves show posts; their bodies, authors and thread inventories
are not reproduced here. No owner browsing database or private data was inspected.

Advertised links are not live endpoint tests. Several observations rely on dated
documentation; a fetched/cached page is not continuous availability evidence.
No coverage, relevance, deletion, operator-independence or actual cost benchmark
was run. No permission to reuse user posts is inferred from open-source software.

## Candidate families

| Family | Useful property | Important limit | Recommendation |
| --- | --- | --- | --- |
| Public forum RSS/Atom | Common parser across different forum engines/operators | Recent bounded entries, inconsistent fields, operator-specific access/rights | First feasibility target |
| Lemmy community feeds | Common format across community servers and languages | Federation is incomplete; replicas are not independent original conversations | Possible supplement after source-specific review |
| Bluesky search | Published search schema includes URL, domain and language filters | Search-provider dependency; authentication/access and result completeness vary | Optional, not a foundation |
| Stack Exchange | Broad structured question/answer network | Many sites still one network; attribution, licenses, quotas and backoff apply | Optional, not independent breadth |
| Reddit | Potentially broad discussion discovery | API approval and commercial terms are not granted to this project | Not the starting dependency |

Sources: [Discourse feeds](https://meta.discourse.org/t/finding-discourse-rss-feeds/264134?tl=en),
[Lemmy feeds](https://join-lemmy.org/docs/contributors/04-api.html),
[Lemmy federation limits](https://join-lemmy.org/docs/administration/federation_getting_started.html),
[Bluesky search schema](https://github.com/bluesky-social/atproto/blob/main/lexicons/app/bsky/feed/searchPosts.json),
[Stack Exchange sites](https://stackexchange.com/sites),
[API obligations](https://stackoverflow.com/legal/api-terms-of-use),
[content licenses](https://stackoverflow.com/help/licensing),
[quotas/backoff](https://api.stackexchange.com/docs/throttle),
[Reddit policy](https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy),
[Reddit API terms](https://redditinc.com/policies/data-api-terms).

The [Lemmy instance directory](https://join-lemmy.org/instances) lists multiple
languages and subject categories, not proven useful coverage of ordinary browsing.
The [Discourse directory](https://discover.discourse.com/) includes hosted and
self-hosted communities; operators
[opt into that directory](https://blog.discourse.org/2024/06/discover-a-new-way-to-engage-with-discourse-communities/).
This is not permission for our ingestion. Directory activity counters must not
be treated as the activity of the communities they describe.

## Concrete shortlist, with evidence strength

| Candidate | Subject / language | What was actually observed |
| --- | --- | --- |
| [MacRumors](https://forums.macrumors.com/) | Products/technology / EN | Advertised public RSS parsed in the subsequent bounded probe |
| [Cyclingnews](https://forum.cyclingnews.com/) | Sport / EN | Public forum footer advertises RSS; XenForo identified |
| [Kretaforum](https://kretaforum.info/forum.php) | Travel/regional life / DE | Public categories advertise RSS; strict discovery returned no accepted URL, so no feed retrieved |
| [BMW-Treff](https://www.auto-treff.com/forum/) | Cars / DE | RSS link advertised, but page explicitly warns of guest/bot restrictions; skip any blocked access |
| [unknowns](https://unknowns.de/forum/) | Board games / DE | Advertised public RSS parsed in the subsequent bounded probe |
| [AVForums](https://www.avforums.com/threads/rss-feeds.1825740/) | Home entertainment/products / EN | 2013 documentation of category feeds, not current endpoint proof |
| [Tweakers](https://gathering.tweakers.net/forum/list_messages/2272776) | Products/technology / NL | 2024 RSS bug/fix thread documents a tokenless topic-feed path; current access untested |
| [FOK](https://forum.fok.nl/) | Broad categories / NL | Category breadth observed, but no feed established in this review |

All are product candidates, not approved providers or established independent owners.
Different domains, categories and syndicated copies must not inflate source
diversity. Corporate/operator mapping is a separate missing check. In particular,
the [Tweakers bookmark instructions](https://gathering.tweakers.net/forum/list_messages/1971626)
use a personal rssID and are **excluded** from anonymous public-feed evidence.
Do not collect tokens or enable subscribed/bookmark/private/inbox feeds.

## The missing connection: feed entry -> visited article

A forum entry's primary link normally identifies the conversation, not necessarily
an article discussed inside it. Titles may omit the article's subject; snippets
may be absent or contain the latest reply rather than useful opening context.
Do not assume portable reply counts, a complete thread, history/backfill or
deletion events. Recent activity is not necessarily a newly created discussion.
[RSS specification](https://www.rssboard.org/rss-specification),
[Atom specification](https://www.rfc-editor.org/rfc/rfc4287),
[Discourse ordering](https://meta.discourse.org/t/finding-discourse-rss-feeds/264134?tl=en),
[historical XenForo behavior](https://xenforo.com/community/threads/rss-new-reply-on-resource-discussion-new-resource-entry-on-rss.133169/).

One useful standard feature: RSS has an optional `comments` URL alongside the
item `link`. If a publisher supplies an article link plus a comment-page link,
that can provide a direct article-to-conversation destination without scraping
either body. Its prevalence is unknown. A comments URL alone does not prove
anyone has replied. The ordinary forum-item link remains a discussion destination
even without `comments`; it just does not identify an external article.

For a future approved design, keep two evidence paths distinct:

- Explicit article URL: a traceable reference from the source, not proof of the
  entire conversation's subject or a license to copy it.
- Title/permitted snippet similarity: a related-discussion candidate with weaker
  evidence, not an automatic same-Topic join or merge of native conversations.

The same model/dimension is insufficient to establish calibration between short
feed metadata and the extension's bounded rendered-article prefix. No feed
vectors were generated or inserted into the current Source/Topic database.
Do not compare them against current automatic-join thresholds without validation.
Cross-language usefulness is similarly unmeasured, even where source languages
are available. Never fetch a linked article just because it appears in a feed.

## Cost, concentration and safety

Illustration only: 500 feeds polled every 30 minutes means 24,000 requests/day.
At an assumed 50 kB per full response that is about 1.2 GB/day, before retries,
compression or conditional-response savings. This is not a provider quote or
measured workload. It excludes source onboarding, moderation, relevance checks,
vector computation, index storage, deletion handling and operations. Current
prototype caps are not changed to accommodate this hypothetical scale.

Measure dependence by useful distinct results and source operator, not feed count.
Re-run results after removing the largest contributor/operator. Many mirrors of
one conversation do not improve independence. Broad cheap metadata acquisition
could still produce mostly irrelevant links.

Public access, robots directives, an RSS link, and rights to retain/derive/display
content are different questions. Atom rights text is not an automated license.
Discourse Meta staff explicitly
[permit ordinary RSS use on Meta](https://meta.discourse.org/t/are-you-allowed-to-use-the-rss-feeds-on-discourse-meta/407094)
while distinguishing abusive extraction; that clarification cannot grant rights
for other forum operators or every commercial reuse. This is not legal/store
clearance. Owner approval does not override third-party restrictions.

A future network adapter needs approved sources and fields, request budgets,
attribution, retention/deletion and poisoning/quality controls. Treat feeds as
untrusted: bounded XML parsing without external entities, no remote enclosure or
HTML resource loading, no scripts, credential-free public HTTPS destinations,
and SSRF/redirect controls before any backend fetching. Authenticated/personal
feeds and unnecessary author/profile data are out of scope. A disappearing feed
entry is not a deletion signal. No shared browsing-history upload follows from
this research; sending live visited URLs to external search is a different gate.

## Owner-approved bounded experiment

Owner follow-up: "du kannst es mal testen mit ein paar seiten". This authorizes a
small read-only feasibility test, not product ingestion. It is **not** the
200–250-pair review or another owner rating assignment. Initial shortlist:
MacRumors, Cyclingnews, Kretaforum, unknowns and Discourse Meta. First inspect
each source's terms and advertised public feed; skip sources with incompatible
access terms, login requirements or blocking rather than bypassing them. An
advertised feed supports ordinary reading, not production reuse clearance.

Disclosed and enforced boundaries for this one-off research:

- At most one advertised public feed per named domain, at most two retrievals
  per feed and 1 MiB received per retrieval; no background schedule or crawling.
- No credentials, accounts, paid APIs, remote AI, new model download or embedding
  inference. No owner browsing history, visited-page queries or SQLite access.
- The feed response can contain post text and author information. Receive it
  transiently to inspect the format, but do not persist raw responses, names,
  profiles, snippets or a thread corpus. Inspect at most ten entries per feed.
- Record only aggregated field availability, feed-level provenance, parse/access
  failures, and whether explicit article/comment links can be distinguished.
  Do not follow entry links, media, enclosures or unapproved redirects.
- Ordinary requests expose the requesting system's network address to the
  source; no user browsing context is sent. No data is added to the app, and no
  extension permissions, backend listener or publication is activated.

This probe answers whether one parser can obtain useful linkage across selected
sources. It cannot establish broad hit rate, semantic accuracy, rights for a
production index, or growth. If it passes, propose a separate small coverage test
across languages/subjects and operator-removal evidence; do not silently scale
up or acquire the provenance-approved review corpus. If most entries only offer
ambiguous titles, report that rather than expanding into whole-site scraping.

Recommendation remains **test before selecting**. All privacy/security/provider,
architecture, spending, release and later human-review gates stay in force.

### Preflight decisions

- Cyclingnews is excluded before scripted retrieval: its operator's
  [UK terms](https://futureplc.com/terms-and-conditions-uk/) expressly restrict
  automated data access; the forum terms page also presented a bot challenge to
  the research browser. No bypass or permission inference from its RSS link.
- MacRumors' [agreement](https://macrumors.zendesk.com/hc/en-us/articles/201146626-MacRumors-Registration-Agreement)
  and Kretaforum's [terms](https://kretaforum.info/impressum.html) reserve content
  rights. An ordinary advertised-feed format check with no retained post content
  is not clearance to copy titles/snippets into a product index.
- Discourse Meta staff's explicit RSS clarification is source-specific; no
  general Discourse-content permission follows.
- unknowns' [forum rules](https://unknowns.de/000netiquette-forenregeln/) and
  [disclaimer](https://unknowns.de/disclaimer/) were reviewed. No express ban on
  this transient read was found; reserved reuse rights remain, not product clearance.

### Actual probe results

The lead performed six successful feed GETs (two per feed) and three homepage
discovery GETs. This is a small convenience sample, not a representative sample of
the web. Each feed run examined at most ten entries. Counts below are from the
second/final read, not sixty distinct discussions or sixty independent labels.

| Public feed | HTTP / XML | Entries in response / inspected | Title, primary-link field, date, description fields | Entries with a syntactic off-host link in description/content | Final response bytes |
| --- | --- | --- | --- | --- | --- |
| [MacRumors forum RSS](https://forums.macrumors.com/forums/-/index.rss) | 200 / RSS | 50 / 10 | Each present in 10/10 | 6/10 | 80,513 |
| [unknowns forum RSS](https://unknowns.de/forum/thread-list-rss-feed/) | 200 / RSS | 20 / 10 | Each present in 10/10 | 6/10 | 44,763 |
| [Discourse Meta latest RSS](https://meta.discourse.org/latest.rss) | 200 / RSS | 30 / 10 | Each present in 10/10 | 1/10 | 134,483 |

First-read byte sizes were 80,512, 44,763 and 134,483 respectively. Their field
presence/off-host-description counts agreed with the final read, but raw bodies
were not retained for content comparison. Homepage discovery returned HTTP 200
for MacRumors (284,336 bytes), unknowns (151,633) and Kretaforum (89,929). The first
two advertised the exact feed URLs used above. The constrained discovery parser
accepted no Kretaforum feed URL; this is **not evidence that it lacks RSS**. Its
filters were not relaxed and no feed was fetched. Cyclingnews was excluded before
scripted retrieval, not counted as a network failure.

The three working feeds demonstrate common-format interoperability, including
English and German sources. All inspected entries also contained author fields;
these were counted, not output or retained. No entry URLs were followed. An
off-host anchor may be documentation, promotion or another irrelevant reference;
13/30 such entries is **not** an article-link yield or relevance success rate.

Instrumentation correction: the first probe matched RSS fields by local name.
It could confuse an RSS `comments` URL with the `slash:comments` numeric reply
count. Also, off-host item-link counts lacked a valid-absolute-URL denominator.
The comment/reply and item/comment host counters from these runs are therefore
**excluded from findings**. An offline reproduction established the parser flaw,
not which exact elements appeared in the discarded live responses. The probe
was corrected with namespace-aware URL/count handling and denominator tests;
no third retrieval or retrospective corrected-live-result claim was made.

Consequently the optional RSS article/comment fast path remains unverified in
this sample. We have demonstrated readable candidate metadata, **not** successful
visited-article-to-discussion matching, a usable global search index, independent
operator diversity, native participation, or production content rights.

### Reproducibility and closeout

[The standalone research probe](probes/public-feed-format.ps1) defaults to offline
`SelfTest`; it is not imported by the app or a production fetcher. Run offline:

```powershell
powershell -NoProfile -File research/probes/public-feed-format.ps1 -Mode SelfTest
```

Lead and independent Sol Trust review checked the four-host HTTPS/443 gate,
disabled redirects/cookies/default credentials/proxy, shared 15-second network
deadline, conservative 1 MiB streamed response limit, prohibited XML DTDs/null
resolvers, and no script/HTML/resource execution or raw-response persistence.
Nine offline cases pass, covering aggregate-only feed output, RSS/Atom, malformed
XML, DTD rejection, first-ten inspection and namespace/link shapes. Unapproved host
and non-443 inputs were also rejected before network access.

The lead manually enforced exact feed URLs and the two-request cap. The script
is not a request-ledger system or hardened general SSRF service: direct invocation
accepts paths on its fixed hosts, and discovery outputs public feed-level URLs.
This completed one-off approval is not permission for an ongoing schedule or a
new collection run. No model, owner database, extension, listener, credentials,
paid service or published feature changed. Documentation/decision references are
updated; all later gates remain.

Recommendation after the test and owner clarification: retain common feeds only
as a possible supply mechanism, not the proposed core UX or next connector build.
We need actual page-to-discussion relevance **and permitted in-extension comment
display** across varied subjects/languages, under a separately defined minimal
data/rights contract. More successful feed downloads do not answer those questions.
