// Explicit project-created bridge; unrelated Harbor fixtures retain their IDs.
const BRIDGE = Object.freeze({
  source_0f115db062b7c0dd030b1687: "reserved-example-com",
  source_8198d1bac40a1033653a78e4: "reserved-example-org",
});

export function localServiceSourceId(validatedIndicatorView) {
  if (validatedIndicatorView?.outcome !== "resolved" ||
      validatedIndicatorView.sourceMatch?.method !== "exact-normalized-url") return null;
  return BRIDGE[validatedIndicatorView.source?.id] ?? null;
}
