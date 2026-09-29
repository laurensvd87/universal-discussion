// Only the approved packaged offscreen document can host inference; no raw text
// reaches the loopback adapter. Context closure cancels native WASM execution.
export function createInferenceHost({ runtime, offscreen }) {
  const path = "embedding/offscreen.html";
  const documentUrl = runtime.getURL(path);
  let creation;
  let closing;
  let busy = false;
  async function exists() {
    return (await runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"], documentUrls: [documentUrl] })).length > 0;
  }
  async function ensure() {
    await closing;
    if (!creation) creation = (async () => {
      if (!await exists()) await offscreen.createDocument({ url: path, reasons: ["WORKERS"],
        justification: "Run packaged on-device embedding workers for owner-enabled sites without uploading page text." });
    })().finally(() => { creation = null; });
    await creation;
  }
  function close() {
    if (!closing) closing = (async () => {
      await creation?.catch(() => {});
      if (await exists()) await offscreen.closeDocument();
    })().finally(() => { closing = null; });
    return closing;
  }
  function embed(text, { signal } = {}) {
    // No queue of captured text: one job may initialize/run; other jobs fail
    // promptly and the foreground can retry after cancellation has completed.
    if (busy || signal?.aborted) return Promise.reject(new Error("cancelled"));
    busy = true;
    return (async () => {
      let rejectCancelled;
      let timer;
      const cancelled = new Promise((_, reject) => { rejectCancelled = reject; });
      const cancel = () => { text = null; void close().catch(() => {}); rejectCancelled(new Error("cancelled")); };
      signal?.addEventListener("abort", cancel, { once: true });
      timer = setTimeout(cancel, 90_000);
      try {
        // Timeout/abort covers offscreen creation as well as model execution.
        await Promise.race([ensure(), cancelled]);
        if (signal?.aborted || text === null) throw new Error("cancelled");
        const result = await Promise.race([runtime.sendMessage({ target: "embedding", type: "embed", id: crypto.randomUUID(), text }), cancelled]);
        text = null;
        if (signal?.aborted || !result?.embedding || result.error) throw new Error("model-unavailable");
        return result.embedding;
      } finally {
        text = null; busy = false;
        clearTimeout(timer); signal?.removeEventListener("abort", cancel);
      }
    })();
  }
  return Object.freeze({ embed, close });
}
