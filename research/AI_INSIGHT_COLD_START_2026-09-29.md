# AI research as first-user value and discussion supply

Date: 2026-09-29. **Prioritized investigation, not provider/build/publication approval.**
The owner now explicitly asks to investigate user-owned AI producing valuable
insights about the page being read, researching relevant other sites and exposing
missing or incorrect information. Selected results can start native discussions.
This supersedes external-forum aggregation as the next cold-start investigation;
it does not select an AI vendor or activate any external data flow. App: 0.11.0.

## Recommendation

Investigate one clear promise: **find useful context this page does not give me,
with sources I can check, and let me discuss the finding across related pages.**
This is a stronger first-user hypothesis than an empty forum or outbound links:
the requesting reader can benefit before another participant arrives. That is a
product inference, not measured demand, a growth forecast or a proven moat.

Research and summaries are already available in AI hosts. Our differentiated
hypothesis is that checked findings become reusable, correctable public discussion
starters encountered from multiple relevant pages, rather than disappearing in a
private chat. If results are generic summaries or users never want to share them,
this is only a private AI companion with an unused social button. Test both risks.

The first contributors could be existing AI users across different interests,
not people restricted to a single Topic. Other people should be able to read and
reply without connecting an AI account. Their research quotas are not community
compute: no background use of their allowance to fill unrelated discussions.

## What the first useful result should contain

Proposed English action: `Find missing context`. Start with this one research
mode, not a marketplace or many provider-specific agents. Existing General
Analysis / Opinion / Summary definitions remain planned alternatives, not removed.

Return at most 1–3 short findings, each containing:

- The precise claim, ambiguity or missing decision-relevant context.
- Why it matters to this reader, not another paraphrase of the article.
- Supporting and, where relevant, contrary evidence with clickable source links,
  dates and source-specific support. Distinguish opened sources from search snippets.
- A calibrated status such as `Additional context`, `Conflicting evidence`, or
  `Unresolved`; do not treat opinion differences as factual errors.
- An optional specific question a person could answer or correct. Do not append
  a generic engagement question when no meaningful question exists.

Hypothetical examples, **not verified findings about real products or articles**:

| Current page | Potential finding from additional evidence | Useful discussion |
| --- | --- | --- |
| Product review praises battery life | Manufacturer's test uses video playback, while an independent test covers navigation; conditions differ | What runtime do owners get under comparable use? |
| News article reports a large percentage increase | Original dataset distinguishes relative change from absolute numbers or a changed measurement method | Does the headline's conclusion survive that distinction? |
| Opinion article argues for a policy | A relevant primary report supports one premise but challenges another | Which evidence changes the argument, rather than which side is popular? |

Do not instruct the AI to always find a mistake. It must be able to return no
material issue, insufficient evidence, unavailable source, or uncertainty. Look
for the strongest relevant evidence, not an equal number of links for each view.
Several syndicated copies of one claim are not independent corroboration.

The current reader observes only a bounded prefix (4,096 characters / 512 model
tokens), not the whole article. Missing from that prefix is not missing from the
page. A future approved workflow must show what was actually read, let a provider
read a lawfully accessible public URL or use an approved user-selected excerpt,
and qualify omissions when coverage is incomplete. Do not expand capture silently.

## User flow and incentive

1. Open the extension: show existing relevant public insights/discussions without
   requiring AI login. In the present local prototype these are still local data.
2. User deliberately requests research. Preview URL and the exact optional excerpt
   going to the chosen provider; explain search, quota use and scope. Opening a
   page or starting the embedding session is not permission for an AI request.
3. Display findings privately inside the extension in the intended integrated UX.
   `Private` means unpublished, not that the provider never receives the input.
4. Offer a prominent `Share insight` action with a short editable public preview:
   selected finding, chosen evidence links and optional human question. No private
   transcript, history, prompt, unrelated personal context or hidden source details.
5. Explicit publication creates a native contribution with AI provenance and human
   curation identified. Replies stay in our discussion UI. Relevant other pages
   may surface it through the approved matching/correction contract, not a new
   unapproved global merge or silent historical-routing migration.

Sharing offers a checked, reusable reference and the possibility of an answer or
correction. Later readable web conversation pages could make it shareable without
the extension. No claim that an empty community immediately supplies responses.
Credit useful curation and corrections, not token use, post count or link count.
No automatic public seeding, fictitious people, AI-to-AI conversation or paid
posting incentives. The private preview is an intermediate safety step, not the
proposed final product. The public discussion remains central.

## Source discovery is a useful by-product, not a crawling mandate

An approved research run may identify useful public URLs across many domains
without bespoke forum connectors or our own separate search-provider integration.
The AI host still depends on its search systems, availability, terms and quota.

Keep the data states separate:

1. Citation candidate: untrusted URL, source description and research provenance.
2. Checked supporting source: human-reviewed relevance/access and chosen public
   association with a finding; still not necessarily an independently read full page.
3. Captured page: eligible actual visit/capture with the existing compatible E5
   representation and versioning.

Do not invent page embeddings from URLs or silently mix title/snippet vectors
with full/prefix page vectors. A citation does not prove same-Topic membership.
Provider output does not authorize fetching, retaining or publishing every cited
page. Selected links can support an insight without indexing those page bodies.
Shared source suggestions can later reduce duplicated research; sharing all
research history is neither necessary nor approved.

## Current integration evidence

Documentation was checked by the lead with OpenAI Docs and a separate Sol
Anthropic/Google review. No provider account, token, inference or search API was
used by the app; this is documentation research, not connector verification.

| Route | Evidence and fit | Unresolved boundary |
| --- | --- | --- |
| ChatGPT plan usage for eligible OSS/local apps | Official OAuth flow supports eligible Responses calls using the user's plan; first registration needs no partner API key. Potentially fits the existing local service and an in-extension result. | Preview eligibility, license/business fit, account/model/search availability, token handling and actual operation are not established for this project. |
| Manual research in an existing AI app | ChatGPT web search, Claude Research and Gemini Deep Research provide source-based research. A deliberate paste/import can test value before integration. | Extra steps; useful for validation, not the promised polished in-extension experience. User must avoid private connectors/history and review the shared result. |
| AI-host connector / MCP | Host invokes our tools to obtain approved context or submit a private draft. | Not reverse access to a consumer subscription. Local/cloud reachability, account support and deployment differ. Do not expose the local service as a shortcut. |
| Direct provider API | Potential later automatic adapter under provider-specific supported authorization/billing. | Not generally bundled with a consumer chat plan; no keys, new charges or automatic paid fallback approved. |

OpenAI's [plan-usage overview](https://developers.openai.com/siwc/token-sharing-open-source)
documents the OSS/local route and a separate interest route for paid/remote apps.
[Registration](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
uses per-user authorization with PKCE and a loopback callback; a successful identity
login alone does not grant inference permission.
[Preview limits](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)
require streaming, `store:false`, explicit context, and restrict tools; web search
depends on model/account policy. This is not a new heavy local model requirement.
[Inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)
uses the public Responses endpoint, never a scraped chat backend.
[Usage UI](https://developers.openai.com/siwc/ui-ux-guidelines) distinguishes the
user's plan/credits and limits from our app's charges. Do not promise free or
unlimited work. This route is distinct from simply embedding ChatGPT's website.

No project-level LICENSE file was found in the inspected worktree. A GitHub
repository alone does not establish OSS eligibility. Do not add a license, submit
an application, register a client or assume future commercial/mobile eligibility
without the appropriate owner decision. The
[commercial client page](https://developers.openai.com/siwc/request-client-id)
currently describes a selected-partner/waitlist route; do not conflate it with
the documented dynamic OSS registration.

The documented loopback callback fits a local companion, which this prototype
already has; it is not proof of a standalone extension-only or mobile sign-in
experience. Requiring a companion installation adds first-user friction. Resolve
distribution and future hosted/mobile authorization before treating this as the
global launch solution, not just a promising desktop proof of concept.

Other primary evidence:
[ChatGPT web research](https://learn.chatgpt.com/docs/web-search),
[Claude Research](https://support.claude.com/en/articles/11088861-use-research-on-claude),
[Claude subscription/API separation](https://support.claude.com/en/articles/9876003-i-have-a-paid-claude-subscription-pro-max-team-or-enterprise-plans-why-do-i-have-to-pay-separately-to-use-the-claude-api-and-console),
[Claude remote MCP](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp),
[Gemini Deep Research](https://support.google.com/gemini/answer/15719111?hl=en),
[Gemini API billing](https://ai.google.dev/gemini-api/docs/billing).
Reviewed Claude/Gemini consumer research supports the manual pilot; it does not
establish a general third-party subscription-inference OAuth entitlement. Their
API billing/access must be checked separately. Do not implement all providers now.

## Economics and adoption: honest limits

A minority of voluntary contributors can create reusable public findings that
non-AI users read and answer. But the earlier illustrative 10% is not a measured
conversion rate or sufficient coverage. Interests cluster; sources repeat; news
and prices go stale; many useful private results will not be shared. No exponential
growth or viral acquisition follows automatically. BYO inference still leaves
our storage, serving, moderation, safety, support and distribution costs.

Prefer one valuable result per real user question over generation on every page.
Show already shared findings first; allow targeted research for an unanswered
question or a dated result. Keep date, subject/event/variant scope and evidence
visible. Deduplicate near-identical public insights without deleting minority
views. Expensive research must not become an installation prerequisite.

## Smallest meaningful next test

Recommend a five-public-page value pilot across unrelated subjects, not another
200–250-pair semantic review or repeated 6/6 owner exercise. No pilot run yet.
Compare a short evidence-seeking insight against an ordinary summary/research
chat on the same page. Review whether the source actually supports the finding,
whether it adds something important, how much repair/review it needs, and whether
the owner would publish that specific result with a genuine reason to invite replies.

Record a small evidence table, not a retained article/chat corpus. Quality signals:
correct and relevant supporting evidence; materially useful new context; acceptable
time/quota/review effort; repeat-use interest; and willingness to share. A false
accusation presented as established fact is a failure even if it is engaging.
Five examples can expose obvious problems, not establish global accuracy or demand.
No recruitment or autonomous public posts are part of the proposed pilot.

Start value validation with a supported user-operated research session if needed;
manual handoff is the experiment, not the final UX. In parallel, resolve eligibility
for one supported in-extension adapter, with the ChatGPT local route currently a
promising candidate. Do not make an unvalidated provider choice or license change
merely to avoid manual steps. No demand for a new large on-device reasoning model.

Before any real app/provider call, present one concrete provider/privacy/security
package: named public pages and allowed excerpts, search capability, destination,
credentials and lifecycle, retention/training settings, quota/spend bound, error/
cancellation behavior and no-publication guarantee. Existing tool-free credential
smoke requirements remain; read-only web research needs its own explicitly included
scope. Credentials stay out of page context, synced extension storage and logs;
no browser-cookie reuse, unofficial chat automation or public write tool.

URL-only requests still disclose browsing interests. Webpage/AI instructions
cannot authorize extra tools, reveal secrets or publish. Treat citations and
rendered output as untrusted; source-check findings, qualify uncertainty and
provide correction/reporting before a shared launch. Provider data handling is
not determined solely by `store:false`. Current embedding approval is local-only
and does not authorize page text or vectors going to an AI provider.

No new implementation, model, listener, permissions, provider selection, spending,
deployment or publication results from this investigation. ADR-014/R3 and the
BYO threat model retain their gates. External-forum research is preserved as
history, not continued as the primary direction.
