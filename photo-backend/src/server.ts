import { createServer } from "node:http";

const host = "127.0.0.1";
const port = Number(process.env.PHOTO_BACKEND_PORT ?? "8787");
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error("Invalid PHOTO_BACKEND_PORT");
const server = createServer((request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("X-Content-Type-Options", "nosniff");
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200); response.end(JSON.stringify({ status: "ok", writesEnabled: false, version: "0.1.0" }));
  } else {
    response.writeHead(404); response.end(JSON.stringify({ error: "NOT_AVAILABLE" }));
  }
});
server.requestTimeout = 15_000;
server.headersTimeout = 10_000;
server.listen(port, host);
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => server.close());
