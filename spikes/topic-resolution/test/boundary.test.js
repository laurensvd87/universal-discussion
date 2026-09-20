import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = path.join(packageDirectory, "src");
const fixtureManifestPath = path.join(packageDirectory, "fixtures", "manifest.json");

test("source has no network, DNS, process, filesystem, or dynamic-code capability", async () => {
  const sourceFiles = (await readdir(sourceDirectory))
    .filter((name) => name.endsWith(".js"))
    .sort();

  for (const sourceFile of sourceFiles) {
    const source = await readFile(path.join(sourceDirectory, sourceFile), "utf8");
    const imports = [
      ...source.matchAll(/\bfrom\s+["']([^"']+)["']/g),
      ...source.matchAll(/\bimport\s+["']([^"']+)["']/g),
    ].map((match) => match[1]);

    for (const importedModule of imports) {
      assert.match(
        importedModule,
        /^(?:\.\/.+|node:(?:buffer|crypto|net))$/,
        `${sourceFile} imports unexpected capability ${importedModule}`,
      );
    }

    assert.doesNotMatch(source, /\b(?:fetch|WebSocket|EventSource|XMLHttpRequest)\b/);
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

test("fixture inventory records synthetic provenance and minimum-data review", async () => {
  const manifest = JSON.parse(await readFile(fixtureManifestPath, "utf8"));
  assert.equal(manifest.manifestVersion, "fixture-provenance/1.0.0");
  assert.equal(new Date(manifest.reviewedAt).toISOString(), manifest.reviewedAt);
  assert.deepEqual(
    manifest.entries.map((entry) => entry.path).sort(),
    [
      "evaluation/pilot-pairs.json",
      "evaluation/pilot-split-dry-run.json",
      "fixtures/observations.js",
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
