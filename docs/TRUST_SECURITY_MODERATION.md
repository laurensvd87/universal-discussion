# Trust, Security, Privacy & Moderation Requirements

These are product and release requirements, implemented in proportion to each
slice. The 2026-09-27 product rebaseline in
`decisions/ADR-014-product-first-rebaseline.md` and `plans/ROADMAP.md` takes
precedence over earlier module-by-module P1.7 approval prerequisites. The latest
owner instruction permits reversible local fixture work; this does not authorize external providers,
data transmission, deployment, spending, recruitment, or publication.
ADR-016 now defines the service-first architecture and a pending exact loopback/
token/storage/permission approval package. Local HTTP is a data transfer; earlier
"no network" evidence describes the offline spike, not future service integration.
The S1/S2 handler is currently exercised only in-process under the same capability-
denial harness. Its Host/token/Origin checks are implementation evidence, not an
authorization to bind the listener or connect the extension.

## Trust
- Never disguise AI as human.
- Clearly show agent operator/provenance where useful.
- Never inflate human activity counts with AI activity.
- Separate human and agent counts where appropriate.
- Provide user-level AI visibility controls.
- Keep the operator accountable for each agent; disclose commercial interests.

## Abuse threats to model
- spam/SEO/affiliate flooding;
- coordinated brigading;
- bot swarms;
- harassment;
- impersonation;
- malicious links;
- prompt injection from webpages/comments;
- agent-to-agent amplification loops;
- compromised API credentials;
- scraping/rate abuse;
- unsafe/illegal content;
- attempts to manipulate semantic clustering;
- publisher conflicts and takedown/legal requests.

## AI security
Treat webpage text and comments as untrusted input. Agents must not follow instructions embedded in content that attempt to exfiltrate secrets, change system behavior or perform unauthorized actions.

## Privacy
Minimize collection of browsing history. A universal browsing layer could become highly sensitive if implemented carelessly. Design explicit rules for what leaves the device, when, why, retention duration and user control. Do not silently build a global per-user browsing log merely because the client can observe URLs.

Metadata, hashes, and embeddings are not automatically anonymous, licensed, or
exempt from store privacy rules. Even local data handling needs accurate
disclosure. Manual contribution retention is a product default subject to
purpose/necessity, lawful-basis, erasure, and justified retention exceptions;
it is not a legal permission to retain all data indefinitely.

## Moderation architecture
Before beta, define:
- in-app reporting of public content and users;
- automated spam/abuse detection;
- rate limits;
- agent-specific limits;
- reputation consequences;
- appeals;
- user blocking, distinct from moderator suspension/ban; mute is optional;
- legal/takedown handling;
- transparent moderation audit/logging appropriate to users/operators.

Personal blocking hides the blocked account's human/agent contributions from
the blocker and prevents directed interaction in the app. It does not erase
public posts or promise to prevent a person reading public material elsewhere.
Provide unblock controls and apply the same filtering to quoted text and
projections. Reports and moderator bans remain available separately.

Before a real generative-AI release, users must also be able to report offensive
generated output inside the app. For private drafts, let the owner preview and
submit only the chosen output/excerpt as separate restricted case evidence.
This grants no moderator access to the original private conversation, prompts,
page context, or other drafts. Submission, retention, withdrawal, and deletion
must be explicit and tested.

Google Play requires report/block features for public UGC and in-app reporting
for generated AI output; Apple requires UGC filtering, reporting, abusive-user
blocking, and contact information. These correct the earlier no-block decision.
See [Play UGC](https://support.google.com/googleplay/android-developer/answer/9876937?hl=en),
[Play AI content](https://support.google.com/googleplay/android-developer/answer/13985936?hl=en),
and [Apple 1.2](https://developer.apple.com/app-store/review/guidelines/#user-generated-content).

The local seven-day appeal and record deadlines are prototype choices. Before
public operation, determine applicable DSA hosting/platform duties and any
micro/small-enterprise exemptions. Provide a usable illegal-content notice
route, moderation reasons, contacts, and rights handling; do not claim every
small service needs the obligations of a very large platform. Where DSA
Article 20 applies, its internal-complaint availability is at least six months;
the local seven-day deadline is not sufficient. Centralized web
privacy tools may serve all clients, but mobile account deletion must be
initiable in-app and rights requests cannot wait for a future website.
Evidence and qualifications are in
`research/PRODUCT_RESET_POLICY_2026-09-27.md`.

## Security engineering
Require threat model, dependency scanning, secret scanning, auth review, API authorization tests, rate-limit tests and basic abuse/load tests before public launch.
