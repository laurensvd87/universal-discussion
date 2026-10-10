# Packaged browser versus Node E5 parity

Run `node apps/local-service/experiments/topic-encoder/browser-node-parity-v1/run.js` from the repository root on a machine with the installed Chrome executable. An optional first argument supplies another absolute Chrome executable path.

The runner uses the existing isolated anonymous-pipe Chrome launcher and a fresh temporary profile. It loads the existing unpacked extension, blocks external requests, and removes its temporary profile afterward. It reads the same packaged, hash-checked model and tokenizer from the repository in Chrome and Node. It does not open browser pages, a local database, or any corpus. Its inputs are three project-created fictional strings, including a multilingual input and one exactly 4,096 UTF-16 characters long. Text and vectors stay in memory; output contains only aggregate vector differences and run times.

This tests parity of E5 inference for the exact strings selected here. It does not test Chrome page extraction, user content, Topic quality, trained adapters, inference on every browser or CPU, or a product rights decision. The reported durations include cold model initialization and depend on the machine.
