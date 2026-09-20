import { readFile } from "node:fs/promises";

import { evaluatePilot, PilotDatasetError } from "./evaluator.js";
import { createExecutionMetadata } from "./execution-metadata.js";

const datasetUrl = new URL("./pilot-pairs.json", import.meta.url);

try {
  const dataset = JSON.parse(await readFile(datasetUrl, "utf8"));
  const evaluationStartedAt = process.hrtime.bigint();
  const report = evaluatePilot(dataset);
  const evaluationElapsedNanoseconds = process.hrtime.bigint() - evaluationStartedAt;
  const output = {
    ...report,
    execution: createExecutionMetadata({
      architecture: process.arch,
      elapsedNanoseconds: evaluationElapsedNanoseconds,
      pairCount: report.sample.pairs,
      platform: process.platform,
      runtimeVersion: process.version,
    }),
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
} catch (error) {
  if (error instanceof PilotDatasetError || error instanceof SyntaxError) {
    process.stderr.write(`Pilot evaluation failed: ${error.message}\n`);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
