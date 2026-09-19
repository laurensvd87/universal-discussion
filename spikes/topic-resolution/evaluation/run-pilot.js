import { readFile } from "node:fs/promises";

import { evaluatePilot, PilotDatasetError } from "./evaluator.js";

const datasetUrl = new URL("./pilot-pairs.json", import.meta.url);

try {
  const dataset = JSON.parse(await readFile(datasetUrl, "utf8"));
  const report = evaluatePilot(dataset);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} catch (error) {
  if (error instanceof PilotDatasetError || error instanceof SyntaxError) {
    process.stderr.write(`Pilot evaluation failed: ${error.message}\n`);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
