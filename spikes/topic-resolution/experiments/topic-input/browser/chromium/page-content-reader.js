import { inspectPageUrl, PAGE_CONTENT_EXTRACTOR_VERSIONS } from "../core/page-content-policy.js";

// Serialized by scripting.executeScript: all capture logic stays inside this
// packaged isolated-world function, with no page-defined extraction callbacks.
export function collectPageContent(expectedUrl) {
  const contractVersion = "page-content/1";
  const unsupported = (reason) => ({ contractVersion, status: "unsupported", reason });
  let started;
  let visited = 0;
  const failures = Object.fromEntries(["capture-time-budget", "capture-node-budget", "capture-head-budget", "capture-attribute-budget"]
    .map((reason) => [reason, Object.freeze({ reason })]));
  function elapsed() {
    if (performance.now() - started > 40) throw failures["capture-time-budget"];
  }
  function budget() {
    if (++visited > 10000) throw failures["capture-node-budget"];
    elapsed();
  }
  function attribute(node, name) {
    const value = node.getAttribute(name);
    if (value !== null && (typeof value !== "string" || value.length > 1024)) throw failures["capture-attribute-budget"];
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
  function fallbackContext(node) {
    const context = `${attribute(node, "id")} ${attribute(node, "class")}`;
    return {
      // These extra presentation hints affect fallback evidence/sampling only.
      // The original semantic-region collector retains its existing exclusions.
      blocked: /(?:^|[\s_-])(?:related|recommended|teaser|card|list|grid|promo)(?:$|[\s_-])/iu.test(context),
      candidate: ["DIV", "SECTION"].includes(node.tagName) &&
        /(?:^|[\s_-])(?:article|story|post|entry)(?:$|[\s_-])/iu.test(context) &&
        /(?:^|[\s_-])(?:body|content|text)(?:$|[\s_-])/iu.test(context),
    };
  }
  // Inspect structural eligibility before reading any prose. A MAIN can hold
  // several teaser ARTICLEs; ambiguity must not silently pick the first one.
  // All traversal shares the same work/time budget and excluded ancestry.
  function articleWithin(main) {
    const stack = [{ next: main.firstChild }];
    let selected = null;
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const node = frame.next;
      if (!node) { stack.pop(); elapsed(); continue; }
      frame.next = node.nextSibling;
      budget();
      if (node.nodeType !== 1 || excluded(node) || fallbackContext(node).blocked) continue;
      if (node.tagName === "ARTICLE") {
        if (selected) return { region: null, fallback: false };
        selected = node;
      }
      stack.push({ next: node.firstChild });
    }
    return { region: selected ?? main, fallback: false };
  }
  // Constant-size evidence aggregates upward once per node, never once per
  // ancestor. Evidence uses native lengths, not prose, selectors or body text.
  function discover(root) {
    const frame = (node, blocked = false) => ({ node, entered: false, next: null, blocked, candidate: false,
      text: 0, links: 0, paragraphs: 0, longParagraphs: 0, matches: 0, selected: null, selectedParagraphs: 0 });
    const stack = [frame(root)];
    while (stack.length) {
      budget();
      const current = stack[stack.length - 1];
      const node = current.node;
      if (!current.entered) {
        current.entered = true;
        if (node.nodeType === 1 && !excluded(node)) {
          // Preserve first semantic-region precedence over generic fallback.
          // Within MAIN, prefer only a unique eligible article. Neither an
          // ambiguous/empty region nor a budget failure retries the fallback.
          if (["ARTICLE", "MAIN"].includes(node.tagName) || attribute(node, "role").toLowerCase() === "main") {
            return node.tagName === "ARTICLE" ? { region: node, fallback: false } : articleWithin(node);
          }
          const context = fallbackContext(node);
          current.blocked ||= context.blocked;
          current.candidate = !current.blocked && context.candidate;
          current.next = node.firstChild;
        } else if (node.nodeType === 3 && !current.blocked) {
          const length = node.length;
          if (!Number.isSafeInteger(length) || length < 0) throw new Error("capture-failed");
          current.text = length;
        }
      } else if (current.next) {
        const child = current.next;
        current.next = child.nextSibling;
        stack.push(frame(child, current.blocked));
      } else {
        stack.pop();
        if (!current.blocked && node.nodeType === 1) {
          if (node.tagName === "A") current.links = current.text;
          // Count innermost paragraphs; malformed nested P elements cannot
          // multiply the same text into enough paragraph evidence.
          if (node.tagName === "P" && !current.paragraphs) {
            current.paragraphs = current.text;
            if (current.text >= 80) current.longParagraphs++;
          }
          if (current.candidate && current.longParagraphs >= 2 && current.paragraphs >= 300 &&
              current.links <= current.text * 0.25 && current.paragraphs >= current.text * 0.6) {
            if (current.matches === 0) {
              current.matches = 1; current.selected = node; current.selectedParagraphs = current.paragraphs;
            } else if (current.matches === 1 && current.selectedParagraphs < current.paragraphs * 0.9) {
              // Nested wrappers collapse only when the tighter root retains
              // nearly all the outer paragraph evidence; otherwise abstain.
              current.matches = 2; current.selected = null;
            }
          }
        }
        if (!stack.length) return { region: current.matches === 1 ? current.selected : null, fallback: true };
        const parent = stack[stack.length - 1];
        parent.text += current.text; parent.links += current.links;
        parent.paragraphs += current.paragraphs; parent.longParagraphs += current.longParagraphs;
        if (current.matches) {
          if (parent.matches === 0 && current.matches === 1) {
            parent.selected = current.selected; parent.selectedParagraphs = current.selectedParagraphs;
          } else parent.selected = null;
          parent.matches = Math.min(2, parent.matches + current.matches);
        }
      }
    }
    return { region: null, fallback: true };
  }
  // A stack of sibling cursors preserves the old depth-first order while
  // examining children only as needed. Every ignored child still spends a step.
  // No complete sibling array is constructed before the first paragraph is read.
  function walker(root, accepts) {
    const stack = [{ next: root, child: false, paragraph: false }];
    let paragraph = false;
    return {
      next() {
        while (stack.length) {
          const frame = stack[stack.length - 1];
          const node = frame.next;
          if (!node) { stack.pop(); elapsed(); continue; }
          frame.next = frame.child ? node.nextSibling : null;
          if (frame.child) budget();
          if (accepts(node)) { paragraph = frame.paragraph; return node; }
        }
        return null;
      },
      descend(node) { stack.push({ next: node.firstChild, child: true, paragraph: paragraph || node.tagName === "P" }); elapsed(); },
      inParagraph: () => paragraph,
    };
  }
  try {
    started = performance.now();
    if (globalThis.top !== globalThis || typeof expectedUrl !== "string" || expectedUrl.length > 2048) return unsupported("document-mismatch");
    const current = new URL(globalThis.location.href); current.hash = "";
    if (current.toString() !== expectedUrl || current.username || current.password) return unsupported("document-mismatch");
    const document = globalThis.document;
    if (!document.head || !document.documentElement) return unsupported("missing-region");
    let title = "";
    let headCount = 0;
    for (let child = document.head.firstElementChild; child; child = child.nextElementSibling) {
      budget(); if (++headCount > 256) throw failures["capture-head-budget"];
      if (child.tagName === "TITLE" && !title) {
        let raw = "";
        boundedChildren(child, (textNode) => {
          if (textNode.nodeType === 3) raw += textNode.substringData(0, 200 - raw.length);
          return raw.length < 200;
        });
        title = raw.replace(/\s+/gu, " ").trim();
        if (title) break;
      }
    }
    // Iterative traversal discovers the first eligible region without selector
    // materialization or a whole-body text read. Excluded subtrees are skipped.
    const { region, fallback } = discover(document.documentElement);
    if (!region) return unsupported("missing-region");
    const chunks = [];
    let textLength = 0;
    let rawLength = 0;
    let sampledParagraphs = 0;
    const content = walker(region, (node) => node.nodeType === 1 || node.nodeType === 3);
    for (let node = content.next(); node && textLength < 4096; node = content.next()) {
      budget();
      if (node.nodeType === 3) {
        // Read only the bounded prefix of each text node; no innerText/body API.
        const available = 4096 - textLength;
        const raw = node.substringData(0, fallback ? Math.min(available, 4096 - rawLength) : available);
        if (fallback) rawLength += raw.length;
        const sample = raw.replace(/\s+/gu, " ").trim();
        if (sample) {
          const separator = chunks.length ? " " : "";
          const part = (separator + sample).slice(0, available);
          chunks.push(part); textLength += part.length;
          if (fallback && content.inParagraph()) sampledParagraphs += part.length;
        }
      } else if (node.nodeType === 1 && !excluded(node) && (!fallback || !fallbackContext(node).blocked)) {
        content.descend(node);
      }
      // Do not advance even one sibling after the authorized prefix is full.
      if (textLength >= 4096 || (fallback && rawLength >= 4096)) break;
    }
    const text = chunks.join("").trim();
    if (!text) return unsupported("missing-region");
    if (fallback && (text.length < 300 || sampledParagraphs < textLength * 0.6)) return unsupported("missing-region");
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(title + text)) return unsupported("invalid-content");
    // A native style/text operation can consume the remainder of the deadline.
    // Check after final normalization and before publishing any captured text.
    elapsed();
    return { contractVersion, status: "collected", url: expectedUrl, title, text,
      extractorVersion: fallback ? "container-title-lead/v1" : "article-title-lead/v1" };
  } catch (error) {
    const failure = Object.values(failures).find((value) => value === error);
    return unsupported(failure?.reason ?? "capture-failed");
  }
}

export function attestContentDocument(expectedUrl) {
  const contractVersion = "page-content-attestation/1";
  try {
    const parsed = new URL(globalThis.location.href); parsed.hash = "";
    if (globalThis.top !== globalThis || parsed.toString() !== expectedUrl) return { contractVersion, status: "unsupported", reason: "document-mismatch" };
    return { contractVersion, status: "attested", url: expectedUrl };
  } catch { return { contractVersion, status: "unsupported", reason: "document-mismatch" }; }
}

const REASONS = new Set(["document-mismatch", "missing-region", "capture-budget", "rights-restricted", "invalid-content",
  "capture-time-budget", "capture-node-budget", "capture-head-budget", "capture-attribute-budget", "capture-failed"]);
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
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(result.title + result.text) || !PAGE_CONTENT_EXTRACTOR_VERSIONS.includes(result.extractorVersion))) throw new TypeError("Page content unavailable");
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
