# ADR191 Owner-local development storage relocation

Date: 2026-10-23. Status: all five directory relocations and original-copy cleanup
complete; temporary task removed. Source and independent Trust checks pass.
This does not complete the hierarchical matching goal.

## Authority and scope

The owner explicitly approved relocating development storage to D:. Keep the
PostgreSQL cluster, application stores, crawler, services, pairing and credentials
unchanged. Leave Windows Update, the paging file and global TEMP/TMP unchanged.
Do not force-close VS Code, Codex, unsaved work or restart Windows.

Use the fixed owner-local operator in `ops/local-storage-relocation/invoke.ps1`.
Relocate only npm/pip/uv caches, Codex's `sessions` directory and VS Code's
`extensions` directory into `D:\DevStorage\Laurens`. Keep their existing C: paths
as exact directory junctions, preserving callers' paths without moving the entire
Codex home, its authentication, configuration, state databases, skills or plugins.

## Verification and recovery

The module refuses occupied destinations/backups, noncanonical or reparse paths,
alternate streams and unsupported storage attributes. It bounds entry count and
bytes, keeps a destination reserve, materializes source DACLs and verifies every
file's SHA256, length, attributes, timestamp and protected DACL. It rechecks host
quiescence before switching and retains the original until both trees and the
junction are verified. Cleanup deletes only exact snapshot leaves, nonrecursively.
Failure retains verified copies; incomplete cleanup is not complete success.

Nine synthetic module checks and four operator setup checks pass independently.
The first background setup failed before any session/extension copy because
reapplying the existing root ACL requested a Windows privilege. Setup now checks
the exact current-user owner and protected three-principal DACL without resetting
existing permissions. Module SHA256:
`5e28ed171eee344ab70a815b152635f49bfe8c4ddbbc93f0666cb05e7f15133e`.
Operator SHA256:
`b9d157c6b705ddb660517492069d14397fc015f6abe6505e969b773d0f23d39f`.

## Actual operation

All three caches moved:578 files/249,148,809 logical bytes. Content/metadata/DACL
verification and cleanup pass; exact original paths resolve to D:. The retained
receipt is `D:\DevStorage\Laurens\cache-relocation-complete-20261023.json`.

The initial metadata preflight found no reparse,
alternate-stream or unsupported-attribute entries in1284 session entries and39358
extension entries. That preflight was not a completed copy or stable inventory.
The subsequent offline operation copied and verified both large directories and
published their exact original-path junctions. Session cleanup completed. Extension
cleanup stopped at the first read-only original, leaving19757 files/1017752548B,
including26 read-only files, in the fixed C: original-copy directory. The active
D: copy was intact; `stopped-safely` described incomplete cleanup, not copy failure.

A single temporary task, `Murmingle-DevelopmentStorageRelocation-20261023`, used
the current interactive user with Limited privileges, one trigger, IgnoreNew,
no password, login/boot trigger or restart policy. It invokes only the pinned
operator/module. The helper waits at most240 minutes for development hosts to
close; a12-hour task ceiling avoids interrupting normal copy work. The trigger
expires after13 hours and the task is configured for deletion one hour later.
Only the exact earlier waiting helper was stopped; no application process was.
Actual readback confirms Running/Interactive/Limited, the expected user SID,
one trigger, IgnoreNew and zero restarts. Worker34804 starts19:15:25+02 under
svchost2804, independently of Codex3536; status records waiting with deadline
21:15:26Z. All four live service/crawler start times remain unchanged and the
crawler advances4182 run ingestions. Those observations proved a waiting worker,
not a completed copy. After final recovery, the exact task action and principal
were revalidated and this temporary task was removed.

## Verified read-only-original recovery

New `cleanup.ps1` and fixed `finish.ps1` leave the original reviewed module and
operator hashes unchanged. Seven independent synthetic checks reproduce the old
failure and cover recovery, idempotency, verification-only, differing/missing/
locked D files, and identical metadata with different bytes. Every retained C
file must match a locked live-D counterpart in SHA256/length/time/attributes/DACL.
Only the verified C copy's read-only bit is cleared; deletion uses that same
opened C file handle, not a newly opened path. D is never opened for writing.
Unmatched copies remain and cannot produce completion. Exact manifest directories
are removed only when empty, without recursive deletion. Native deletion follows
[SetFileInformationByHandle](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-setfileinformationbyhandle)
with the documented
[FILE_DISPOSITION_INFO](https://learn.microsoft.com/en-us/windows/win32/api/winbase/ns-winbase-file_disposition_info).

Actual read-only verification closes successfully:19757 verified/zero retained/
zero removed. The separate actual cleanup closes successfully at21:23:33+02:
19757 verified and removed, zero retained,1017752548 bytes removed from C: only.
All five original paths now resolve to D: and no original-copy sibling remains.
The status file reports `State: complete`, `Group: Offline`; the previous failure
receipt is preserved at `offline-relocation-cleanup-before-20261023.json` on D:.
C: has15025811456 bytes free at completion; do not attribute all earlier free-space
growth to this operation. All four live service/crawler start times are unchanged,
and the crawler advances4849 run ingestions. No restart or provider action occurred.

Accepted recovery core SHA256:
`d367815066133f95990b01988486828634f1b2306040513015f868e2f0511076`.
Fixed finish entry SHA256:
`55a4bb2acc790405fa9a4c11407882785f7c8bf791dad5c1659256496874c3ba`.
Development hosts can now run normally. The system-drive space blocker is cleared;
fresh complete resource/pin/phase checks still precede any actual matching study.
