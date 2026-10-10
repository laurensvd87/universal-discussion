# ADR-070: Inert Topic-grouping comparison before any live switch

Status: implemented for local dashboard preview on 2026-10-10; live switch
not approved.

## Context and decision

The owner asked to test the real-trained diagonal adapter further and, if it
remained promising, compare old and new Topic grouping in the app and
dashboard. Changing the active grouping is not a cosmetic switch: Source
links and source-anchored root discussions, including reply subtrees, can
move. Manual pins and historical roots require preservation. The GlobeSumm
research approval in ADR-065 permits offline local evaluation, **not**
shipping weights or applying a trained model to retained user Sources.

Implement only an optional, local, read-only Topic Atlas comparison shell.
An explicit `?preview=1` enables a bounded JSON import describing a complete
partition of the currently displayed Source IDs and the exact catalog
revision. The browser keeps it in memory only and invalidates it on revision
change. The experiment view is labelled as a preview, and original page
links remain intact. It writes no SQLite row, Topic route, discussion,
trained weight, captured text or vector. The normal dashboard stays unchanged.
There is no extension switch and no producer of real experimental partitions.

The frozen body-input transfer in
[its aggregate result](../apps/local-service/experiments/topic-encoder/real-diagonal-body-transfer-v1/RESULTS.md)
reached 255 versus 20 correct grouped pairs but made one false grouped join
versus zero for raw body E5. It therefore **fails** ADR-069's relative safety
criterion, despite stronger reach. Do not use this adapter for an active
Topic or discussion-routing toggle.

## Later gates

A real preview producer over retained public Sources needs a separate
owner/Trust/data-rights decision, even if read-only; ADR-065 does not cover
that use. An active app switch additionally needs independent quality and
false-exposure evidence on browser-equivalent input, model-training and
distribution rights, explicit retention and local-computation scope, a
transactional Source/root-subtree migration with rollback and manual-pin
rules, and owner approval. A dashboard preview alone cannot validate those.
No provider, deployment, store or publication permission follows.
