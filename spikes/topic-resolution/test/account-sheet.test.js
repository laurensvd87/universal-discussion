import assert from "node:assert/strict";
import test from "node:test";
import { createAccountSheet, accountSheetSelectors } from "../browser/chromium/account-sheet.js";
import { readFile } from "node:fs/promises";

function fixture() {
  const document = { activeElement: null, createElement: (tag) => new Node(tag) };
  class Node {
    constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.handlers = {}; this.hidden = false; this.disabled = false; this.value = ""; this.inert = false; }
    append(...nodes) { this.children.push(...nodes); } setAttribute(key, value) { this.attrs[key] = value; }
    addEventListener(name, handler) { this.handlers[name] = handler; } focus() { document.activeElement = this; }
    remove() { this.removed = true; } dispatch(name, values = {}) { let prevented = false; this.handlers[name]?.({ preventDefault() { prevented = true; }, ...values }); return prevented; }
  }
  let state = { stage: "closed", busy: false, email: "reader@example.test", account: null, error: "", notice: "", resendRemaining: 20, canChatGPT: false };
  let listener; const calls = [];
  const emit = (value) => { state = { ...state, ...value }; listener(state); };
  const controller = { subscribe: (fn) => { listener = fn; fn(state); return () => { listener = () => {}; }; },
    cancel: () => emit({ stage: "closed" }), requestCode: (value) => calls.push(["request", value]), verifyCode: (value) => calls.push(["verify", value]),
    setUsername: (value) => calls.push(["username", value]), setReplyEmail: (value) => calls.push(["preference", value]),
    signOut: () => calls.push(["logout"]), editEmail: () => emit({ stage: "email" }), signInChatGPT: () => calls.push(["chatGPT"]) };
  const mount = new Node("main"), opener = new Node("button"), background = new Node("div"), alreadyInert = new Node("div");
  alreadyInert.inert = true; background.append(opener); mount.append(background, alreadyInert); opener.focus();
  const sheet = createAccountSheet({ document, mount, controller });
  return { ...sheet, document, emit, calls, opener, mount, background, alreadyInert };
}
test("dialog labels, genuine capabilities and focus restoration", () => {
  const f = fixture(); f.emit({ stage: "email" });
  assert.equal(f.elements.sheet.attrs.role, "dialog"); assert.equal(f.elements.input.id, "account-email");
  assert.equal(f.document.activeElement, f.elements.input); assert.equal(f.elements.chatGPT.hidden, true);
  f.elements.sheet.dispatch("keydown", { key: "Escape" }); assert.equal(f.document.activeElement, f.opener);
  assert.equal(f.elements.overlay.hidden, true);
});
test("same-stage updates preserve typed input and focus", () => {
  const f = fixture(); f.emit({ stage: "email" }); f.elements.input.value = "typing@example.test";
  f.emit({ busy: true }); f.emit({ busy: false, error: "Try again" });
  assert.equal(f.elements.input.value, "typing@example.test"); assert.equal(f.document.activeElement, f.elements.input);
  assert.equal(f.elements.error.textContent, "Try again"); assert.equal(f.elements.error.attrs["aria-live"], "polite");
});
test("single six-digit input supports native Enter form and paste", () => {
  const f = fixture(); f.emit({ stage: "code" });
  assert.equal(f.elements.input.autocomplete, "one-time-code"); assert.equal(f.elements.input.inputMode, "numeric");
  assert.equal(f.elements.input.maxLength, 6); assert.equal(f.elements.resend.disabled, true);
  assert.equal(f.elements.input.dispatch("paste", { clipboardData: { getData: () => " 123456 " } }), true);
  f.elements.form.dispatch("submit"); assert.deepEqual(f.calls, [["verify", "123456"]]);
  f.emit({ busy: true }); f.elements.form.dispatch("submit"); assert.equal(f.calls.length, 1);
});
test("focus trap wraps both directions and close remains usable during work", () => {
  const f = fixture(); f.emit({ stage: "email", busy: true }); f.elements.close.focus();
  f.elements.sheet.dispatch("keydown", { key: "Tab", shiftKey: true }); assert.equal(f.document.activeElement, f.elements.input);
  f.elements.sheet.dispatch("keydown", { key: "Tab" }); assert.equal(f.document.activeElement, f.elements.close);
  f.elements.close.dispatch("click"); assert.equal(f.elements.overlay.hidden, true);
});
test("profile toggles are compact, pending updates cannot double-submit", () => {
  const f = fixture(); f.emit({ stage: "profile", account: { username: "reader", replyEmail: false } });
  f.elements.toggle.checked = true; f.elements.toggle.dispatch("change"); assert.deepEqual(f.calls, [["preference", true]]);
  assert.equal(f.elements.form.hidden, true); assert.equal(f.elements.toggle.attrs.role, "switch");
  f.dispose(); assert.equal(f.elements.overlay.removed, true); assert.equal(f.document.activeElement, f.opener);
});
test("layout selectors and responsive reduced-motion styles are available to native harness", async () => {
  assert.equal(accountSheetSelectors.sheet, ".account-sheet");
  const css = await readFile(new URL("../browser/chromium/account-sheet.css", import.meta.url), "utf8");
  assert.match(css, /width: min\(100%, 368px\)/); assert.match(css, /prefers-reduced-motion/); assert.match(css, /overflow-wrap: anywhere/);
});
test("modal isolates background siblings and restores their exact prior inert state", () => {
  const f = fixture(); assert.equal(f.background.inert, false); assert.equal(f.alreadyInert.inert, true);
  f.emit({ stage: "email" }); assert.equal(f.background.inert, true); assert.equal(f.alreadyInert.inert, true);
  assert.equal(f.elements.overlay.inert, false);
  f.emit({ stage: "code" }); f.emit({ busy: true });
  f.elements.close.dispatch("click"); assert.equal(f.background.inert, false); assert.equal(f.alreadyInert.inert, true);
  f.emit({ stage: "profile", busy: false, account: { username: "reader" } }); assert.equal(f.background.inert, true);
  f.dispose(); assert.equal(f.background.inert, false); assert.equal(f.alreadyInert.inert, true);
});
