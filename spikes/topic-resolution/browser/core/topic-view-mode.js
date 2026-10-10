// Chrome clears storage.session on browser restart and extension reload. The old
// storage.local topicViewMode preference is intentionally ignored.
export const TOPIC_VIEW_SESSION_KEY = "topicViewModeV2";
export const RIDGE_POLICY = "ridge1-qualified-complete-link/v1";
export const RIDGE_REPRESENTATION = "owner-local-linear-teacher-transfer/ridge1-v1";

export function isRidgeTopicView(value) {
  return value?.policyVersion === RIDGE_POLICY && value?.representation === RIDGE_REPRESENTATION;
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
