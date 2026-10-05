import { spawn } from 'node:child_process';

// Adapted from spikes/topic-resolution/harness/chromium-pipe.js. The shared
// smoke pipe blocks DNS globally; this variant permits only the one document
// request admitted by CDP Fetch interception in browser-capture.js.
export function launchPilotPipe({ executable, profileDirectory }) {
  const child = spawn(executable, [
    '--headless=new', '--remote-debugging-pipe', '--enable-unsafe-extension-debugging',
    '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--disable-component-update', '--disable-sync', '--disable-quic',
    '--disable-application-cache', '--disk-cache-size=0', '--media-cache-size=0',
    `--user-data-dir=${profileDirectory}`, 'about:blank',
  ], { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  const pending = new Map(), listeners = new Map();
  let sequence = 0, buffer = Buffer.alloc(0), ended = false, closing;
  const input = child.stdio[3], output = child.stdio[4];
  const exited = new Promise(resolve => child.once('exit', resolve));
  function failPending() {
    ended = true;
    for (const item of pending.values()) {
      clearTimeout(item.timer); item.reject(new Error(`Chrome pipe ended during ${item.method}`));
    }
    pending.clear();
  }
  child.on('error', failPending); child.on('exit', failPending);
  input.on('error', failPending); output.on('error', failPending); output.on('end', failPending);
  output.on('data', chunk => {
    buffer = Buffer.concat([buffer, chunk]);
    if (buffer.length > 4_194_304) { failPending(); child.kill(); return; }
    let boundary;
    while ((boundary = buffer.indexOf(0)) !== -1) {
      const frame = buffer.subarray(0, boundary); buffer = buffer.subarray(boundary + 1);
      let message;
      try { message = JSON.parse(frame.toString('utf8')); }
      catch { failPending(); child.kill(); return; }
      if (message.id) {
        const item = pending.get(message.id);
        if (!item) continue;
        pending.delete(message.id); clearTimeout(item.timer);
        if (message.error) item.reject(new Error(`Chrome protocol rejected ${item.method} (code ${message.error.code})`));
        else item.resolve(message.result);
      } else if (message.method) {
        for (const listener of listeners.get(message.method) ?? []) listener(message.params, message.sessionId);
      }
    }
  });
  function send(method, params = {}, sessionId, timeoutMs = 10000) {
    if (ended) return Promise.reject(new Error(`Chrome pipe unavailable for ${method}`));
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Chrome protocol timeout: ${method}`)); }, timeoutMs);
      pending.set(id, { resolve, reject, timer, method });
      input.write(`${JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })}\0`, error => {
        if (error) failPending();
      });
    });
  }
  function on(method, listener) {
    if (!listeners.has(method)) listeners.set(method, new Set());
    listeners.get(method).add(listener);
    return () => listeners.get(method)?.delete(listener);
  }
  async function close() {
    if (closing) return closing;
    closing = (async () => {
      if (!ended) await send('Browser.close', {}, undefined, 2000).catch(() => {});
      const stopped = await Promise.race([exited.then(() => true), new Promise(resolve => setTimeout(() => resolve(false), 3000))]);
      if (!stopped) { child.kill(); await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 2000))]); }
      failPending(); input.destroy(); output.destroy(); listeners.clear();
    })();
    return closing;
  }
  return Object.freeze({ send, on, close });
}
