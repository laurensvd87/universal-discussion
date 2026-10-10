const PANEL_PATH = "chromium/sidepanel.html";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

function panelIdentity(runtime, sender) {
  if (sender?.id !== runtime.id || sender.tab || typeof sender.url !== "string" ||
      sender.frameId !== undefined && sender.frameId !== 0) return null;
  const base = runtime.getURL(PANEL_PATH);
  const ownOrigin = base.slice(0, base.indexOf("/", "chrome-extension://".length));
  let url;
  try { url = new URL(sender.url); } catch { return null; }
  if (`${url.protocol}//${url.host}${url.pathname}` !== base || url.hash ||
      sender.origin !== undefined && sender.origin !== ownOrigin ||
      url.searchParams.size !== 2 || !url.searchParams.has("windowId") ||
      !url.searchParams.has("instance")) return null;
  const rawId = url.searchParams.get("windowId");
  const instance = url.searchParams.get("instance");
  if (!/^(0|[1-9][0-9]*)$/u.test(rawId) || !UUID.test(instance)) return null;
  const windowId = Number(rawId);
  if (!Number.isSafeInteger(windowId) || windowId < 0 ||
      sender.url !== `${base}?windowId=${windowId}&instance=${instance}`) return null;
  return { windowId, documentUrl: sender.url };
}

// Chrome 154 omits sender.documentId and reports windowId=-1 for a native
// SIDE_PANEL context. The packaged panel navigates to a fresh, unique document
// URL containing its browser-observed owner window. Exact live-context URL
// corroboration binds that document without accepting an arbitrary RPC ID.
export async function authenticatedSidePanelWindow(runtime, sender) {
  const identity = panelIdentity(runtime, sender);
  if (!identity) return null;
  if (sender.documentId !== undefined && (typeof sender.documentId !== "string" || !sender.documentId)) return null;
  try {
    const contexts = await runtime.getContexts({ contextTypes: ["SIDE_PANEL"],
      documentUrls: [identity.documentUrl],
      ...(sender.documentId === undefined ? {} : { documentIds: [sender.documentId] }) });
    if (contexts.length !== 1) return null;
    const context = contexts[0];
    if (context.contextType !== "SIDE_PANEL" || context.documentUrl !== identity.documentUrl ||
        typeof context.documentId !== "string" || !context.documentId ||
        sender.documentId !== undefined && context.documentId !== sender.documentId ||
        context.incognito !== false || context.frameId !== 0 ||
        context.tabId !== -1 || context.windowId !== -1) return null;
    return identity.windowId;
  } catch { return null; }
}
