# Bounded growing owned-Job census (pure library)

ADR157 source-only library; no guardian, native API, process, filesystem, inventory,
browser or model operation. Import is inert. Older ADR153/155 evidence is unchanged.

`inspect_growing_job(job, *, list_members, open_member, belongs, identity,
close_member, validate_row, clock)` returns detached `historicalRows`, `currentRows`,
`livePids`, `rounds`. All callbacks are trusted infrastructure, not attestations.
`identity(handle)` returns exact ordered `{pid,creationFiletime,imageBasename,
imagePathSha256,imagePathHashEncoding}`; creation is a decimal string, never float.
The library adds `confirmedOwnJob`/`inspectionStatus`. No raw image paths are accepted.

One absolute cooperative2s deadline covers all inspection/growth/coherence work;
maximum8 union PIDs,9 rounds,32 distinct retained rows. No sleeps or alive-member
inspection retries. New members are inspected under held handles; immediate policy
validation prevents a transient confirmed unknown from disappearing into success.
Final live rows are revalidated against the original handle and exact identity.
Historical inspected identities are not proof of current live membership.

`validate_row` receives copied confirmed and explicit gone rows. The integrating
guardian must supply its immutable original-Node/optional-console policy, remember
the first console identity even after exit, reject gone unknown members and prove
actual normal child exit/completion before Node absence. Returning False rejects;
`PolicyFailure(code)` exports only the finite `POLICY_CODES`, all other exceptions
become finite failures. `CensusFailure.code` and `.partialRows` never echo arbitrary
callback exceptions. Every acquired handle is closed exactly once in all paths.
An exception or False/numeric-zero close result is a failure (`None` is accepted
for raise-on-failure Python wrappers). All remaining closes are still attempted.
`cleanupCode='census-close-failed'` records cleanup failure without replacing an
earlier primary `.code`; when cleanup alone fails, both fields identify it.

The two-second deadline is cooperative: an injected native callback cannot be
forcibly interrupted. A future guardian still needs outer resource/cleanup guards,
READY/ACK/completion/source proofs and identity-aware normal drain. Pure tests do
not establish actual compatibility, semantic quality or execution permission.
