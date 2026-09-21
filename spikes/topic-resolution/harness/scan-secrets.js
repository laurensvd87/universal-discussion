import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scannedExtensions = new Set([".html", ".js", ".json", ".md"]);
const excludedDirectories = new Set([".git", "node_modules"]);
const scannerVersion = "high-confidence-local/1.0.0";
const patterns = [
  {
    name: "private-key-block",
    expression: new RegExp(
      ["-----BEGIN ", "(?:RSA |EC |OPENSSH )?", "PRIVATE KEY-----"].join(""),
      "g",
    ),
  },
  { name: "aws-access-key", expression: /\bAKIA[0-9A-Z]{16}\b/g },
  {
    name: "github-token",
    expression: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g,
  },
  { name: "slack-token", expression: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { name: "openai-style-key", expression: /\bsk-[A-Za-z0-9]{20,}\b/g },
  { name: "google-api-key", expression: /\bAIza[0-9A-Za-z_-]{35}\b/g },
];

function scanText(content, file) {
  const findings = [];
  for (const { name, expression } of patterns) {
    expression.lastIndex = 0;
    for (const match of content.matchAll(expression)) {
      findings.push({
        file,
        line: content.slice(0, match.index).split("\n").length,
        pattern: name,
      });
    }
  }
  return findings;
}

function exitCodeFor(findings) {
  return findings.length > 0 ? 1 : 0;
}

function selfTestPatterns() {
  const samples = new Map([
    ["private-key-block", ["-----BEGIN ", "PRIVATE KEY-----"].join("")],
    ["aws-access-key", ["AKIA", "A".repeat(16)].join("")],
    ["github-token", ["ghp_", "A".repeat(20)].join("")],
    ["slack-token", ["xoxb-", "1".repeat(10)].join("")],
    ["openai-style-key", ["sk-", "A".repeat(20)].join("")],
    ["google-api-key", ["AIza", "A".repeat(35)].join("")],
  ]);

  for (const [expectedPattern, sample] of samples) {
    const detected = scanText(sample, "<self-test>");
    if (
      detected.length !== 1 ||
      detected[0].pattern !== expectedPattern ||
      exitCodeFor(detected) !== 1 ||
      Object.keys(detected[0]).sort().join(",") !== "file,line,pattern"
    ) {
      throw new Error(`Secret scanner self-test failed for ${expectedPattern}`);
    }
  }

  const cleanFindings = scanText("ordinary fixture text", "<self-test>");
  if (cleanFindings.length !== 0 || exitCodeFor(cleanFindings) !== 0) {
    throw new Error("Secret scanner self-test produced a false positive for ordinary text");
  }

  return samples.size;
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!excludedDirectories.has(entry.name)) {
        files.push(...(await listFiles(path.join(directory, entry.name))));
      }
    } else if (entry.isFile() && scannedExtensions.has(path.extname(entry.name))) {
      files.push(path.join(directory, entry.name));
    }
  }
  return files;
}

const selfTestedPatterns = selfTestPatterns();
const files = (await listFiles(packageDirectory)).sort();
const findings = [];
for (const file of files) {
  const content = await readFile(file, "utf8");
  findings.push(
    ...scanText(content, path.relative(packageDirectory, file).replaceAll("\\", "/")),
  );
}

const exitCode = exitCodeFor(findings);
if (exitCode !== 0) {
  process.stderr.write(`${JSON.stringify({ findings }, null, 2)}\n`);
  process.exitCode = exitCode;
} else {
  process.stdout.write(
    `${JSON.stringify({ filesScanned: files.length, findings: 0, scanner: scannerVersion, selfTestedPatterns })}\n`,
  );
}
