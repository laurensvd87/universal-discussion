# ADR-103: Content-free voice dispatch trace

- Date: 2026-10-12
- Status: explicitly owner-approved local diagnostic; activation evidence in STATUS
- Related: ADR-029, ADR-030, ADR-100, ADR-101

## Reason

The owner's latest quoted public contribution was created after the stronger
voice prompt update but sounded analytical rather than sarcastic. Source review
and offline transport tests show the intended voice path; existing posts and
normal response traces cannot prove the selected voice on that actual request.
The owner approves a minimal selected-voice/prompt-fingerprint trace, without
page text, and permits normal local restarts as needed.

## Decision

Trace public generation at the actual Responses dispatch attempt. Serialize the
same provider packet once; hash UTF-8 bytes of the `instructions` string from
that serialized packet, not a separately rebuilt prompt or the user input.
The strict four-field record is:

`{schema:"insight-request-trace/v1",voice,instructionFingerprint,at}`

Voice is one fixed enum, including Standard when absent. The fingerprint is
lowercase SHA-256; `at` is the local dispatch timestamp in epoch milliseconds.
No page/comment text, source URLs, account/actor/operation identifiers, model
name, credentials, response text or input hashes. Records do not reach the
provider or alter its request. There is no extra inference, request or retry.

The normal owner-local CLI composes the diagnostic into a fixed temporary file:
`%TEMP%/universal-discussion-insight-trace/voice-request-trace.log`.
The sink accepts only plain, exact enumerable data fields without executing
getters, reprojects safe scalars and keeps only whole validated recent lines
within 64 KiB. It rejects redirected/linked/nonregular unsafe paths and discards
malformed prior records without copying their contents. Logs are overwritten
within the cap or removed by manual/OS temp
cleanup, not an additional canonical database or indefinite growing archive.
Filesystem/sink failures must not fail sign-in, generation or service startup.

Existing private-generation `suppressDebug` also suppresses this new trace.
Raw debug remains separately opt-in and unchanged. There is no new user-visible
UI, extension permission, retained contribution field or hosted telemetry.

## What it proves

An emitted fingerprint identifies the local instructions in a dispatch attempt.
It does not prove that OpenAI received the request, obeyed the voice or produced
quality sarcasm. A correct Sarcastic fingerprint distinguishes prompt adherence
from a missing/default voice; timestamp correlates a deliberate owner test without
retaining browsing context. It cannot reconstruct older untraced requests.
This is a best-effort diagnostic, not an audit journal: crashes/unavailable
storage can lose records, and multiple processes do not share a durable log lock.

The OpenAI Docs skill informed inspection of the actual `instructions` request
field, following [official text-generation documentation](https://developers.openai.com/api/docs/guides/text).
No prompt reordering, SDK/model migration or provider feature assumption follows.

## Verification

Offline tests compare fingerprints with captured actual POST instructions for
every voice and opening/reply/research mode, preserve packet bytes and check
private suppression, failed preflight and throwing callbacks. Sink adversarial
tests cover malformed enums/hashes, accessors, unwanted fields, log bounds,
unsafe paths and nonmutating rejection. Independent Trust and normal idle
restart/pairing/data-preservation evidence are recorded in STATUS. The owner's
next deliberate public generation is needed for request-specific live evidence;
the agent does not infer permission to make another provider call.
