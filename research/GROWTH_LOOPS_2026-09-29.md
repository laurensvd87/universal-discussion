# Growth loops: Sources, conversations and retained participation

Date: 2026-09-29. **Product hypotheses, not activated features or a growth forecast.**

Latest direction: the owner now explicitly prioritizes investigation of valuable
user-owned AI research about the current page, with relevant external evidence
and deliberate publication of findings to start native discussions. See
[AI insight cold-start research](AI_INSIGHT_COLD_START_2026-09-29.md). This supersedes
the earlier "thinking aloud, keep AI off the dependency chain" research priority,
not the provider/privacy/publication gates. AI remains optional for readers and
human contributors; no connector or source-acquisition strategy is adopted.

The following records the earlier exploration and its constraints.
The owner supports the broad concept-review direction and asks how captured pages
and conversations could grow rapidly, especially useful coverage on first use.
They explicitly describe the user-owned AI idea as thinking aloud, not a chosen
strategy. They also reject restricting launch to people interested in one Topic:
the unresolved question is a compelling beginning for a broad audience. The
accepted sequencing clarification is extension -> readable web ->
Android/iOS. This does not approve a hosted service, shared browsing index, public
content, provider, recruitment, telemetry or a new migration. The current
implementation remains owner-local 0.11.0.

## Owner clarification: broad coverage without a few platform gatekeepers

Latest after the source probe: the owner wants actual comments **inside the
extension**, not merely links out, and rejects a growing list of specialized
forum integrations as the solution. The [feasibility note](DISCUSSION_SOURCE_FEASIBILITY_2026-09-29.md)
records this higher acceptance bar. A common parser is useful technical evidence,
not a selected source strategy. Permitted inline comment access and broad relevance
remain unproven; no external comment acquisition/cache or cross-posting is approved.

Follow-up: [independent-source feasibility](DISCUSSION_SOURCE_FEASIBILITY_2026-09-29.md)
now records primary evidence, advertised versus untested feeds, field/linkage
limits and the owner's subsequent approval for a bounded transient format/linkage
probe, now completed on three live public RSS feeds. Common-format parsing works;
useful article-to-discussion coverage remains untested. No ongoing collection or
product integration was activated. Standards reduce adapter duplication, not the
coverage problem.

The owner rejects friend-invitation sharing as the missing public-conversation
hook, and rejects a single narrow source such as Hacker News as the starting
answer. They want multiple broad sources without dependence on a few large
operators, while preserving implementation simplicity. These requirements do not
select a provider or approve collection.

The refined hypothesis is many independent source operators through a small number
of standard ingestion formats, not one bespoke adapter per website. Discourse
documents public topic/category RSS; Lemmy documents public RSS/Atom and a common
API across instances. Lemmy's federation documentation describes interoperability
with community-based Piefed/Mbin, but explicitly does not promise every server
already contains every conversation. No full federation server is necessary to
evaluate a bounded public-feed approach.
[Discourse feeds](https://meta.discourse.org/t/finding-discourse-rss-feeds/264134?tl=en),
[Lemmy feeds/API](https://join-lemmy.org/docs/contributors/04-api.html),
[Federation limits](https://join-lemmy.org/docs/administration/federation_getting_started.html).

This reduces connector duplication, not source selection, access/rights checks,
language/topic bias, deduplication, deletion/freshness or abuse work. A public feed
is neither a blanket reuse license nor proof of broad active discussion coverage.
News feeds can supply related articles without supplying any conversation at all.
Do not misrepresent article counts as discussion supply or metadata embeddings as
captured-page vectors. Large proprietary platforms could be optional supplements,
not the sole source of useful results. Shared voluntary public-link contributions
could diversify the catalog later, under a separately approved data contract;
there is no authorization for a shared browsing history or private-page index.

Next evidence needed before recommending implementation: useful external discussion
coverage across ordinary subjects/languages, permitted minimal metadata access,
ongoing operating cost, and whether results remain useful when the largest source
operator is removed. No corpus acquisition or such benchmark was run. There is
currently no demonstrated solution that combines broad immediate coverage,
low complexity/cost and low dependency; do not present federation as a shortcut
that establishes all three. The growth strategy remains unresolved.

## Objective and the important distinction

Increase useful conversation discovery and returning participation, not the number
of empty Topics or generated posts. Consolidating many pages into a smaller number
of useful semantic conversations is a success, even when conversation count grows
more slowly than Source count. Track three distinct outcomes:

1. Coverage of relevant, eligible, distinct Sources.
2. Discovery/readership of existing conversations across those Sources.
3. Returning people who contribute useful questions, replies or evidence.

With a constant number of contributors and constant new unique Sources per person,
catalog additions are linear. A network effect (more useful coverage) can support
growth, but is not itself proof of viral acquisition or exponential adoption.
The isolated local app has no cross-user network effect. Capturing a publisher's
URL does not make our conversations visible to all of that publisher's visitors;
extension discovery reaches only our existing participating users.

## Latest clarification: the missing first-user reason to return

The owner does not accept one narrow interest group as the product's required
launch strategy. General topic support stays central. Focused tests below are
diagnostic options, not a restriction on who can use the product or an adopted
acquisition strategy. More users can improve supply, but "get many users first"
does not explain why the first person installs, returns or invites someone.

The lead's next hypothesis is a two-part entry point, still not an approved build:

- Independent utility: within an explicitly chosen, permitted browsing scope,
  help a person organize/re-find related sources and keep their own questions or
  notes, even before anyone else contributes. A useful first collection could be
  user-selected current links; subsequent eligible visits improve it. Do not
  imply complete immediate-web discovery, secretly import history, enable private
  capture or expand retention. Personal archive/notes are proposed features, not
  capabilities already implemented or a substitute product silently adopted.
- Low-friction social entry: deliberately share a concrete question with selected
  public sources as a readable web page. Recipients can read without installing;
  later approved web participation should permit answering without the extension
  while retaining appropriate identity/abuse controls. The extension then adds
  contextual discovery when browsing rather than being an admission requirement
  for every reader or answerer. No posting to outside communities is automated.

Example: someone collects differing coverage of a news event or several product
options and asks a specific question. The collection is useful to its creator;
sharing lets another person answer/add evidence. A useful conversation can later
surface on other relevant pages without copying its replies. This remains a
hypothesis: source organization is a crowded category and may not be compelling
enough to motivate installation. The missing evidence is real repeat use and
voluntary sharing, not proof that a large catalog can be stored.

No growth trick guarantees an explosive start. Broad access and general topic
support are compatible with measuring relevance/replies within individual interest
clusters. A large scattered passive audience may yield fewer useful conversations
than a smaller overlapping one; this is a density issue, not a ban on other Topics.

## Optional supply experiment: useful collections on first use

The subsequent external-discussion idea below may offer immediate reading utility
without requiring a new personal-notes product. Both remain hypotheses.

A ready-to-use source collection is another first-use hypothesis, not a mandatory
single-niche launch. Let people choose relevant collections across interests;
do not infer interests from imported history. A new user should see some useful
material without needing to browse ten pages just to populate an empty catalog.

For example, a collection around a particular game or hardware announcement can
organize an original announcement, independent coverage and critical reactions.
A focused question gives readers something answerable. This is a product example,
not a claim about any current event or evidence that this audience will adopt it.

Candidate supply without buying a general search API can begin with editor/user-
selected public links. Later, separately reviewed publisher feeds and reference
links on eligible pages can suggest additions. General feed/link standards avoid
one integration per site, but availability and permitted reuse vary. Links alone
are unverified candidates: no automatic full-page fetch, permission to republish,
compatible vector or same-Topic identity follows. This cannot find arbitrary
unlinked, unseen pages and is not a replacement for the entire web's search index.

Use the shared catalog first when an approved shared version exists. Reuse one
useful collection across many new users; do not make each install build its own
empty catalog. Unknown candidates may be displayed as suggested reading and later
embedded when an eligible page is actually visited under an approved capture
scope. Keep candidate discovery separate from authoritative conversation routing.

The owner-local prototype cannot currently provide this shared first-use benefit.

## Latest idea: connect existing conversations instead of waiting for our own

The owner asks whether Reddit and other systems can supply the missing beginning.
The lead recommends investigating a discussion finder: "Where is this page or
subject already being discussed?" The product remains topic-neutral and useful
even with no native replies. This is a proposal, not approval of an integration.

Start by linking canonical external threads, not copying their comments or
silently merging communities. User-attached thread links and an explicitly opened
platform search are possible low-complexity starting points. A search handoff is
not automatic in-popup results and must not be sold as a completed integration.
An exact cited article URL is useful association evidence, not proof that every
comment shares one semantic subject. Semantic/title-based related threads require
separate uncertainty labeling. No invented live counts, author identities or
summaries; native contribution counts stay separate from external discussions.

Current primary-source feasibility evidence:

- Reddit documents URL/title/domain search filters, so user-invoked search can
  target a chosen public article or query. It need not be scraped back into our UI.
  [Search documentation](https://support.reddithelp.com/hc/en-us/articles/19696541895316-Available-search-features).
- Reddit API access requires explicit platform approval; commercial access needs
  written approval/a separate agreement. User login or public visibility does not
  bypass this. Do not promise free Reddit ingestion or make it a launch dependency.
  [Builder policy](https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy),
  [API terms](https://redditinc.com/policies/data-api-terms).
- Reddit supports official post/comment embeds, subject to their own terms. This
  is a presentation mechanism, not discovery, content ownership or authorization
  to build a mirrored corpus. Third-party requests and deletion behavior would
  need review; a normal outbound link is the simpler first proposal.
  [Embeds](https://support.reddithelp.com/hc/en-us/articles/360043033532-How-do-I-embed-a-Reddit-post-or-comment-in-an-article-or-other-publication).
- Hacker News has an official public API exposing story URLs, titles, comment
  counts and change/deletion signals. It is a technical connector candidate, not
  a restriction of our product to technology or an unrestricted reuse license.
  The official API does not itself supply a general semantic search endpoint.
  [Official API](https://github.com/HackerNews/API).
- Discourse documents standard RSS feeds for topics/categories and other views.
  One feed adapter can serve multiple willing public communities, subject to each
  site's access/terms; private/authenticated feeds remain excluded. This avoids
  bespoke extraction for every forum but does not grant universal reuse rights.
  [RSS documentation](https://meta.discourse.org/t/finding-discourse-rss-feeds/264134?tl=en).

Three differentiated growth hypotheses:

1. A cross-source conversation map: associate a useful external thread with
   several relevant articles so users can discover viewpoints beyond the site
   they happened to visit. Offer a deliberate "link a discussion" contribution;
   one good association can help many later readers. Suggestions remain reversible.
2. A native cross-source question: provide one durable question comparing coverage
   or following a developing issue across sites. External threads remain separate
   destinations; our thread's value is continuity across sources, not pretending
   outside authors joined or copying their replies.
3. Reciprocal community utility: a willing forum operator/curator can share a useful
   source bundle or later embed a reviewed discussion-discovery link/widget. Their
   forum receives readers; our map receives deliberate links and recognition. This
   is a partner incentive, not auto-posting, mass outreach or a promised agreement.

Where permitted metadata already includes an outbound article URL, a provider can
supply both a source candidate and an existing conversation pointer without us
fetching every original article. The unseen article still has no validated page
vector. Provider descriptions may support a separately approved/evaluated retrieval
representation; they must not be passed off as our current page-content embeddings.
General-purpose search APIs are not required for these bounded acquisition paths,
but adapters/feeds still have costs, limits, freshness and rights constraints.

Main failure mode: a useful outbound-link directory can remain just a directory.
Readers may leave for established communities and never post here. Measure useful
discovery, repeat use, corrected/added links and genuinely cross-source questions,
not just outbound clicks or nominal imported discussion counts. This can accelerate
useful coverage; explosive adoption and native participation are not established.

Any external lookup discloses a query/URL to another service, and even a shared
link can reveal user interests. No automatic browsing-data export, private URLs,
bulk import, cross-platform identity matching, background page fetch or mirroring
is authorized. Provider/data/security/deployment/publication gates remain explicit.

## Participation loop: useful conversations are shareable objects

Useful existing conversation -> deliberate public link sharing -> new readers can
read on the web without the extension -> some participate, return or share ->
more useful conversations.

- A stable Topic/conversation link is the destination, not a link that first asks
  a new reader to install software or select a technical Topic ID.
- One coherent conversation can be discovered from several relevant Source pages.
  New links improve discovery without copying posts or creating another empty room.
- A good specific question, firsthand experience, sourced comparison or correction
  gives people a reason to share. Provide a user-previewed share card/link; never
  publish messages into other forums or contact people automatically.
- Returning participants can follow a conversation. Any notifications require
  deliberate subscription and later permission/provider decisions; no spam.
- A useful link can be shared by a curator, newsletter author or willing community
  operator without a site-specific API. Partnership/outreach is not performed now.

The owner agrees that readable web conversations belong between the extension and
mobile apps. The reading UI can reuse service contracts; public operation still
needs separately approved hosting/auth/moderation/publication. Reading should not
require installation, and a later approved web contribution flow should avoid
forcing installation before the first answer. Private content stays private.

## Supporting loop: permissioned coverage improves usefulness

Opt-in eligible Source contributions -> better relevant-source/conversation
coverage -> more useful encounters -> returning users and further contributions.

- Preserve local text processing. Future shared contribution needs a separate
  disclosed data contract; local capture is not consent to publish or remotely
  index browsing activity. Private contexts remain outside a public index.
- A reviewed optional contribution mode might avoid a per-page button within its
  exact approved scope. Do not silently turn every visit into a public attribution
  or treat imperfect private-page detection as sufficient for unrestricted sharing.
- Distinguish known-URL lookup from embedding and freshness. Reuse a permitted
  known association for quick display, with an explicit freshness policy. An exact
  URL does not establish unchanged content; new fingerprints/change caches are
  not approved by this note. Unknown URL-only submissions are unverified pointers,
  not fabricated vectors. No remote URL fetch or crawler is implied.
- Deduplicate exact eligible identities and avoid treating syndicated/near-copy
  pages or one actor's bulk submissions as independent matching evidence.
  An untrusted client vector is not proof of content, provenance or quality.
- Rights-permitted curated public links can bootstrap a focused collection.
  Automatic feed/history imports or bulk embedding are later acquisition packages,
  not necessary to begin, and cannot be assumed permitted from public availability.

Current caps are 100 Sources, 100 Topics and 1,000 Contributions. Scaling the
shared system requires measured capacity/query/pagination and abuse controls;
those caps cannot be removed as a growth feature without corresponding work.

## Earlier optional AI-assisted supply hypothesis

Superseded as research priority by the owner's latest explicit investigation
request above. Its data/provenance distinctions and approval limits still apply;
neither then nor now does the idea constitute a selected provider or public launch.

The owner wonders whether a minority (illustratively 10%) could connect their own
AI for personal research and voluntarily contribute its useful public sources.
They subsequently stress that they are not convinced yet. Keep this optional,
off the core growth dependency chain, and do not equate AI volume with engagement.

The plausible loop is user-requested useful research -> selected source candidates
with provenance -> reusable reading suggestions -> eligible later page visits and
better coverage. It does not need a product-owned search API if the approved AI
host supplies search, but search dependency and usage limits move to that host;
they do not disappear. Our storage, moderation and operations also remain costs.

Separate four concepts, not yet a new implemented schema:

1. Discovered URL: an untrusted pointer, possibly fabricated or sensitive.
2. Provider-reported citation/description: evidence with origin and time, not proof
   that we or even the provider read the whole page, and not free republication.
3. Compatible captured-page vector: the result of eligible actual content capture
   under the agreed model/input contract, not an embedding invented from its URL.
4. Conversation association: a relevance/identity decision with correction rules,
   not something established just by citing a link or sharing a model dimension.

Descriptions can later support a separately evaluated candidate-retrieval route;
do not mix their vectors with the current page-prefix representation or give them
the same identity confidence without measurement. Keep prompts, private context,
AI answers and drafts out of default sharing. Even public URLs may reveal private
interests; URL-only sharing still requires a disclosed contribution contract.

Official OpenAI documentation confirms MCP-backed plugins can expose service tools
inside ChatGPT, and ChatGPT has native web search. That supports investigating
an AI-host-initiated research-and-source-submission workflow, not a tested
end-to-end integration or unrestricted extension-triggered background compute.
[MCP](https://learn.chatgpt.com/docs/extend/mcp),
[Web search](https://learn.chatgpt.com/docs/web-search),
[Plugin quickstart](https://developers.openai.com/plugins/quickstart).
Account/workspace capabilities, limits and combined tool behavior need a bounded
test after the provider/data-flow gate; no service was connected in this research.

Do not assert that all subscription-backed API integration is impossible: current
OpenAI docs also describe opt-in ChatGPT plan usage for eligible Responses requests
from open-source/local apps, with a separate interest route for paid/remote apps.
The preview has substantial restrictions and web search depends on model/account
policy. This is a potential future route, not established project eligibility,
unlimited usage, provider selection or permission to reuse browser credentials.
[Plan usage](https://developers.openai.com/siwc/token-sharing-open-source),
[Preview limits](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations).

The hypothetical 10% only helps others where interests overlap. Deduplication,
public-source eligibility, user contribution choices, freshness and actual
usefulness reduce raw link counts. Research output does not itself create human
replies. Price comparisons additionally need current variant/region/currency/
shipping evidence; a cited product page alone is not a verified cheapest offer.

## Supply and incentives

Test usefulness within reachable interest clusters while keeping the product open
to other subjects. The owner's broad-start preference supersedes the earlier
recommendation to make a single niche the launch prerequisite. Curators benefit
when one good contribution is found
from multiple relevant pages and earns recognition for usefulness. Credit only
deliberate public contributions, not inferred browsing activity. No pay-per-post,
raw-URL leaderboards, install rewards or automatic referral messages.

An optional user-owned AI draft can become useful supply after review, sourcing
and deliberate publication. One valuable contribution may help many later readers;
generating filler for every indexed page does not create independent engagement.
Provider-specific integrations, agent operators/quotas and all publication gates
remain. Do not promise free/unlimited consumer subscription compute.

## Discovery beyond the extension

Public conversations with original useful contributions may later be discoverable
via search. Publish one coherent conversation page, not a thin SEO page per indexed
Source or automated copies/translations of other websites. Structured discussion
markup is supported, but enhanced search display is not guaranteed.
[Google discussion documentation](https://developers.google.com/search/docs/appearance/structured-data/discussion-forum).
Mass pages primarily intended to manipulate rankings without added user value
can violate search spam policy, regardless of whether humans or AI generated them.
[Google spam policy](https://developers.google.com/search/docs/essentials/spam-policies#scaled-content).

Search should be an optional acquisition channel, not the sole dependency. Ordinary
user sharing and willing community partners remain viable distribution hypotheses.
No search API, paid acquisition or external posting is activated here.

## What compounding would require

For a deliberately simplified fixed-period model, let:

- `A` be currently active users;
- `r` be the fraction active again next period;
- `s` be genuinely new, unique relevant readers reached per active user through
  deliberate sharing, after audience overlap/deduplication;
- `a` be the fraction of those new readers active in the next period.

Without external acquisition, `A_next = A * (r + s * a)`.
Repeated growth requires `r + s * a > 1`, not merely rising raw visit counts.
Illustration, **not a forecast or observed benchmark**: 100 active users, 80 retained
and 30 newly activated gives 110 next period. Stable rates could compound for a
time; audience saturation, costs, churn and abuse prevent indefinite extrapolation.
Do not confuse this per-period model with a lifetime referral coefficient.

New Sources also depend on eligible contribution opt-in, genuinely new URLs and
duplicate rates. A denser catalog can produce fewer new URLs but more useful
conversation reuse; that is not automatically a negative outcome.

## Recommended order and measurement gates

1. Settle the stable-conversation/relevance contract from the concept review.
2. Test whether independent source utility and a shareable question are compelling
   before relying on an existing community; any new feature scope needs its normal
   data/security decision. Preserve the current working local app.
3. Prepare a separately approved shared-alpha package with simple onboarding,
   web-readable conversation URLs and operable moderation/rights controls.
4. Test useful collections/questions across more than one interest cluster, then
   deliberate sharing and voluntary Source contributions. Broad availability does
   not require assuming all readers will be interested in the same conversations.
   Keep optional AI/provider/monetization/mobile work off the critical path.
5. Measure return use, existing-conversation discovery, human-to-human replies,
   distinct helpful Sources, share-to-active conversion, false suggestions and
   moderation cost. No telemetry is collected until its exact scope is approved.

A suggested small experiment, not an approved recruitment task: a two-week pilot
with roughly 20 willing participants, 30 curated candidate links and five concrete
questions across several interests. This is a learning sample, not an exclusive
launch audience. Check whether people find useful sources,
get replies from someone besides the owner, return and voluntarily share. Compare
useful exchanges and repeat use, not just Sources/Topics created. If only the owner
keeps conversations alive, change the audience/use case before scaling ingestion.
These counts are experiment design suggestions, not statistical validation or
replacement for the separate provenance-approved semantic review gate.

Chrome restricts browsing-data use to disclosed necessary user-facing purposes,
including derived data, and prohibits illegitimate/incentivized install/review
manipulation, notification spam and sending messages without confirmation of
content and recipients.
[Limited Use](https://developer.chrome.com/docs/webstore/program-policies/limited-use),
[Spam and Abuse](https://developer.chrome.com/docs/webstore/program-policies/policies#spam-and-abuse).
These are constraints, not a blanket determination that any proposed growth flow
is approved. Explicit privacy/security, provider, spending, deployment, recruitment
and publication gates remain unchanged.

Evidence: lead checked current repository scope and official policy/search docs;
two independent Sol Medium read-only reviews challenged acquisition, duplicate
bias and scope assumptions. Arithmetic illustration was checked locally. No
owner data, real users, model inference, listener or product code was involved.
