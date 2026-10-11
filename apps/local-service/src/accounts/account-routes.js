import { AccountError } from "./account-errors.js";
import { fail } from "../domain/errors.js";

// Only the paired HTTP handler calls this adapter, with normalized requests.
// No listener or account store is created here or by importing this module.
export function routeAccountRequest(request, accounts) {
  if (Object.hasOwn(request.headers, "x-demo-actor")) fail("forbidden", "Action unavailable");
  const path = request.url.pathname;
  const token = request.headers["x-account-session"];
  if (path === "/v1/account/chatgpt" && token !== undefined &&
      (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/u.test(token))) throw new AccountError("authentication-required");
  if (["/v1/account/me", "/v1/account/username", "/v1/account/preferences", "/v1/account/session/logout"].includes(path) &&
      (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/u.test(token))) throw new AccountError("authentication-required");
  if (request.method === "GET" && path === "/v1/account/me") {
    if (request.body !== null && request.body !== "") fail("invalid", "Invalid request");
    return { status: 200, value: accounts.me(token) };
  }
  if (request.method === "GET" && path === "/v1/account/capabilities") {
    if (request.body !== null && request.body !== "") fail("invalid", "Invalid request");
    return {status:200,value:accounts.capabilities()};
  }
  if (request.method !== "POST") fail("not-found", "Object unavailable");
  if (request.headers["content-type"] !== "application/json" || !request.body ||
      Buffer.byteLength(request.body, "utf8") > 4096) fail("invalid", "Invalid request");
  let body;
  try { body = JSON.parse(request.body); } catch { fail("invalid", "Invalid request"); }
  if (["/v1/account/capabilities", "/v1/account/me"].includes(path)) {
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length)
      fail("invalid", "Invalid request");
    return { status: 200, value: path === "/v1/account/me" ? accounts.me(token) : accounts.capabilities() };
  }
  const routes = {
    "/v1/account/chatgpt": () => accounts.signInChatGPT(body,token),
    "/v1/account/email/request": () => accounts.requestCode(body),
    "/v1/account/email/verify": () => accounts.verifyCode(body),
    "/v1/account/session/renew": () => accounts.renew(body),
    "/v1/account/username": () => accounts.setUsername(token, body),
    "/v1/account/preferences": () => accounts.setReplyEmail(token, body),
    "/v1/account/session/logout": () => {
      if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length)
        fail("invalid", "Invalid request");
      return accounts.logout(token);
    },
  };
  if (!Object.hasOwn(routes, path)) fail("not-found", "Object unavailable");
  return { status: 200, value: routes[path]() };
}

export function mapAccountError(error) {
  if (!(error instanceof AccountError)) return null;
  const mapping = {
    "invalid-request": 400, "verification-failed": 400,
    "authentication-required": 401, "username-unavailable": 409,
    "request-unavailable": 429,
    "chatgpt-unavailable": 409, "account-switch-required": 409,
    "email-unavailable": 409,
  };
  const status = mapping[error.code];
  return status ? { status, label: error.code } : { status: 500, label: "internal" };
}
