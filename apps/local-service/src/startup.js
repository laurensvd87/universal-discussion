// Dormant composition entry point. It validates configuration and constructs an
// application when called, but deliberately imports no HTTP server and binds no socket.
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createSqliteDemoService } from "./application/create-sqlite-demo-service.js";
import { createRequestHandler } from "./http/request-handler.js";
import { validateStartupConfig } from "./http/startup-config.js";

export function openDormantLocalApplication({ config: input, databasePath, nextId, now }) {
  const config = validateStartupConfig(input);
  mkdirSync(path.dirname(databasePath), { recursive: true });
  const database = createSqliteDemoService({ databasePath, nextId, now });
  return Object.freeze({
    config,
    handle: createRequestHandler({ service: database.service, config }),
    close: database.close,
  });
}
