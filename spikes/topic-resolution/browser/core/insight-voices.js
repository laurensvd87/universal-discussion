// Fixed text styles only. IDs and labels grant no provider or discussion authority.
export const INSIGHT_VOICES = Object.freeze([
  "standard", "challenger", "funny", "clever", "sarcastic", "skeptic",
  "pragmatist", "explainer", "optimist", "realist", "mediator", "curious",
].map((id) => Object.freeze({ id, labelKey: `insightVoice_${id}` })));

const voiceIds = new Set(INSIGHT_VOICES.map(({ id }) => id));

export function normalizeInsightVoice(value = "standard") {
  if (typeof value !== "string" || !voiceIds.has(value)) {
    throw new TypeError("Invalid Insight voice");
  }
  return value;
}
