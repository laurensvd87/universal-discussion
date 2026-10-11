import { accountEnglish } from "../locales/account-en.js";

export const accountSheetSelectors = Object.freeze({ sheet: ".account-sheet", email: "#account-email", code: "#account-code",
  username: "#account-username", submit: ".account-submit", close: ".account-close", error: ".account-error", replyEmail: "#account-reply-email" });

export function createAccountSheet({ document, mount, controller, strings = accountEnglish }) {
  const create = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className;
    if (text) node.textContent = text; return node; };
  const overlay = create("div", "account-overlay"); overlay.hidden = true;
  const sheet = create("section", "account-sheet"); sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-labelledby", "account-title");
  const close = create("button", "account-close", "×"); close.type = "button"; close.setAttribute("aria-label", strings.close);
  const emblem = create("div", "account-emblem", "◈"); emblem.setAttribute("aria-hidden", "true");
  const title = create("h2"); title.id = "account-title";
  const hint = create("p", "account-hint"); hint.id = "account-hint";
  const form = create("form", "account-form"); form.noValidate = true;
  const label = create("label", "account-label"); const input = create("input", "account-input");
  input.setAttribute("aria-describedby", "account-hint account-error");
  const submit = create("button", "account-submit"); submit.type = "submit";
  form.append(label, input, submit);
  const chatGPT = create("button", "account-secondary"); chatGPT.type = "button"; chatGPT.textContent = strings.continueChatGPT;
  const codeActions = create("div", "account-code-actions");
  const resend = create("button", "account-link", strings.resend), edit = create("button", "account-link", strings.editEmail);
  resend.type = edit.type = "button"; codeActions.append(resend, edit);
  const profile = create("div", "account-profile"); const username = create("p", "account-handle");
  const preference = create("label", "account-preference"); const toggle = create("input");
  toggle.id = "account-reply-email"; toggle.type = "checkbox"; toggle.setAttribute("role", "switch");
  const preferenceText = create("span"); const preferenceTitle = create("span", "account-preference-title", strings.replyEmail);
  const preferenceHint = create("span", "account-preference-hint", strings.replyHint); preferenceText.append(preferenceTitle, preferenceHint);
  preference.append(preferenceText, toggle); const logout = create("button", "account-secondary", strings.logout); logout.type = "button";
  profile.append(username, preference, logout);
  const error = create("p", "account-error"); error.id = "account-error"; error.setAttribute("aria-live", "polite"); error.setAttribute("aria-atomic", "true");
  const notice = create("p", "account-notice"); notice.setAttribute("role", "status");
  sheet.append(close, emblem, title, hint, form, chatGPT, codeActions, profile, error, notice); overlay.append(sheet); mount.append(overlay);
  let stage = "closed", snapshot = null, opener = null, disposed = false;
  const siblingInert = new Map();
  const isolate = () => {
    for (const sibling of mount.children) {
      if (sibling === overlay || siblingInert.has(sibling)) continue;
      siblingInert.set(sibling, sibling.inert); sibling.inert = true;
    }
  };
  const restoreBackground = () => {
    for (const [sibling, inert] of siblingInert) sibling.inert = inert;
    siblingInert.clear();
  };
  const firstFocus = () => { if (stage === "profile") close.focus(); else input.focus(); };
  const render = (value) => {
    if (disposed) return;
    const changed = stage !== value.stage, wasClosed = stage === "closed"; snapshot = value; stage = value.stage;
    overlay.hidden = stage === "closed";
    if (stage === "closed") { restoreBackground(); if (!wasClosed && opener?.isConnected !== false) opener?.focus?.(); opener = null; return; }
    if (wasClosed) { opener = document.activeElement; isolate(); }
    sheet.setAttribute("aria-busy", String(value.busy));
    form.hidden = stage === "profile"; profile.hidden = stage !== "profile";
    codeActions.hidden = stage !== "code"; chatGPT.hidden = stage !== "email" || !value.canChatGPT;
    const fields = {
      email: [strings.emailTitle, strings.emailHint, strings.email, strings.continueEmail, "account-email", "email", "email"],
      code: [strings.codeTitle, `${strings.codeHint} ${value.email}`, strings.code, strings.verify, "account-code", "text", "one-time-code"],
      username: [strings.usernameTitle, strings.usernameHint, strings.username, strings.saveUsername, "account-username", "text", "username"],
      profile: [strings.profileTitle, "", "", "", "account-username", "text", "username"],
    };
    const field = fields[stage] ?? fields.email;
    title.textContent = field[0]; hint.textContent = field[1]; label.textContent = field[2];
    submit.textContent = value.busy ? strings.busy : field[3];
    if (changed) {
      input.id = field[4]; label.setAttribute("for", input.id); input.type = field[5]; input.autocomplete = field[6];
      input.inputMode = stage === "code" ? "numeric" : stage === "email" ? "email" : "text";
      input.maxLength = stage === "code" ? 6 : stage === "username" ? 24 : 254;
      input.setAttribute("pattern", stage === "code" ? "[0-9]{6}" : stage === "username" ? "[A-Za-z0-9_]{3,24}" : ".*");
      input.value = stage === "email" ? value.email : stage === "username" ? value.account?.username ?? "" : "";
    }
    input.readOnly = value.busy; input.setAttribute("aria-invalid", String(Boolean(value.error)));
    submit.disabled = chatGPT.disabled = toggle.disabled = logout.disabled = value.busy;
    resend.disabled = value.busy || value.resendRemaining > 0;
    resend.textContent = value.resendRemaining > 0 ? `${strings.resend} (${value.resendRemaining}s)` : strings.resend;
    username.textContent = value.account?.username ? `@${value.account.username}` : "";
    toggle.checked = value.account?.replyEmail === true;
    error.textContent = value.error; notice.textContent = value.notice;
    if (changed) firstFocus();
  };
  const submitForm = (event) => { event.preventDefault(); if (snapshot?.busy) return;
    if (stage === "email") void controller.requestCode(input.value);
    if (stage === "code") void controller.verifyCode(input.value);
    if (stage === "username") void controller.setUsername(input.value);
  };
  const keydown = (event) => {
    if (stage === "closed") return;
    if (event.key === "Escape") { event.preventDefault(); controller.cancel(); return; }
    if (event.key !== "Tab") return;
    const visible = [close, ...(stage === "profile" ? [toggle, logout] : [input, submit,
      ...(stage === "email" && !chatGPT.hidden ? [chatGPT] : []), ...(stage === "code" ? [resend, edit] : [])])].filter((node) => !node.disabled);
    const index = visible.indexOf(document.activeElement);
    if (event.shiftKey && index <= 0) { event.preventDefault(); visible.at(-1).focus(); }
    else if (!event.shiftKey && (index < 0 || index === visible.length - 1)) { event.preventDefault(); visible[0].focus(); }
  };
  const closeClick = () => controller.cancel(), resendClick = () => { void controller.requestCode(); }, editClick = () => controller.editEmail();
  const toggleChange = () => { void controller.setReplyEmail(toggle.checked); }, logoutClick = () => { void controller.signOut(); };
  const chatClick = () => { void controller.signInChatGPT(); };
  const paste = (event) => { if (stage !== "code" || snapshot.busy) return; const text = event.clipboardData?.getData("text")?.trim();
    if (/^\d{6}$/.test(text ?? "")) { event.preventDefault(); input.value = text; } };
  form.addEventListener("submit", submitForm); sheet.addEventListener("keydown", keydown); close.addEventListener("click", closeClick);
  resend.addEventListener("click", resendClick); edit.addEventListener("click", editClick); toggle.addEventListener("change", toggleChange);
  logout.addEventListener("click", logoutClick); chatGPT.addEventListener("click", chatClick); input.addEventListener("paste", paste);
  const unsubscribe = controller.subscribe(render);
  return Object.freeze({ elements: Object.freeze({ overlay, sheet, form, input, submit, close, resend, edit, toggle, logout, chatGPT, error, notice }),
    dispose() { if (disposed) return; controller.cancel(); restoreBackground();
      if (opener?.isConnected !== false) opener?.focus?.(); opener = null;
      disposed = true; unsubscribe(); overlay.remove(); } });
}
