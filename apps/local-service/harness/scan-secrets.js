import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const excluded = new Set(["data", "node_modules"]);
const extensions = new Set([".js", ".json", ".md"]);
const patterns = [
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ["aws-key", /\bAKIA[0-9A-Z]{16}\b/g],
  ["github-token", /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g],
  ["slack-token", /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g],
  ["openai-key", /\bsk-[A-Za-z0-9]{20,}\b/g],
  ["google-key", /\bAIza[0-9A-Za-z_-]{35}\b/g],
];

const samples = [
  ["private-key", ["-----BEGIN ", "PRIVATE KEY-----"].join("")],
  ["aws-key", ["AKIA", "A".repeat(16)].join("")],
  ["github-token", ["ghp_", "A".repeat(20)].join("")],
  ["slack-token", ["xoxb-", "1".repeat(10)].join("")],
  ["openai-key", ["sk-", "A".repeat(20)].join("")],
  ["google-key", ["AIza", "A".repeat(35)].join("")],
];
for (const [expected, sample] of samples) {
  const found = patterns.filter(([, pattern]) => { pattern.lastIndex = 0; return pattern.test(sample); });
  if (found.length !== 1 || found[0][0] !== expected) throw new Error(`Secret scanner self-test failed: ${expected}`);
}

async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && !excluded.has(entry.name)) result.push(...await files(path.join(directory, entry.name)));
    if (entry.isFile() && extensions.has(path.extname(entry.name))) result.push(path.join(directory, entry.name));
  }
  return result;
}

const findings = [];
const scanned = await files(root);
for (const file of scanned) {
  const text = await readFile(file, "utf8");
  for (const [name, pattern] of patterns) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) findings.push({ file: path.relative(root, file), line: text.slice(0, match.index).split("\n").length, pattern: name });
  }
}
if (findings.length) {
  process.stderr.write(`${JSON.stringify({ findings }, null, 2)}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`${JSON.stringify({ filesScanned: scanned.length, findings: 0, selfTestedPatterns: samples.length })}\n`);
}
