# ADR-123: Question language for AI replies; configured language for Insights

Date: 2026-10-15

Status: Implemented, independently reviewed and active in the local PostgreSQL service.

## Decision

The owner requests that an AI answering a question answer in that question's
language. Standalone Insights and similar opening contributions use the configured
reply language instead. This supersedes the previous configured-language priority
for replies only, including earlier Standard-reply full-packet hash preservation.

Select the static language policy using the existing trusted followup flag:

- Replies follow the author's own question/request in `selectedMessage`, even if
  `preferences.replyLanguage` differs. Imperatives and requests without a question
  mark count too. Mixed-language requests use their predominant language.
- Mentions, URLs, code, quoted material, webpage language, the opener, research
  results and browser-interface language do not determine the reply language.
- If the request's language cannot be determined, use configured reply language,
  or English when unset.
- Standalone opening Insights retain the entire existing configured-language
  instruction byte-for-byte, including the English default.

All twelve voices and research-on/off paths share the rule. Public `@AI` and
sparkle replies already pass the selected accepted message; private questions
already map the current human body to `followup.questionBody` / `selectedMessage`.
No client field, language classifier, additional provider call, translation call,
retained field, migration or permission is added. Existing preference validation,
destination/currency privacy, task/evidence/research/citation rules, bounded
context, original destination and one-shot sharing remain unchanged.

## Verification

Independent old/new comparison against the checked active snapshot covers all
48 voice/followup/research combinations: 24 opening prompts are byte-identical;
24 reply prompts change only the language prefix before `Validated preference
codes`. The remaining prompt and authority tail are exact. Existing full-prompt
and protected-section baselines are updated only for the approved language change.

Four new restricted offline tests exercise all branches, configured/default
openings, exact multilingual/ambiguous/quoted/mention/code payloads, private debug
suppression and a single synthetic answer request without a detection endpoint.
The independent focused suite passes 33/33; full backend passes 1,184 with five
environmental skips (1,189 total), zero failures. Tests establish request/prompt
behavior, not real model language adherence. No live inference or post was made.

## Activation

Only `apps/local-service/src/ai/insight-prompts.js` was overlaid into the checked
runtime; manifest comparison proves all other 1,355 files unchanged. Prior code
and manifests are retained under ignored
`data/runtime-backup-adr123-20261015`. No owner database backup/restore or unrelated
dirty credential/naming activation occurred.

New seal: `57efaa0bb79d51dc061fc97fb88ddd90d324a608b7c6863be5310616721074fc`,
1,356 files / 15,249,700 bytes. HTTP service alone restarted as PID31680.
Crawler30932, worker22884 and dashboard6644 retain their original start times.
Pairing hash is unchanged and protected provider sign-in is connected. Read-only
post-activation proof reads the saved discussion in91ms; 100 requests all return
HTTP200 in518ms. Crawler completed13,277 durable jobs with a current further lease
at revision16,925 and continues progressing; service stderr is empty.

No extension version/reload is required by this backend-only change. App sessions
may need normal renewal after the service restart. No further inference grant,
automatic retry or crawler restart policy follows.
