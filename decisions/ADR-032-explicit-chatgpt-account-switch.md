# ADR-032: Explicit single-profile ChatGPT account switch

Status: owner requested switching to a different ChatGPT account on
2026-10-03; local implementation and offline verification complete. The
owner's sign-in to a second account is still pending.

## Context

The owner's first account reached its ChatGPT plan usage limit. The local
service keeps one protected refresh token and one non-secret dynamic-client
registration bound to that account's validated subject. Its existing
Disconnect clears/revokes the token but retains the registration; a later
OAuth attempt with a different subject is therefore rejected, and the old
account's email can remain a login hint. Reusing the old issued client ID for
a different account would be unsafe. The [official OpenAI accounts guide](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions)
calls for a separate registration or a new dynamic-client registration for a
different account.

## Decision

For this one-profile local prototype, an explicit **Disconnect ChatGPT**
must first stop requests, clear the local protected renewable token, attempt
revocation, and then clear the selected account's non-secret registration
while preserving the installation host ID. A subsequent **Continue with
ChatGPT** begins a fresh dynamic registration without the previous account's
client ID or login hint; the user chooses the other account in the official
browser sign-in flow. The new identity is verified before any credential is
made active. No automatic account switch, account credential mixing, new
provider request for insights, or local discussion/pairing deletion occurs.

This deliberately forgets the old account mapping in the current one-profile
PoC. Switching back later requires a fresh account authorization. A future
multi-profile account picker should retain separate registrations and tokens,
as the official guide recommends, rather than using this replacement flow.
If local protected-token clearing fails, the service must not claim a clean
disconnect or clear the mapping for reuse. A failed remote revocation remains
visible to the user; local credentials must not be reused.

## Verification and UX limitation

The local service's Disconnect/Connect lifecycle is covered by account A to B,
credential-clear failure, remote-revocation failure, registration-clear failure,
and late-restore race tests. The callback page now labels an OAuth error-only
response as cancelled or declined rather than suggesting sign-in succeeded;
it never echoes callback parameters. The service suite passed 190 tests with
four Windows-only opt-in skips, the fixed-loopback integration passed 2/2,
and the secret scan found no findings on 2026-10-03.

Fresh dynamic registration removes the app's old login hint, but it cannot
control an existing OpenAI browser session or insert an account switcher into
OpenAI's consent page. The owner may need to change the active account on
ChatGPT web in the same browser profile before starting the new flow. No
claim of successful second-account connection is made until the owner sees
the intended identity and completes the callback.

Extension 0.12.15 corrects a User Mode CSS regression that hid Disconnect
after model selection. The connected-account disclosure in AI insights now
keeps **Disconnect to switch account** reachable. After that action completes,
Continue with ChatGPT remains a separate deliberate step. No OAuth retry or
provider inference is triggered by the UI change.
