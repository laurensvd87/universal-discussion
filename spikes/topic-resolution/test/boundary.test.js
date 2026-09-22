import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = path.join(packageDirectory, "src");
const extractionDirectory = path.join(packageDirectory, "extraction");
const browserCoreDirectory = path.join(packageDirectory, "browser", "core");
const browserFixtureDirectory = path.join(packageDirectory, "browser", "fixtures");
const reviewDirectory = path.join(packageDirectory, "review");
const canonicalJsonPath = path.join(
  packageDirectory,
  "evaluation",
  "canonical-json.js",
);
const fixtureManifestPath = path.join(packageDirectory, "fixtures", "manifest.json");

test("runtime modules have no network, DNS, process, filesystem, logging, or dynamic-code capability", async () => {
  const runtimeFiles = [
    ...(
    await Promise.all(
      [
        sourceDirectory,
        extractionDirectory,
        browserCoreDirectory,
        browserFixtureDirectory,
      ].map(async (directory) =>
        (await readdir(directory))
          .filter((name) => name.endsWith(".js"))
          .map((name) => path.join(directory, name)),
      ),
    )
    ).flat(),
    canonicalJsonPath,
  ].sort();
  const runtimeFileSet = new Set(runtimeFiles.map((file) => path.resolve(file)));
  assert.deepEqual(
    runtimeFiles.map((file) =>
      path.relative(packageDirectory, file).replaceAll("\\", "/"),
    ),
    [
      "browser/core/active-tab-controller.js",
      "browser/core/active-tab-policy.js",
      "browser/core/indicator-contract.js",
      "browser/core/indicator-controller.js",
      "browser/fixtures/indicator-fixtures.js",
      "evaluation/canonical-json.js",
      "extraction/html-extraction.js",
      "src/errors.js",
      "src/index.js",
      "src/resolver.js",
      "src/url.js",
    ],
  );

  for (const runtimeFile of runtimeFiles) {
    const source = await readFile(runtimeFile, "utf8");
    const relativeFile = path
      .relative(packageDirectory, runtimeFile)
      .replaceAll("\\", "/");
    const imports = [
      ...source.matchAll(/\bfrom\s+["']([^"']+)["']/g),
      ...source.matchAll(/\bimport\s+["']([^"']+)["']/g),
    ].map((match) => match[1]);

    for (const importedModule of imports) {
      assert.match(
        importedModule,
        /^(?:\.\.?\/.+|node:(?:buffer|crypto|net|util))$/,
        `${relativeFile} imports unexpected capability ${importedModule}`,
      );
      if (importedModule.startsWith(".")) {
        const resolvedImport = path.resolve(path.dirname(runtimeFile), importedModule);
        assert.ok(
          runtimeFileSet.has(resolvedImport),
          `${relativeFile} imports unaudited runtime module ${importedModule}`,
        );
      }
    }

    assert.doesNotMatch(source, /\b(?:fetch|WebSocket|EventSource|XMLHttpRequest)\b/);
    assert.doesNotMatch(source, /\bconsole\s*\./);
    assert.doesNotMatch(source, /\b(?:require|eval|Function)\s*\(/);
    assert.doesNotMatch(source, /\bimport\s*\(/);
    assert.doesNotMatch(source, /\bprocess\s*\./);
    assert.doesNotMatch(
      source,
      /node:(?:child_process|cluster|dgram|dns|fs|http|https|tls|worker_threads)/,
    );
  }

  const urlSource = await readFile(path.join(sourceDirectory, "url.js"), "utf8");
  assert.match(urlSource, /import \{ isIP \} from "node:net";/);
  assert.doesNotMatch(
    urlSource.replace('import { isIP } from "node:net";', ""),
    /node:net|\b(?:connect|createConnection|createServer|Server|Socket)\b/,
  );
});

test("package declares no runtime or development dependencies", async () => {
  const packageJson = JSON.parse(
    await readFile(path.join(packageDirectory, "package.json"), "utf8"),
  );

  assert.equal(packageJson.dependencies, undefined);
  assert.equal(packageJson.devDependencies, undefined);
  assert.equal(packageJson.optionalDependencies, undefined);
  assert.equal(packageJson.peerDependencies, undefined);
});

test("review workflow keeps pure contracts separate from bounded local filesystem adapters", async () => {
  const expectedImports = new Map([
    [
      "review-completion-ledger.js",
      [
        "../evaluation/canonical-json.js",
        "./review-completion-task.js",
        "./review-workflow.js",
      ],
    ],
    [
      "review-completion-task.js",
      [
        "../evaluation/canonical-json.js",
        "../src/url.js",
        "./review-workflow.js",
      ],
    ],
    [
      "review-resolution-journal.js",
      [
        "../evaluation/canonical-json.js",
        "./review-completion-ledger.js",
        "./review-workflow.js",
      ],
    ],
    [
      "review-workflow.js",
      ["../evaluation/canonical-json.js", "../src/url.js"],
    ],
    ["review-tsv.js", ["./review-workflow.js", "node:buffer"]],
    [
      "review-workspace.js",
      ["./review-workflow.js", "node:crypto", "node:fs/promises", "node:path"],
    ],
    [
      "run-review.js",
      [
        "./review-tsv.js",
        "./review-workflow.js",
        "./review-workspace.js",
        "node:fs/promises",
        "node:path",
        "node:process",
        "node:readline/promises",
        "node:url",
      ],
    ],
  ]);

  const actualFiles = (await readdir(reviewDirectory))
    .filter((name) => name.endsWith(".js"))
    .sort();
  assert.deepEqual(actualFiles, [...expectedImports.keys()].sort());

  for (const file of actualFiles) {
    const source = await readFile(path.join(reviewDirectory, file), "utf8");
    const imports = [
      ...source.matchAll(/\bfrom\s+["']([^"']+)["']/g),
      ...source.matchAll(/\bimport\s+["']([^"']+)["']/g),
    ]
      .map((match) => match[1])
      .sort();
    assert.deepEqual(imports, [...expectedImports.get(file)].sort(), file);
    assert.doesNotMatch(source, /\b(?:fetch|WebSocket|EventSource|XMLHttpRequest)\b/, file);
    assert.doesNotMatch(source, /\bconsole\s*\./, file);
    assert.doesNotMatch(source, /\b(?:require|eval|Function)\s*\(/, file);
    assert.doesNotMatch(source, /\bimport\s*\(/, file);
    assert.doesNotMatch(
      source,
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u,
      `${file} must use visible escape notation for control characters`,
    );
    assert.doesNotMatch(
      source,
      /node:(?:child_process|cluster|dgram|dns|http|https|tls|worker_threads)/,
      file,
    );
    assert.doesNotMatch(
      source,
      /(?:corpus-contract|split-contract|evaluation-policy|prediction-contract|result-evaluator|evaluator)\.js/,
      file,
    );
  }

  for (const pureFile of [
    "review-completion-ledger.js",
    "review-completion-task.js",
    "review-resolution-journal.js",
    "review-workflow.js",
    "review-tsv.js",
  ]) {
    const source = await readFile(path.join(reviewDirectory, pureFile), "utf8");
    assert.doesNotMatch(source, /node:(?:fs|path|process|readline)/, pureFile);
    assert.doesNotMatch(source, /\bprocess\s*\./, pureFile);
  }

  const packageJson = JSON.parse(
    await readFile(path.join(packageDirectory, "package.json"), "utf8"),
  );
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(packageJson.scripts).filter(([name]) => name.startsWith("review")),
    ),
    {
      review: "node review/run-review.js",
      "review:owner": "node review/run-review.js owner",
      "review:prepare": "node review/run-review.js prepare",
      "review:status": "node review/run-review.js status",
    },
  );
});

test("fixture inventory records synthetic provenance and minimum-data review", async () => {
  const manifest = JSON.parse(await readFile(fixtureManifestPath, "utf8"));
  assert.equal(manifest.manifestVersion, "fixture-provenance/1.3.0");
  assert.equal(manifest.reviewedAt, "2026-09-22T12:00:00.000Z");
  assert.equal(new Date(manifest.reviewedAt).toISOString(), manifest.reviewedAt);
  assert.deepEqual(
    manifest.entries.map((entry) => entry.path).sort(),
    [
      "browser/fixtures/indicator-fixtures.js",
      "evaluation/pilot-pairs.json",
      "evaluation/pilot-split-dry-run.json",
      "fixtures/html/harbor-barrier.html",
      "fixtures/observations.js",
      "review/fixtures/synthetic-config.tsv",
      "review/fixtures/synthetic-pairs.tsv",
      "review/fixtures/synthetic-sources.tsv",
    ],
  );

  for (const entry of manifest.entries) {
    assert.equal(entry.provenance, "project-created-synthetic", entry.path);
    assert.equal(entry.containsCopiedText, false, entry.path);
    assert.equal(entry.containsPersonalData, false, entry.path);
    assert.equal(entry.containsPrivateUrl, false, entry.path);
    assert.equal(entry.containsSecret, false, entry.path);
    assert.equal(entry.minimumDataForTest, true, entry.path);
    assert.ok(entry.purpose.length > 0 && entry.purpose.length <= 128, entry.path);

    const content = await readFile(path.join(packageDirectory, entry.path), "utf8");
    assert.doesNotMatch(content, /-----BEGIN [A-Z ]*PRIVATE KEY-----/);
    assert.doesNotMatch(content, /\bAKIA[0-9A-Z]{16}\b/);
    assert.doesNotMatch(content, /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/);
    assert.doesNotMatch(content, /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/);
  }
});
