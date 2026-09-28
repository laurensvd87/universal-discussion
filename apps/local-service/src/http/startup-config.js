import { fail } from "../domain/errors.js";

export const FIXED_HOST = "127.0.0.1";
export const FIXED_PORT = 4174;
export const FIXED_HOST_HEADER = `${FIXED_HOST}:${FIXED_PORT}`;

export function validateStartupConfig(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) fail("config", "Invalid startup configuration");
  const keys = Object.keys(input).sort();
  if (keys.join(",") !== "capability,host,origin,port") fail("config", "Invalid startup configuration");
  if (input.host !== FIXED_HOST || input.port !== FIXED_PORT) fail("config", "Invalid startup configuration");
  if (typeof input.capability !== "string" || input.capability.length < 32 || input.capability.length > 512) {
    fail("config", "Invalid startup configuration");
  }
  if (typeof input.origin !== "string" || !/^chrome-extension:\/\/[a-p]{32}$/u.test(input.origin)) {
    fail("config", "Invalid startup configuration");
  }
  return Object.freeze({ host: input.host, port: input.port, hostHeader: FIXED_HOST_HEADER, origin: input.origin, capability: input.capability });
}
