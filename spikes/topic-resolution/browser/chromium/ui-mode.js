export const UI_MODE_KEY = "discussionUiModeV1";

export function createUiModePreference({ storageLocal, onChange = () => {} } = {}) {
  let mode = "user";
  let revision = 0;
  let writes = Promise.resolve();
  let disposed = false;
  const valid = (value) => value === "user" || value === "developer";
  function publish() { if (!disposed) onChange(mode); }
  async function load() {
    const ownRevision = revision;
    try {
      const stored = await storageLocal?.get(UI_MODE_KEY);
      if (!disposed && revision === ownRevision && valid(stored?.[UI_MODE_KEY])) {
        mode = stored[UI_MODE_KEY]; publish();
      }
    } catch { /* An unavailable preference store leaves the usable default. */ }
  }
  function select(value) {
    if (disposed || !valid(value)) return;
    revision += 1; mode = value; publish();
    // Serialize rapid clicks so the last visible choice is also the last write.
    writes = writes.then(() => storageLocal?.set({ [UI_MODE_KEY]: value })).catch(() => {});
  }
  publish();
  return Object.freeze({ load, select, currentMode: () => mode,
    settled: () => writes, dispose: () => { disposed = true; } });
}
