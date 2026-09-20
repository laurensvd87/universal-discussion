import { readFile } from "node:fs/promises";

import {
  SplitContractError,
  validatePilotDependencyBlockSplit,
} from "./split-contract.js";
import { PilotDatasetError } from "./evaluator.js";

const datasetUrl = new URL("./pilot-pairs.json", import.meta.url);
const manifestUrl = new URL("./pilot-split-dry-run.json", import.meta.url);

try {
  const [datasetText, manifestText] = await Promise.all([
    readFile(datasetUrl, "utf8"),
    readFile(manifestUrl, "utf8"),
  ]);
  const report = validatePilotDependencyBlockSplit(
    JSON.parse(datasetText),
    JSON.parse(manifestText),
  );
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} catch (error) {
  if (
    error instanceof PilotDatasetError ||
    error instanceof SplitContractError ||
    error instanceof SyntaxError
  ) {
    process.stderr.write(`Split dry run failed: ${error.message}\n`);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
