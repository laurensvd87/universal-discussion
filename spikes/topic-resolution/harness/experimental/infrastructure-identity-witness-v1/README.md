# Finite infrastructure identity witness (ADR197)

Pure source-only extraction of the complete immutable ADR166 identity policy.
No target admission, transition, descriptor grammar, closing rule or census
comparison is changed. The original StartupFatal class is retained through its
named default-inert import from native-extension-startup-dev-v1/run.mjs. That
module's existing static browser/adapter/source-ledger dependencies evaluate;
no runner, browser, model or IO operation is invoked by this component.

createInfrastructurePolicy() preserves the old methods and adds two readers:

- readFailureWitness(error) returns a frozen finite DTO only for the exact first
  internally thrown error, and only when it is infrastructure-identity. It never
  reads the supplied error's properties. Wrong arity, forged/proxy/other errors
  and earlier non-identity failures yield null; reader misuse is not a fault.
- diagnosticRetainedBytes() reserves320 logical bytes, even after release;
  wrong arity returns null. Future owners must charge this inside the existing
  aggregate32KiB before dispatch, not increase the cap. This is not V8 usage.

The DTO contains only schema, site, role and predicate. Sites are created,
changed, census, worker; roles anchor, ui-root, ui-aim, worker, other; predicates
terminal, type, url, context, attached, parent, opener, duplicate-created,
duplicate-role, duplicate-id, target-capacity, worker-present. Existing private
roles label record checks; already validated allowed roles label new UI checks;
worker admission labels worker even when its type is wrong. No raw identity,
URL, title, hash, time, stack or caller payload enters this DTO. The exact error
reference is privately retained, not decorated, serialized or returned anew.
Projection is best-effort and cannot replace the original thrown error.

Every old entrypoint still runs after a fault; only diagnostic selection is
sticky. release() clears the diagnostic error/witness and old maps; it does not
resurrect the released policy. Original short-circuit order is preserved.
target-capacity remains32 but is unreachable in valid public state: one anchor,
two unique UI roles and at most one worker give at most four retained members.
No private-state fixture is used to manufacture coverage of that branch.

The test authenticates the immutable baseline FILE SHA256
2d0309b15a7a74fe7a440c041a3c7592c7369b67258cb2f46db4c2723e71c07d
before a test-only dynamic import. Invented metadata exercises differential
acceptance/errors/subsequent state, identity branches, descriptor/census/lifetime
negatives, first-error precedence, no-hook readers and pending original
discovery-promise interleavings. No actual discovery command is issued.

Run sequentially from the repository root:

    node --max-old-space-size=64 --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none ./spikes/topic-resolution/harness/experimental/infrastructure-identity-witness-v1/policy.test.mjs

This component does not reproduce the ADR195 failure, repair compatibility,
provide a native parent, authorize a browser diagnostic/study, measure matching
quality or activate canonical/crawler/client/owner controls. All consumed study
sources/maps/output remain immutable; future parent/inventory/actual gates are
separate and unfinished.
