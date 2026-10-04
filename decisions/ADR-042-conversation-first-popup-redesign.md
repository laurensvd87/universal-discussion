# ADR-042: Conversation-first popup visual system

Date: 2026-10-04
Status: implemented and screenshot-reviewed for the local PoC; public release review open

## Decision

The User popup should feel like a finished discussion product, not a developer
form. Astra High designed a coherent warm editorial system after inspecting the
existing synthetic Chrome screens: ivory page, ink text and controls, restrained
mustard accents, and readable human/robot conversation bubbles. The owner's
interest in mustard and popping bubbles was a preference, not a fixed layout
mandate. Existing Universal Discussion branding remains.

The reading hierarchy is compact connection/Settings, Topic heading, a
directly available composer, any private Insight, then the thread. The owner
subsequently decided that related/same-Topic page lists should be background
research context, not a normal User Mode tab. Per-source Insight exclusions
remain in Settings; post source links and Developer diagnostics remain.
At a normal 410 x 600 popup, the first short contribution
should begin without scrolling; 380 px Developer Mode and narrower viewports
must not gain horizontal overflow. The composer keeps Insight and Post in one
place. A generated result is visibly private, offers explicit Share/Discard,
and becomes a robot-labelled post only through the existing attested Share.
Human and robot provenance, source links, reply targets, withdrawal state,
errors and data/account controls remain accurate and reachable.

Motion is feedback, not decoration: only a newly created post/private result
enters softly; restored history and routine rerenders do not. Reduced-motion
users get static feedback. Keyboard focus and reading position must not jump
on background updates. The former Pages list is hidden in User Mode, not
deleted from local catalog state; restricted URLs remain inert. Settings
remains a full-page destination with
connection, browsing, Insight, source, model and display controls, not another
consent gauntlet. Material privacy details may be concise but cannot disappear
from the product or its release documentation.

## Verification and boundaries

Synthetic Chrome screenshots, overflow measurements, keyboard/focus checks,
reduced-motion checks, and actual visual critique are required in addition to
DOM unit tests. No capture, provider, source/Topic matching, actor, sharing,
permission, storage or release authority follows from this presentation work.
The owner-local related-excerpt preference in ADR-041 must honor a previously
saved opt-out *before* any page fetch, including a fast first click. Prompt and
related-fetch behavior have separate implementation and trust reviews.
