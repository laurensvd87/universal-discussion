# ADR-025: Public-profile automatic matching and one-click ChatGPT insights

Date: 2026-10-01. Status: owner-approved scope implemented locally in 0.12.8; synthetic verification complete, owner live inference pending.

## Decision and authority

The owner wants a compact User Mode: pair the running local service, then use a
visible Create insight action without stepping through separate context, text,
model and cost controls. In two explicit answers on 2026-10-01, the owner approved:

1. Automatic local matching after connection, without Start session, for active
   eligible HTTPS pages in a separate public/non-sensitive browser profile.
2. Automatic model listing and selection of the last listed model; one Create
   insight click may read/attest at most 4,096 characters of the current visible
   public article and send it with the selected current-page context and up to
   ten related/same-Topic public source titles/URLs through the local service to
   OpenAI. Separate text preview and per-request cost checkbox may be removed.

This deliberately supersedes ADR-019 B's explicit Start and ADR-024's separate
AI text/cost confirmation for this narrow owner-local public-profile workflow.
It does not approve private/authenticated pages, new host permissions, persistent
pairing, an AI call on navigation, remote hosting, a paid API fallback, automatic
posting, account credentials/cookies, or store/legal/publication clearance.

## Safety and interaction bounds

- Local capture may begin only after a current pairing and the existing Chrome
  broad HTTPS access grant. A missing native grant still needs one browser-required
  user gesture; no synthetic permission prompt or silent privilege escalation.
  Bind the lease to one focused normal window and only its active eligible tab.
  Incognito, internal/local URLs, blocked sites and old per-site preferences stay
  excluded. Stop is sticky for the current browser session rather than undone
  by reopening the popup; keep Stop and Never process this site accessible.
- Public/private detection is not reliable. The separate non-sensitive profile
  is an operating condition, not a technical proof. Show that limitation briefly
  in settings/onboarding; do not imply the app can recognize all secrets.
  Matching still sends only URL, short title and one 384-dimensional vector to
  the paired local service and retains them until manual deletion. Raw matching
  text stays transient on device.
- ChatGPT model listing may run automatically after the existing account has
  plan permission. Select the final displayable model in that returned catalog
  by default, not a guessed cheapest/best model. The user may change it. No
  automatic inference, retry or paid fallback follows a list/read failure.
- Only the explicit Create insight click authorizes the bounded current-page
  text send. The document must be reattested before dispatch. Source links and
  titles may supply research context, but the extension does not fetch or send
  related-page bodies. A settings control may omit related candidates before
  dispatch. Current page remains the subject; related pages are evidence to
  check, not an automatic replacement subject or Topic merge.
- The owner accepts removing the per-request cost checkbox and text preview for
  this click. The app cannot enforce ChatGPT billing settings: provider-side
  included-plan/paid-credit controls remain the owner's responsibility. Keep a
  concise plan/usage indicator and Manage usage link. Existing one-active-call,
  five-per-hour process cap, 90-second deadline, bounded payloads, `store:false`,
  streamed completed-only output and no automatic retry remain.
- The AI result stays private and editable. Sharing remains a separate exact
  preview and explicit local action; no automatic discussion publication.
  Failure leaves no partial draft. Paired diagnostics may show only allowlisted
  in-memory failure codes, never provider bodies, page text, tokens or URLs.

## Verification and remaining gates

The exact one-click path and disabled/error states passed synthetic provider
tests and an isolated Chrome profile. Background matching also passed an
isolated Chrome smoke with explicit initial native permission, automatic
capture, Stop/resume, block/unblock and backend restart. No pre-pair capture,
automatic provider inference, raw text in the matching payload, extension
external request or runtime exception was observed. An independent read-only
trust review found no blocker. These checks are not a legal or store review.
A real account call remains owner-operated; do not ask for token, callback URL
or page content. If an approval detail proves incompatible with Chrome or
provider behavior, stop and report rather than widen scope.

ADR-019 C durable pairing and every later security, privacy, spending,
deployment, store/publication and provenance-review gate remain separate.

## 2026-10-06 cost-sensitive default refinement

The owner now prefers the cheapest available Insight model, suggesting the
bottom of the list. The [official Sign in with ChatGPT model-catalog guide](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)
documents preservation of server order but does **not** identify that order
as a price or plan-usage ranking. [Official model guidance](https://developers.openai.com/api/docs/models/gpt-5.6-luna)
describes Luna as optimized for cost-sensitive workloads; API token prices
must not be presented as the effective cost of this ChatGPT-plan connection.
For this owner-local default, prefer a listed Luna slug when no explicit valid
user choice exists, otherwise retain the previously approved last-listed
fallback. Preserve a user's deliberate model choice across list refreshes
while it remains available. This is a cost-sensitive heuristic, **not** a
guarantee of the absolute cheapest model or zero charge. No additional
provider call, paid fallback or automatic Insight dispatch is authorized.

## 2026-10-06 restart-safe model catalog recovery

After the local service restarts, an already-open popup can retain its selected
model while the new service process has no in-memory model catalog. A deliberate
Insight click may make one bounded, content-free account `/models` request to
rebuild that catalog before the existing single Responses request. The chosen
slug must still be listed for this account. A missing slug or failed catalog
request sends no page text and no Responses request. The 25-second catalog
deadline, account cancellation fences and the rolling Insight quota remain.
If the selected model is unavailable, the popup refreshes the catalog once
and asks for a deliberate retry; it never repeats the Insight request or
silently substitutes another model in an already-dispatched request. This is
a repair of the approved model-list path, not authorization for extra research,
new providers, paid fallback or background inference.
