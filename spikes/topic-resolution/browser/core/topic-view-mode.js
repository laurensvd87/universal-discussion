// Chrome clears storage.session on browser restart and extension reload. The old
// storage.local topicViewMode preference is intentionally ignored.
export const TOPIC_VIEW_SESSION_KEY = "topicViewModeV2";
export const RIDGE_POLICY = "ridge1-qualified-complete-link/v1";
export const REFERENCE_TOPIC_POLICY = "ridge1-fixed-reference-radius/v1";
export const RIDGE_REPRESENTATION = "owner-local-linear-teacher-transfer/ridge1-v1";

export function isRidgeTopicView(value) {
  return [RIDGE_POLICY, REFERENCE_TOPIC_POLICY].includes(value?.policyVersion) && value?.representation === RIDGE_REPRESENTATION;
}
export function isReferenceTopicView(value) {
  return value?.policyVersion === REFERENCE_TOPIC_POLICY && value?.representation === RIDGE_REPRESENTATION;
}
export function requiresReferenceTopicView(catalog, sourceId) {
  const source = catalog?.sources?.find(entry => entry.id === sourceId);
  if (source?.assignmentPolicy !== undefined) return source.provenance === "owner-local-page-embedding/v1" &&
    source.assignmentPolicy === REFERENCE_TOPIC_POLICY && Array.isArray(source.topicIds);
  return source?.provenance === "owner-local-page-embedding/v1" && Array.isArray(source.topicIds);
}

export async function readTopicViewMode(storageSession) {
  try {
    const stored = await storageSession?.get(TOPIC_VIEW_SESSION_KEY);
    return stored?.[TOPIC_VIEW_SESSION_KEY] === "classic" ? "classic" : "experimental";
  } catch {
    return "experimental";
  }
}

export async function writeTopicViewMode(storageSession, mode) {
  if (mode !== "classic" && mode !== "experimental") return false;
  await storageSession.set({ [TOPIC_VIEW_SESSION_KEY]: mode });
  return true;
}
