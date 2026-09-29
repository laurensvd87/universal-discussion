import { inspectPageUrl, PAGE_CONTENT_EXTRACTOR_VERSION } from "../core/page-content-policy.js";

// Serialized by scripting.executeScript: all capture logic stays inside this
// packaged isolated-world function, with no page-defined extraction callbacks.
export function collectPageContent(expectedUrl) {
  const contractVersion = "page-content/1";
  const unsupported = (reason) => ({ contractVersion, status: "unsupported", reason });
  const started = performance.now();
  let visited = 0;
  function budget() {
    if (++visited > 1500 || performance.now() - started > 40) throw new Error("budget");
  }
  function attribute(node, name) {
    const value = node.getAttribute(name);
    if (value !== null && (typeof value !== "string" || value.length > 1024)) throw new Error("attribute");
    return value ?? "";
  }
  function excluded(node) {
    const tag = node.tagName;
    if (["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "IFRAME", "FRAME", "OBJECT", "EMBED", "FORM", "INPUT", "TEXTAREA", "SELECT", "BUTTON", "NAV", "ASIDE", "FOOTER", "HEADER", "DIALOG"].includes(tag)) return true;
    if (node.hidden || node.inert || node.isContentEditable || attribute(node, "aria-hidden").toLowerCase() === "true") return true;
    if (["navigation", "dialog", "form", "textbox", "menu", "complementary"].includes(attribute(node, "role").toLowerCase())) return true;
    const context = `${attribute(node, "id")} ${attribute(node, "class")}`;
    if (/(?:^|[\s_-])(?:comments?|commentary|replies|discussion|paywall|login|signin)(?:$|[\s_-])/iu.test(context)) return true;
    const style = globalThis.getComputedStyle(node);
    return style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" ||
      style.contentVisibility === "hidden" || style.fontSize === "0px" || Number(style.opacity) === 0;
  }
  function boundedChildren(node, callback) {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      budget(); if (callback(child) === false) break;
    }
  }
  try {
    if (globalThis.top !== globalThis || typeof expectedUrl !== "string" || expectedUrl.length > 2048) return unsupported("document-mismatch");
    const current = new URL(globalThis.location.href); current.hash = "";
    if (current.toString() !== expectedUrl || current.username || current.password) return unsupported("document-mismatch");
    const document = globalThis.document;
    if (!document.head || !document.documentElement) return unsupported("missing-region");
    let title = "";
    let headCount = 0;
    for (let child = document.head.firstElementChild; child; child = child.nextElementSibling) {
      budget(); if (++headCount > 256) return unsupported("capture-budget");
      if (child.tagName === "TITLE" && !title) {
        let raw = "";
        boundedChildren(child, (textNode) => {
          if (textNode.nodeType === 3) raw += textNode.substringData(0, 200 - raw.length);
          return raw.length < 200;
        });
        title = raw.replace(/\s+/gu, " ").trim();
      }
    }
    // Iterative traversal discovers the first eligible region without selector
    // materialization or a whole-body text read. Excluded subtrees are skipped.
    let region = null;
    const stack = [document.documentElement];
    while (stack.length && !region) {
      const node = stack.pop(); budget();
      if (node.nodeType !== 1 || excluded(node)) continue;
      if (["ARTICLE", "MAIN"].includes(node.tagName) || attribute(node, "role").toLowerCase() === "main") { region = node; break; }
      const children = [];
      boundedChildren(node, (child) => { if (child.nodeType === 1) children.push(child); });
      for (let index = children.length - 1; index >= 0; index -= 1) stack.push(children[index]);
    }
    if (!region) return unsupported("missing-region");
    const chunks = [];
    let textLength = 0;
    const content = [region];
    while (content.length && textLength < 4096) {
      const node = content.pop(); budget();
      if (node.nodeType === 3) {
        // Read only the bounded prefix of each text node; no innerText/body API.
        const available = 4096 - textLength;
        const sample = node.substringData(0, available).replace(/\s+/gu, " ").trim();
        if (sample) {
          const separator = chunks.length ? " " : "";
          const part = (separator + sample).slice(0, available);
          chunks.push(part); textLength += part.length;
        }
      } else if (node.nodeType === 1 && !excluded(node)) {
        const children = [];
        boundedChildren(node, (child) => { if (child.nodeType === 1 || child.nodeType === 3) children.push(child); });
        for (let index = children.length - 1; index >= 0; index -= 1) content.push(children[index]);
      }
    }
    const text = chunks.join("").trim();
    if (!text) return unsupported("missing-region");
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(title + text)) return unsupported("invalid-content");
    return { contractVersion, status: "collected", url: expectedUrl, title, text, extractorVersion: "main-text-prefix/v1" };
  } catch { return unsupported("capture-budget"); }
}

export function attestContentDocument(expectedUrl) {
  const contractVersion = "page-content-attestation/1";
  try {
    const parsed = new URL(globalThis.location.href); parsed.hash = "";
    if (globalThis.top !== globalThis || parsed.toString() !== expectedUrl) return { contractVersion, status: "unsupported", reason: "document-mismatch" };
    return { contractVersion, status: "attested", url: expectedUrl };
  } catch { return { contractVersion, status: "unsupported", reason: "document-mismatch" }; }
}

const REASONS = new Set(["document-mismatch", "missing-region", "capture-budget", "rights-restricted", "invalid-content"]);
function data(record, key) {
  const descriptor = record && Object.getOwnPropertyDescriptor(record, key);
  return descriptor?.enumerable && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
}
function documentIdValid(id) { return typeof id === "string" && /^[A-Za-z0-9._:-]{1,128}$/u.test(id); }
function exact(record, keys) {
  if (!record || typeof record !== "object" || Array.isArray(record) || ![Object.prototype, null].includes(Object.getPrototypeOf(record))) throw new TypeError("Page content unavailable");
  const actual = Reflect.ownKeys(record);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key) || data(record, key) === undefined)) throw new TypeError("Page content unavailable");
}
function project(result, expectedUrl, attestation) {
  const version = attestation ? "page-content-attestation/1" : "page-content/1";
  if (data(result, "contractVersion") !== version) throw new TypeError("Page content unavailable");
  if (data(result, "status") === "unsupported") {
    exact(result, ["contractVersion", "status", "reason"]);
    if (!REASONS.has(result.reason)) throw new TypeError("Page content unavailable");
    return Object.freeze({ ...result });
  }
  exact(result, attestation ? ["contractVersion", "status", "url"] : ["contractVersion", "status", "url", "title", "text", "extractorVersion"]);
  if (result.status !== (attestation ? "attested" : "collected") || result.url !== expectedUrl) throw new TypeError("Page content unavailable");
  if (!attestation && (typeof result.title !== "string" || result.title.length > 200 || typeof result.text !== "string" || !result.text.trim() || result.text.length > 4096 ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(result.title + result.text) || result.extractorVersion !== PAGE_CONTENT_EXTRACTOR_VERSION)) throw new TypeError("Page content unavailable");
  return Object.freeze({ ...result });
}
export function createPageContentReader(scriptingApi) {
  if (typeof scriptingApi?.executeScript !== "function") throw new TypeError("Page content adapter unavailable");
  async function execute(tabId, expectedUrl, documentId) {
    if (!Number.isSafeInteger(tabId) || tabId < 0 || !inspectPageUrl(expectedUrl).supported ||
        inspectPageUrl(expectedUrl).url !== expectedUrl || (documentId !== undefined && !documentIdValid(documentId))) throw new TypeError("Page content unavailable");
    try {
      const results = await scriptingApi.executeScript({ args: [expectedUrl],
        func: documentId === undefined ? collectPageContent : attestContentDocument,
        target: documentId === undefined ? { tabId, frameIds: [0] } : { tabId, documentIds: [documentId] }, world: "ISOLATED" });
      if (!Array.isArray(results) || results.length !== 1) throw new TypeError("Page content unavailable");
      const id = data(results[0], "documentId");
      if (data(results[0], "frameId") !== 0 || !documentIdValid(id) || (documentId !== undefined && id !== documentId)) throw new TypeError("Page content unavailable");
      const result = project(data(results[0], "result"), expectedUrl, documentId !== undefined);
      return documentId === undefined ? Object.freeze({ documentId: id, result }) : result;
    } catch { throw new TypeError("Page content unavailable"); }
  }
  return Object.freeze({ read: (tabId, expectedUrl) => execute(tabId, expectedUrl),
    attest: (tabId, documentId, expectedUrl) => execute(tabId, expectedUrl, documentId) });
}
export function readPageContent(chromeApi, tabId, expectedUrl) { return createPageContentReader(chromeApi.scripting).read(tabId, expectedUrl); }
