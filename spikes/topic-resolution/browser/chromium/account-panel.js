import { createAccountController } from "../core/account-controller.js";
import { createAccountSheet } from "./account-sheet.js";
import { accountEnglish } from "../locales/account-en.js";

// Normal panel composition uses only injected local transport/storage. OAuth
// connection and local export are separate deliberate owner-surface callbacks.
export function mountAccountPanel({ document, mount, client, storage, readContext = () => null,
  onAccountChange = () => {}, onConnectChatGPT, onExport, onSessionChanged, strings = accountEnglish } = {}) {
  const button = document.createElement("button");
  button.type = "button"; button.className = "account-profile-button";
  button.setAttribute("aria-label", strings.signInLabel);
  button.setAttribute("title", strings.signIn);
  button.textContent = strings.signIn;
  mount.append(button);
  let disposed = false, lastAccount = undefined, stableAccount = null;
  const controller = createAccountController({ client, storage, readContext, onConnectChatGPT, onExport });
  const sheet = createAccountSheet({ document, mount, controller, strings });
  const unsubscribe = controller.subscribe(snapshot => {
    const account = snapshot.account?.state === "active" && snapshot.account.username ? snapshot.account : snapshot.renewing ? stableAccount : null;
    stableAccount = account;
    button.textContent = account ? `@${account.username}` : strings.signIn;
    button.setAttribute("aria-label", account ? `${strings.profileLabel} ${account.username}` : strings.signInLabel);
    button.setAttribute("title", account ? strings.profileTitle : strings.signIn);
    const key = account ? JSON.stringify(account) : "";
    if (lastAccount !== key) { lastAccount = key; onAccountChange(account ? { ...account } : null); }
  });
  const open = async () => {
    if (disposed) return false;
    controller.open();
    return controller.refreshCapabilities();
  };
  const click = () => { void open(); };
  button.addEventListener("click", click);
  const sessionUnsubscribe = typeof onSessionChanged === "function" ? onSessionChanged(() => {
    if (!disposed) void controller.reconcileSession().catch(() => {});
  }) : null;
  return Object.freeze({
    controller, elements: Object.freeze({ button, ...sheet.elements }),
    async initialize() { if (disposed) return false; await controller.refreshCapabilities(); if (disposed) return false; return controller.restore(); },
    requestSignIn: open,
    getActorId() { const snapshot = controller.renderSnapshot(), account = snapshot.account ?? (snapshot.renewing ? stableAccount : null);
      return !disposed && account?.state === "active" && account.username ? `account-${account.id}` : null; },
    getAccessToken: actorId => disposed ? null : controller.getAccessToken(actorId),
    rejectedSession: token => disposed ? Promise.resolve(false) : controller.rejectedSession(token),
    onSessionChanged: () => disposed ? Promise.resolve(false) : controller.reconcileSession(),
    dispose() { if (disposed) return; disposed = true; sessionUnsubscribe?.(); unsubscribe(); sheet.dispose(); controller.dispose(); button.remove(); },
  });
}
