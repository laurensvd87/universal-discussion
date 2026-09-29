const runtime = globalThis.chrome.runtime;
let worker;
let pending;
function stop() {
  worker?.terminate(); worker = null;
  pending?.reply({ error: "cancelled" }); pending = null;
}
runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== runtime.id || sender.tab || message?.target !== "embedding") return false;
  if (message.type === "cancel") { stop(); reply({ cancelled: true }); return false; }
  if (message.type !== "embed" || typeof message.id !== "string" || message.id.length > 128 ||
      typeof message.text !== "string" || message.text.length > 4096 || pending) {
    reply({ error: "model-unavailable" }); return false;
  }
  if (!worker) {
    worker = new Worker(new URL("inference-worker.js", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }) => {
      if (!pending || data?.id !== pending.id) return;
      const callback = pending.reply; pending = null; callback(data);
    };
    worker.onerror = () => { const callback = pending?.reply; pending = null; stop(); callback?.({ error: "model-unavailable" }); };
  }
  pending = { id: message.id, reply };
  worker.postMessage({ id: message.id, text: message.text });
  message.text = "";
  return true;
});
