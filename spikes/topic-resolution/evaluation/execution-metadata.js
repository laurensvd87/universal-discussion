const MEASURED_SCOPE = "in-process evaluatePilot; excludes file read and JSON parse";

function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${label} must be a non-empty string`);
  }
}

export function createExecutionMetadata({
  architecture,
  elapsedNanoseconds,
  pairCount,
  platform,
  runtimeVersion,
}) {
  if (typeof elapsedNanoseconds !== "bigint" || elapsedNanoseconds < 0n) {
    throw new TypeError("elapsedNanoseconds must be a non-negative bigint");
  }
  if (!Number.isSafeInteger(pairCount) || pairCount <= 0) {
    throw new TypeError("pairCount must be a positive safe integer");
  }
  assertNonEmptyString(architecture, "architecture");
  assertNonEmptyString(platform, "platform");
  assertNonEmptyString(runtimeVersion, "runtimeVersion");

  const elapsedMilliseconds = Number(elapsedNanoseconds) / 1_000_000;
  if (!Number.isFinite(elapsedMilliseconds)) {
    throw new RangeError("elapsedNanoseconds is too large to report as milliseconds");
  }

  return {
    architecture,
    elapsedMilliseconds,
    measuredScope: MEASURED_SCOPE,
    millisecondsPerPair: elapsedMilliseconds / pairCount,
    platform,
    runtime: "node",
    runtimeVersion,
  };
}
