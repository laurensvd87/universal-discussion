import { embedText } from "./e5-browser.js";

// Dedicated packaged worker: termination cancels native WASM and releases text.
self.onmessage = async ({ data }) => {
  if (!data || typeof data.id !== "string" || typeof data.text !== "string" || data.text.length > 4096) return;
  const id = data.id;
  try {
    const embedding = await embedText(data.text);
    data.text = "";
    self.postMessage({ id, embedding });
  } catch {
    data.text = "";
    self.postMessage({ id, error: "model-unavailable" });
  }
};
