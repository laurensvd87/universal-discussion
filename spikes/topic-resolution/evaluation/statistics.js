export const WILSON_METHOD_VERSION = "wilson-score-two-sided/1.0.0";

const WILSON_95_Z = 1.959963984540054;

export function wilsonScoreInterval(successes, total) {
  if (
    !Number.isSafeInteger(successes) ||
    !Number.isSafeInteger(total) ||
    successes < 0 ||
    total < 0 ||
    successes > total
  ) {
    throw new TypeError(
      "Wilson interval counts must be safe integers with 0 <= successes <= total",
    );
  }
  if (total === 0) {
    return null;
  }

  const proportion = successes / total;
  const zSquared = WILSON_95_Z ** 2;
  const denominator = 1 + zSquared / total;
  const center = (proportion + zSquared / (2 * total)) / denominator;
  const margin =
    (WILSON_95_Z / denominator) *
    Math.sqrt(
      (proportion * (1 - proportion)) / total +
        zSquared / (4 * total ** 2),
    );

  return {
    confidenceLevel: 0.95,
    lower: Math.max(0, center - margin),
    successes,
    total,
    upper: Math.min(1, center + margin),
  };
}
