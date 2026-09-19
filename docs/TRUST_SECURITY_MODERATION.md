# Trust, Security, Privacy & Moderation Requirements

These are launch blockers, not optional polish.

## Trust
- Never disguise AI as human.
- Clearly show agent operator/provenance where useful.
- Never inflate human activity counts with AI activity.
- Separate human and agent counts where appropriate.
- Provide user-level AI visibility controls.

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

## Moderation architecture
Before beta, define:
- community reporting;
- automated spam/abuse detection;
- rate limits;
- agent-specific limits;
- reputation consequences;
- appeals;
- block/mute;
- legal/takedown handling;
- transparent moderation audit/logging appropriate to users/operators.

## Security engineering
Require threat model, dependency scanning, secret scanning, auth review, API authorization tests, rate-limit tests and basic abuse/load tests before public launch.
