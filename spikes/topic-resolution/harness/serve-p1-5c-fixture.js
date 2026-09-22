import { readFile } from "node:fs/promises";
import { createServer } from "node:http";

const ADDRESS = "127.0.0.1";
const PORT = 4_173;
const ROUTE = "/p1-5c.html";
const EXPECTED_HOST = `${ADDRESS}:${PORT}`;
const fixture = await readFile(
  new URL("../fixtures/html/p1-5c.html", import.meta.url),
);

const server = createServer((request, response) => {
  if (request.headers.host !== EXPECTED_HOST) {
    response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Unsupported host");
    return;
  }
  if (request.url !== ROUTE || !["GET", "HEAD"].includes(request.method)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Security-Policy":
      "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    "Content-Type": "text/html; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(request.method === "HEAD" ? undefined : fixture);
});

server.on("error", (error) => {
  console.error(`P1.5c fixture server failed: ${error.message}`);
  process.exitCode = 1;
});

server.listen(PORT, ADDRESS, () => {
  console.log(`P1.5c fixture: http://${EXPECTED_HOST}${ROUTE}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
