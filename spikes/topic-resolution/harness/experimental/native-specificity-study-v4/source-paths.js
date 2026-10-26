// ADR184 successor literal allowlist; ADR179/180/181 contracts remain bound.
// Source-only inventory: fresh complete review and authorization are required.
// Python may parse ONLY this fixed CODE literal before any Node module import.
export const SOURCE_PATHS=Object.freeze([
  "apps/local-service/experiments/topic-encoder/builder-scoped-root-rank-candidate-v1/scorer.js",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-broad-heads-v1/vector-packet.js",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-complete-path-assessment-v1/assessment.js",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-evaluation-v1/contracts.js",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/README.md",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/contracts.test.js",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/fit.js",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/manifest.js",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/methods.js",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/methods.test.js",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/producer-profiles.js",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/producer-profiles.test.js",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/protocol.json",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/supervise.py",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-paired-v1/taxonomy.js",
  "apps/local-service/experiments/topic-encoder/hierarchical-e5-pooled-root-rank-dev-v1/rank-policy.js",
  "apps/local-service/experiments/topic-encoder/hierarchical-public-capture-v2/robots-deny-space-repair.js",
  "apps/local-service/experiments/topic-encoder/native-local-detail-calibration-v1/fit.js",
  "apps/local-service/experiments/topic-encoder/native-root-rank-candidate-v1/scorer.js",
  "apps/local-service/experiments/topic-encoder/native-specificity-panel-v1/README.md",
  "apps/local-service/experiments/topic-encoder/native-specificity-panel-v1/panel.js",
  "apps/local-service/experiments/topic-encoder/native-specificity-panel-v1/panel.test.js",
  "apps/local-service/package.json",
  "apps/local-service/src/crawler/packaged-e5.js",
  "apps/local-service/src/crawler/public-fetch.js",
  "apps/local-service/src/crawler/robots.js",
  "apps/local-service/src/crawler/static-capture.js",
  "apps/local-service/src/domain/experimental/native-root-local-detail-transfer-v1/adapter.js",
  "apps/local-service/src/domain/hierarchical-e5-local-evidence.js",
  "apps/local-service/src/domain/hierarchical-e5-paired-input.js",
  "apps/local-service/src/domain/hierarchical-e5-paired-linear-heads.js",
  "decisions/ADR-179-native-specificity-study.md",
  "decisions/ADR-180-native-specificity-failure-recovery.md",
  "decisions/ADR-181-native-specificity-resource-diagnostics.md",
  "decisions/ADR-184-complete-owned-job-enumeration.md",
  "spikes/topic-resolution/browser/chromium/page-content-reader.js",
  "spikes/topic-resolution/browser/core/page-content-policy.js",
  "spikes/topic-resolution/browser/embedding/embedding-contract.js",
  "spikes/topic-resolution/harness/current-producer-final-v1/manifest.js",
  "spikes/topic-resolution/harness/current-producer-final-v2/policy.js",
  "spikes/topic-resolution/harness/deny-external-capabilities.js",
  "spikes/topic-resolution/harness/experimental/composed-owned-bootstrap-dev-v1/run.py",
  "spikes/topic-resolution/harness/experimental/exact-browser-infrastructure-v1/compatibility-variant.mjs",
  "spikes/topic-resolution/harness/experimental/growing-owned-job-census-v1/census.py",
  "spikes/topic-resolution/harness/experimental/native-bootstrap-process-dev-v1/run.py",
  "spikes/topic-resolution/harness/experimental/native-console-baseline-dev-v1/baseline.py",
  "spikes/topic-resolution/harness/experimental/native-extension-startup-dev-v1/run.mjs",
  "spikes/topic-resolution/harness/experimental/native-reader-transfer-v1/artifact-reuse.js",
  "spikes/topic-resolution/harness/experimental/native-reader-transfer-v1/browser-capture.mjs",
  "spikes/topic-resolution/harness/experimental/native-reader-transfer-v1/native-adapter.js",
  "spikes/topic-resolution/harness/experimental/native-reader-transfer-v1/native-rights.js",
  "spikes/topic-resolution/harness/experimental/native-reader-transfer-v1/network-policy.js",
  "spikes/topic-resolution/harness/experimental/native-reader-transfer-v1/producer-profile.js",
  "spikes/topic-resolution/harness/experimental/native-reader-transfer-v1/source-ledger.js",
  "spikes/topic-resolution/harness/experimental/native-reader-transfer-v1/source-paths.js",
  "spikes/topic-resolution/harness/experimental/native-specificity-public-journey-v1/journey.mjs",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/README-capture.md",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/README-driver.md",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/README-execution.md",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/README-guardian.md",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/README-io.md",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/README-pacing.md",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/README-pipe-channel.md",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/README-reference-builder.md",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/README-reference-codec.md",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/README-run.md",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/README-semantic.md",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/README-source-ledger.md",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/README-stage.md",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/README-test-admission.md",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/article-owner.mjs",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/artifact-reuse.js",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/artifact-reuse.test.mjs",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/browser-capture.mjs",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/capture.test.mjs",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/cohort.js",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/cohort.test.mjs",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/dns-resolver.js",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/driver.mjs",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/driver.test.mjs",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/execute.mjs",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/execute.test.mjs",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/guardian.py",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/guardian.test.mjs",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/io.mjs",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/io.test.mjs",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/manifest.js",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/manifest.json",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/manifest.test.mjs",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/native-adapter.js",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/network-policy.js",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/origin-policy.js",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/pacing.mjs",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/pacing.test.mjs",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/pipe-channel.mjs",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/pipe-channel.test.mjs",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/producer-profile.js",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/producer-profile.test.mjs",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/protocol.json",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/protocol.test.mjs",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/reference-builder.js",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/reference-builder.test.mjs",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/reference-codec.js",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/reference-codec.test.mjs",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/run.mjs",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/run.test.mjs",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/source-ledger.js",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/source-ledger.test.mjs",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/source-paths.js",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/stage.js",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/stage.test.mjs",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/supervise.py",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/supervise.test.mjs",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/test-admission.js",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/test-admission.test.mjs",
  "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/worker.js",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/package-lock.json",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/package.json",
  "spikes/topic-resolution/harness/experimental/playwright-route-coordinator-v1/coordinator.mjs",
  "spikes/topic-resolution/package.json"
]);

function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
// Non-CODE paths are fixed kinds: no path is selected from evidence JSON.
// assetManifest's independent encoder binding authenticates its bytes before parse.
export const SOURCE_CATALOG=freeze({
  "schema": "native-specificity-source-catalog/v1",
  "entries": [
    {
      "key": "apps/local-service/experiments/topic-encoder/builder-scoped-root-rank-candidate-v1/scorer.js",
      "path": "apps/local-service/experiments/topic-encoder/builder-scoped-root-rank-candidate-v1/scorer.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "apps/local-service/experiments/topic-encoder/hierarchical-e5-broad-heads-v1/vector-packet.js",
      "path": "apps/local-service/experiments/topic-encoder/hierarchical-e5-broad-heads-v1/vector-packet.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "apps/local-service/experiments/topic-encoder/hierarchical-e5-complete-path-assessment-v1/assessment.js",
      "path": "apps/local-service/experiments/topic-encoder/hierarchical-e5-complete-path-assessment-v1/assessment.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-evaluation-v1/contracts.js",
      "path": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-evaluation-v1/contracts.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/README.md",
      "path": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/README.md",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/contracts.test.js",
      "path": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/contracts.test.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/fit.js",
      "path": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/fit.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/manifest.js",
      "path": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/manifest.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/methods.js",
      "path": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/methods.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/methods.test.js",
      "path": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/methods.test.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/producer-profiles.js",
      "path": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/producer-profiles.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/producer-profiles.test.js",
      "path": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/producer-profiles.test.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/protocol.json",
      "path": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/protocol.json",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/supervise.py",
      "path": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/supervise.py",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "apps/local-service/experiments/topic-encoder/hierarchical-e5-paired-v1/taxonomy.js",
      "path": "apps/local-service/experiments/topic-encoder/hierarchical-e5-paired-v1/taxonomy.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "apps/local-service/experiments/topic-encoder/hierarchical-e5-pooled-root-rank-dev-v1/rank-policy.js",
      "path": "apps/local-service/experiments/topic-encoder/hierarchical-e5-pooled-root-rank-dev-v1/rank-policy.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "apps/local-service/experiments/topic-encoder/hierarchical-public-capture-v2/robots-deny-space-repair.js",
      "path": "apps/local-service/experiments/topic-encoder/hierarchical-public-capture-v2/robots-deny-space-repair.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "apps/local-service/experiments/topic-encoder/native-local-detail-calibration-v1/fit.js",
      "path": "apps/local-service/experiments/topic-encoder/native-local-detail-calibration-v1/fit.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "apps/local-service/experiments/topic-encoder/native-root-rank-candidate-v1/scorer.js",
      "path": "apps/local-service/experiments/topic-encoder/native-root-rank-candidate-v1/scorer.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "apps/local-service/experiments/topic-encoder/native-specificity-panel-v1/README.md",
      "path": "apps/local-service/experiments/topic-encoder/native-specificity-panel-v1/README.md",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "apps/local-service/experiments/topic-encoder/native-specificity-panel-v1/panel.js",
      "path": "apps/local-service/experiments/topic-encoder/native-specificity-panel-v1/panel.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "apps/local-service/experiments/topic-encoder/native-specificity-panel-v1/panel.test.js",
      "path": "apps/local-service/experiments/topic-encoder/native-specificity-panel-v1/panel.test.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "apps/local-service/package.json",
      "path": "apps/local-service/package.json",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "apps/local-service/src/crawler/packaged-e5.js",
      "path": "apps/local-service/src/crawler/packaged-e5.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "apps/local-service/src/crawler/public-fetch.js",
      "path": "apps/local-service/src/crawler/public-fetch.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "apps/local-service/src/crawler/robots.js",
      "path": "apps/local-service/src/crawler/robots.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "apps/local-service/src/crawler/static-capture.js",
      "path": "apps/local-service/src/crawler/static-capture.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "apps/local-service/src/domain/experimental/native-root-local-detail-transfer-v1/adapter.js",
      "path": "apps/local-service/src/domain/experimental/native-root-local-detail-transfer-v1/adapter.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "apps/local-service/src/domain/hierarchical-e5-local-evidence.js",
      "path": "apps/local-service/src/domain/hierarchical-e5-local-evidence.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "apps/local-service/src/domain/hierarchical-e5-paired-input.js",
      "path": "apps/local-service/src/domain/hierarchical-e5-paired-input.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "apps/local-service/src/domain/hierarchical-e5-paired-linear-heads.js",
      "path": "apps/local-service/src/domain/hierarchical-e5-paired-linear-heads.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "decisions/ADR-179-native-specificity-study.md",
      "path": "decisions/ADR-179-native-specificity-study.md",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "decisions/ADR-180-native-specificity-failure-recovery.md",
      "path": "decisions/ADR-180-native-specificity-failure-recovery.md",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "decisions/ADR-181-native-specificity-resource-diagnostics.md",
      "path": "decisions/ADR-181-native-specificity-resource-diagnostics.md",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "decisions/ADR-184-complete-owned-job-enumeration.md",
      "path": "decisions/ADR-184-complete-owned-job-enumeration.md",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/browser/chromium/page-content-reader.js",
      "path": "spikes/topic-resolution/browser/chromium/page-content-reader.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/browser/core/page-content-policy.js",
      "path": "spikes/topic-resolution/browser/core/page-content-policy.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/browser/embedding/embedding-contract.js",
      "path": "spikes/topic-resolution/browser/embedding/embedding-contract.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/current-producer-final-v1/manifest.js",
      "path": "spikes/topic-resolution/harness/current-producer-final-v1/manifest.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/current-producer-final-v2/policy.js",
      "path": "spikes/topic-resolution/harness/current-producer-final-v2/policy.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/deny-external-capabilities.js",
      "path": "spikes/topic-resolution/harness/deny-external-capabilities.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/composed-owned-bootstrap-dev-v1/run.py",
      "path": "spikes/topic-resolution/harness/experimental/composed-owned-bootstrap-dev-v1/run.py",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/exact-browser-infrastructure-v1/compatibility-variant.mjs",
      "path": "spikes/topic-resolution/harness/experimental/exact-browser-infrastructure-v1/compatibility-variant.mjs",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/growing-owned-job-census-v1/census.py",
      "path": "spikes/topic-resolution/harness/experimental/growing-owned-job-census-v1/census.py",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-bootstrap-process-dev-v1/run.py",
      "path": "spikes/topic-resolution/harness/experimental/native-bootstrap-process-dev-v1/run.py",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-console-baseline-dev-v1/baseline.py",
      "path": "spikes/topic-resolution/harness/experimental/native-console-baseline-dev-v1/baseline.py",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-extension-startup-dev-v1/run.mjs",
      "path": "spikes/topic-resolution/harness/experimental/native-extension-startup-dev-v1/run.mjs",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-reader-transfer-v1/artifact-reuse.js",
      "path": "spikes/topic-resolution/harness/experimental/native-reader-transfer-v1/artifact-reuse.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-reader-transfer-v1/browser-capture.mjs",
      "path": "spikes/topic-resolution/harness/experimental/native-reader-transfer-v1/browser-capture.mjs",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-reader-transfer-v1/native-adapter.js",
      "path": "spikes/topic-resolution/harness/experimental/native-reader-transfer-v1/native-adapter.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-reader-transfer-v1/native-rights.js",
      "path": "spikes/topic-resolution/harness/experimental/native-reader-transfer-v1/native-rights.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-reader-transfer-v1/network-policy.js",
      "path": "spikes/topic-resolution/harness/experimental/native-reader-transfer-v1/network-policy.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-reader-transfer-v1/producer-profile.js",
      "path": "spikes/topic-resolution/harness/experimental/native-reader-transfer-v1/producer-profile.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-reader-transfer-v1/source-ledger.js",
      "path": "spikes/topic-resolution/harness/experimental/native-reader-transfer-v1/source-ledger.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-reader-transfer-v1/source-paths.js",
      "path": "spikes/topic-resolution/harness/experimental/native-reader-transfer-v1/source-paths.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-public-journey-v1/journey.mjs",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-public-journey-v1/journey.mjs",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/README-capture.md",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/README-capture.md",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/README-driver.md",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/README-driver.md",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/README-execution.md",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/README-execution.md",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/README-guardian.md",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/README-guardian.md",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/README-io.md",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/README-io.md",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/README-pacing.md",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/README-pacing.md",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/README-pipe-channel.md",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/README-pipe-channel.md",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/README-reference-builder.md",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/README-reference-builder.md",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/README-reference-codec.md",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/README-reference-codec.md",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/README-run.md",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/README-run.md",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/README-semantic.md",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/README-semantic.md",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/README-source-ledger.md",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/README-source-ledger.md",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/README-stage.md",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/README-stage.md",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/README-test-admission.md",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/README-test-admission.md",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/article-owner.mjs",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/article-owner.mjs",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/artifact-reuse.js",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/artifact-reuse.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/artifact-reuse.test.mjs",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/artifact-reuse.test.mjs",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/browser-capture.mjs",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/browser-capture.mjs",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/capture.test.mjs",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/capture.test.mjs",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/cohort.js",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/cohort.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/cohort.test.mjs",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/cohort.test.mjs",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/dns-resolver.js",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/dns-resolver.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/driver.mjs",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/driver.mjs",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/driver.test.mjs",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/driver.test.mjs",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/execute.mjs",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/execute.mjs",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/execute.test.mjs",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/execute.test.mjs",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/guardian.py",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/guardian.py",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/guardian.test.mjs",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/guardian.test.mjs",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/io.mjs",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/io.mjs",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/io.test.mjs",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/io.test.mjs",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/manifest.js",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/manifest.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/manifest.json",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/manifest.json",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/manifest.test.mjs",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/manifest.test.mjs",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/native-adapter.js",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/native-adapter.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/network-policy.js",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/network-policy.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/origin-policy.js",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/origin-policy.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/pacing.mjs",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/pacing.mjs",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/pacing.test.mjs",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/pacing.test.mjs",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/pipe-channel.mjs",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/pipe-channel.mjs",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/pipe-channel.test.mjs",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/pipe-channel.test.mjs",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/producer-profile.js",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/producer-profile.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/producer-profile.test.mjs",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/producer-profile.test.mjs",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/protocol.json",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/protocol.json",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/protocol.test.mjs",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/protocol.test.mjs",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/reference-builder.js",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/reference-builder.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/reference-builder.test.mjs",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/reference-builder.test.mjs",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/reference-codec.js",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/reference-codec.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/reference-codec.test.mjs",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/reference-codec.test.mjs",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/run.mjs",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/run.mjs",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/run.test.mjs",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/run.test.mjs",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/source-ledger.js",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/source-ledger.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/source-ledger.test.mjs",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/source-ledger.test.mjs",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/source-paths.js",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/source-paths.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/stage.js",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/stage.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/stage.test.mjs",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/stage.test.mjs",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/supervise.py",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/supervise.py",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/supervise.test.mjs",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/supervise.test.mjs",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/test-admission.js",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/test-admission.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/test-admission.test.mjs",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/test-admission.test.mjs",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/worker.js",
      "path": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/worker.js",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/playwright-dev-v1/package-lock.json",
      "path": "spikes/topic-resolution/harness/experimental/playwright-dev-v1/package-lock.json",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/playwright-dev-v1/package.json",
      "path": "spikes/topic-resolution/harness/experimental/playwright-dev-v1/package.json",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/harness/experimental/playwright-route-coordinator-v1/coordinator.mjs",
      "path": "spikes/topic-resolution/harness/experimental/playwright-route-coordinator-v1/coordinator.mjs",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "spikes/topic-resolution/package.json",
      "path": "spikes/topic-resolution/package.json",
      "kind": "code",
      "maximumBytes": 4194304,
      "sha256": null
    },
    {
      "key": "metadata:candidates",
      "path": "apps/local-service/data/hierarchy-native-detail-candidates-adr159.json",
      "kind": "metadata",
      "maximumBytes": 262144,
      "sha256": "b0443d0da3af034d715e83f56494eaf5512397295b74fa277ffc28bb70031d23"
    },
    {
      "key": "metadata:curation",
      "path": "apps/local-service/data/hierarchy-native-detail-curation-adr159.json",
      "kind": "metadata",
      "maximumBytes": 262144,
      "sha256": "9b36fcf752cbb43e8518f5669008e3e1de4ffbb72dac71af4a630fcdb3ca3e8c"
    },
    {
      "key": "metadata:trainCalReview",
      "path": "apps/local-service/data/hierarchy-native-detail-train-cal-independent-review-20261020.json",
      "kind": "metadata",
      "maximumBytes": 262144,
      "sha256": "2e93ea0e8e3b189191fc740f963a433447193832666d65afb0c8fa9ed4357adb"
    },
    {
      "key": "metadata:testReview",
      "path": "apps/local-service/data/hierarchy-native-detail-test-independent-review-20261020.json",
      "kind": "metadata",
      "maximumBytes": 262144,
      "sha256": "e9be0c1419006ffb256b910c0c00debb5c593def2ce7978b585adc0f857399cd"
    },
    {
      "key": "metadata:finalReview",
      "path": "apps/local-service/data/hierarchy-native-detail-final-label-review-adr176.json",
      "kind": "metadata",
      "maximumBytes": 262144,
      "sha256": "bfbc710dc8c9b6a49ac45d618654c9ebb9b72c922cb365572986fff72a7070ba"
    },
    {
      "key": "artifact:freezeBytes",
      "path": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/freeze.json",
      "kind": "artifact",
      "maximumBytes": 65536,
      "sha256": "ddee567ad132299dc130f01da77d77bae3fd18a7ad7c222a276de1384ef9c894"
    },
    {
      "key": "artifact:supervisorBytes",
      "path": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/output/supervisor.json",
      "kind": "artifact",
      "maximumBytes": 65536,
      "sha256": "c5b1073a5cf9c71412e0d43488ecae008474b39276c5a43c67bec8efd7ee766e"
    },
    {
      "key": "artifact:selectionReceiptBytes",
      "path": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/output/selection-receipt.json",
      "kind": "artifact",
      "maximumBytes": 65536,
      "sha256": "88b87fc555c4e456bfb1a7ab23c93fcffa75de8d51b453df0f861324e3a0ae4f"
    },
    {
      "key": "artifact:selectionBytes",
      "path": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/output/selection.json",
      "kind": "artifact",
      "maximumBytes": 262144,
      "sha256": "d5bc132ac6182046830822f98e16710b5a8ccad176a461f8e8613fde5661e0de"
    },
    {
      "key": "artifact:modelBytes",
      "path": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/output/root-model.json",
      "kind": "artifact",
      "maximumBytes": 262144,
      "sha256": "442ceb797e071f13ea4bc25df701846d2f167a7deb3e60de31711da8bdec7451"
    },
    {
      "key": "artifact:policyBytes",
      "path": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/output/root-policy.json",
      "kind": "artifact",
      "maximumBytes": 65536,
      "sha256": "309afc18b29695640f4f15d8138d75ad002768f4e0b13d47df902e3d8bb6b546"
    },
    {
      "key": "artifact:inputDefinitionBytes",
      "path": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/output/input-definition.json",
      "kind": "artifact",
      "maximumBytes": 16384,
      "sha256": "2ec96c1244761b9688e5fea2a2dec168df1ac961aa2d440fcd42bdb085e6096c"
    },
    {
      "key": "assetManifest",
      "path": "spikes/topic-resolution/browser/embedding/.assets/manifest.json",
      "kind": "asset-manifest",
      "maximumBytes": 16384,
      "sha256": null
    },
    {
      "key": "packageBaseline",
      "path": "spikes/topic-resolution/harness/experimental/playwright-route-burst-dev-v1/freeze.json",
      "kind": "package-baseline",
      "maximumBytes": 65536,
      "sha256": "908ed69a9b1e42ed6fb0de7ac0d0862ffb5fe8964cf368701cb442085e1091bb"
    }
  ],
  "metadata": {
    "candidates": "metadata:candidates",
    "curation": "metadata:curation",
    "trainCalReview": "metadata:trainCalReview",
    "testReview": "metadata:testReview",
    "finalReview": "metadata:finalReview"
  },
  "artifacts": {
    "freezeBytes": "artifact:freezeBytes",
    "supervisorBytes": "artifact:supervisorBytes",
    "selectionReceiptBytes": "artifact:selectionReceiptBytes",
    "selectionBytes": "artifact:selectionBytes",
    "modelBytes": "artifact:modelBytes",
    "policyBytes": "artifact:policyBytes",
    "inputDefinitionBytes": "artifact:inputDefinitionBytes"
  },
  "assetManifestKey": "assetManifest",
  "package": {
    "rootKey": "spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core",
    "prefix": "node_modules/playwright-core/",
    "baselineKey": "packageBaseline",
    "lockfileKey": "spikes/topic-resolution/harness/experimental/playwright-dev-v1/package-lock.json",
    "version": "1.64.1",
    "integrity": "sha512-BC4s8y6SEVA6Q1rSxZTto8hI1KUI3xXlHGZgvGqP4IqPdI/a6FX9H29IDNz7vKo9l21b6LfYosScPL6M3xxyDQ==",
    "files": 115,
    "bytes": 13656167
  },
  "producerSourceAliases": {
    "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/native-adapter.js": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/native-adapter.js",
    "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/worker.js": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/worker.js",
    "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/manifest.json": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/manifest.json",
    "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/network-policy.js": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/network-policy.js",
    "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/dns-resolver.js": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/dns-resolver.js",
    "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/origin-policy.js": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/origin-policy.js",
    "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/article-owner.mjs": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/article-owner.mjs",
    "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/browser-capture.mjs": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/browser-capture.mjs",
    "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/manifest.js": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/manifest.js",
    "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/cohort.js": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/cohort.js",
    "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/producer-profile.js": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/producer-profile.js",
    "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/reference-builder.js": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/reference-builder.js",
    "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/artifact-reuse.js": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/artifact-reuse.js",
    "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/protocol.json": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/protocol.json",
    "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/run.mjs": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/run.mjs",
    "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/stage.js": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/stage.js",
    "spikes/topic-resolution/harness/experimental/native-specificity-public-journey-v1/journey.mjs": "spikes/topic-resolution/harness/experimental/native-specificity-public-journey-v1/journey.mjs",
    "spikes/topic-resolution/harness/experimental/native-reader-transfer-v1/native-rights.js": "spikes/topic-resolution/harness/experimental/native-reader-transfer-v1/native-rights.js",
    "spikes/topic-resolution/harness/experimental/playwright-route-coordinator-v1/coordinator.mjs": "spikes/topic-resolution/harness/experimental/playwright-route-coordinator-v1/coordinator.mjs",
    "spikes/topic-resolution/harness/experimental/exact-browser-infrastructure-v1/compatibility-variant.mjs": "spikes/topic-resolution/harness/experimental/exact-browser-infrastructure-v1/compatibility-variant.mjs",
    "spikes/topic-resolution/browser/chromium/page-content-reader.js": "spikes/topic-resolution/browser/chromium/page-content-reader.js",
    "spikes/topic-resolution/browser/core/page-content-policy.js": "spikes/topic-resolution/browser/core/page-content-policy.js",
    "spikes/topic-resolution/browser/embedding/embedding-contract.js": "spikes/topic-resolution/browser/embedding/embedding-contract.js",
    "apps/local-service/src/crawler/packaged-e5.js": "apps/local-service/src/crawler/packaged-e5.js",
    "apps/local-service/src/crawler/public-fetch.js": "apps/local-service/src/crawler/public-fetch.js",
    "apps/local-service/src/crawler/robots.js": "apps/local-service/src/crawler/robots.js",
    "apps/local-service/experiments/topic-encoder/hierarchical-public-capture-v2/robots-deny-space-repair.js": "apps/local-service/experiments/topic-encoder/hierarchical-public-capture-v2/robots-deny-space-repair.js",
    "apps/local-service/experiments/topic-encoder/native-root-rank-candidate-v1/scorer.js": "apps/local-service/experiments/topic-encoder/native-root-rank-candidate-v1/scorer.js",
    "apps/local-service/src/domain/hierarchical-e5-paired-input.js": "apps/local-service/src/domain/hierarchical-e5-paired-input.js"
  },
  "oldSourceAliases": {
    "fit.js": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/fit.js",
    "contracts.test.js": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/contracts.test.js",
    "protocol.json": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/protocol.json",
    "supervise.py": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/supervise.py",
    "manifest.js": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/manifest.js",
    "methods.js": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/methods.js",
    "methods.test.js": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/methods.test.js",
    "README.md": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/README.md",
    "producer-profiles.js": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/producer-profiles.js",
    "producer-profiles.test.js": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/producer-profiles.test.js",
    "../builder-scoped-root-rank-candidate-v1/scorer.js": "apps/local-service/experiments/topic-encoder/builder-scoped-root-rank-candidate-v1/scorer.js",
    "../../../src/domain/hierarchical-e5-paired-input.js": "apps/local-service/src/domain/hierarchical-e5-paired-input.js",
    "../../../src/domain/hierarchical-e5-paired-linear-heads.js": "apps/local-service/src/domain/hierarchical-e5-paired-linear-heads.js",
    "../hierarchical-e5-pooled-root-rank-dev-v1/rank-policy.js": "apps/local-service/experiments/topic-encoder/hierarchical-e5-pooled-root-rank-dev-v1/rank-policy.js",
    "../hierarchical-e5-broad-heads-v1/vector-packet.js": "apps/local-service/experiments/topic-encoder/hierarchical-e5-broad-heads-v1/vector-packet.js",
    "../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js": "spikes/topic-resolution/harness/deny-external-capabilities.js"
  },
  "protocolSourceKey": "spikes/topic-resolution/harness/experimental/native-specificity-study-v4/protocol.json",
  "embeddingContractSourceKey": "spikes/topic-resolution/browser/embedding/embedding-contract.js",
  "bindings": {
    "panelIdentity": "ba797b2e90fa58a1ac14af943db66435bef5aba10ba893af00e19e377c48e608",
    "encoderHash": "76332323c22d9523de1c54e45bbec0ea762b9c259b10775f5ccb4cbad13a9cd3"
  }
});

