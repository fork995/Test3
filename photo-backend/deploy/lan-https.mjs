import { createServer } from "node:https";
import { request as httpRequest } from "node:http";
import { readFileSync } from "node:fs";
import { Socket } from "node:net";

const address = process.env.LAN_HTTPS_ADDRESS;
const port = Number(process.env.LAN_HTTPS_PORT ?? "8443");
const adminPort = Number(process.env.LAN_HTTPS_ADMIN_PORT ?? "8788");
const vncPort = Number(process.env.LAN_HTTPS_VNC_PORT ?? "6080");
const keyFile = process.env.LAN_HTTPS_KEY_FILE;
const certFile = process.env.LAN_HTTPS_CERT_FILE;
if (!address || !keyFile || !certFile) throw Error("LAN HTTPS address, key and certificate are required");
if (![port, adminPort, vncPort].every(value => Number.isInteger(value) && value >= 1024 && value <= 65535))
  throw Error("Invalid LAN HTTPS port configuration");
const origin = `https://${address}:${port}`;
const key = readFileSync(keyFile);
const cert = readFileSync(certFile);
const privateLan = /^(?:192\.168\.3\.(?:[1-9]|[1-9]\d|1\d\d|2[0-4]\d|25[0-4]))$/;

function deny(response, status = 403) {
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff" });
  response.end(status === 404 ? "Not found" : "Forbidden");
}
function isAllowed(request) {
  const remote = request.socket.remoteAddress ?? "";
  if (remote !== address && !privateLan.test(remote)) return false;
  if (request.headers.host !== `${address}:${port}`) return false;
  return !request.headers.origin || request.headers.origin === origin;
}
function vncPath(url) {
  if (!url.startsWith("/admin/vnc/")) return undefined;
  const path = "/" + url.slice("/admin/vnc/".length);
  try {
    if (decodeURIComponent(path).split("/").includes("..") || path.includes("\\")) return undefined;
  } catch { return undefined; }
  return path;
}
function target(url) {
  // The credential endpoint belongs to the admin backend, not websockify.
  if (url === "/admin/vnc/password") return { port: adminPort, path: url, vnc: false };
  const path = vncPath(url);
  if (path) return { port: vncPort, path, vnc: true };
  if (url === "/admin" || url.startsWith("/admin/")) return { port: adminPort, path: url, vnc: false };
  return undefined;
}
function forwardedHeaders(request, upstreamPort) {
  const headers = { ...request.headers, host: `127.0.0.1:${upstreamPort}` };
  delete headers["x-forwarded-for"];
  delete headers["x-forwarded-host"];
  delete headers["x-forwarded-proto"];
  if (headers.origin) headers.origin = `http://127.0.0.1:${upstreamPort}`;
  return headers;
}
function authorized(request) {
  return new Promise(resolve => {
    const check = httpRequest({ hostname: "127.0.0.1", port: adminPort, path: "/admin/status", method: "GET",
      headers: { host: `127.0.0.1:${adminPort}`, cookie: request.headers.cookie ?? "" }, timeout: 3000 }, response => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    check.on("error", () => resolve(false));
    check.on("timeout", () => { check.destroy(); resolve(false); });
    check.end();
  });
}

const server = createServer({ key, cert, minVersion: "TLSv1.2" }, async (request, response) => {
  if (!isAllowed(request)) return deny(response);
  const route = target(request.url ?? "");
  if (!route) return deny(response, 404);
  if (route.vnc && request.method !== "GET" && request.method !== "HEAD") return deny(response);
  if (route.vnc && !await authorized(request)) return deny(response);
  const upstream = httpRequest({ hostname: "127.0.0.1", port: route.port, path: route.path,
    method: request.method, headers: forwardedHeaders(request, route.port), timeout: 15000 }, upstreamResponse => {
    const headers = { ...upstreamResponse.headers, "strict-transport-security": "max-age=31536000",
      "x-content-type-options": "nosniff" };
    // Safari does not consistently match a same-origin wss: URL against CSP 'self'.
    // Only the exact LAN TLS endpoint is allowed; no external WebSocket origin is added.
    if (route.path === "/admin" && headers["content-security-policy"]) {
      headers["content-security-policy"] = headers["content-security-policy"].replace(
        "connect-src 'self'", `connect-src 'self' wss://${address}:${port}`);
    }
    if (headers["set-cookie"]) headers["set-cookie"] = headers["set-cookie"].map(value =>
      value.includes("; Secure") ? value : `${value}; Secure`);
    response.writeHead(upstreamResponse.statusCode ?? 502, headers);
    upstreamResponse.pipe(response);
  });
  upstream.on("error", () => deny(response, 502));
  request.pipe(upstream);
});

server.on("upgrade", async (request, client, head) => {
  if (!isAllowed(request) || request.url !== "/admin/vnc/websockify" || !await authorized(request)) {
    client.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    return;
  }
  const upstream = new Socket();
  upstream.setTimeout(10_000, () => upstream.destroy());
  upstream.once("error", () => client.destroy());
  client.once("error", () => upstream.destroy());
  upstream.connect(vncPort, "127.0.0.1", () => {
    upstream.setTimeout(0);
    const headers = forwardedHeaders(request, vncPort);
    const lines = ["GET /websockify HTTP/1.1", ...Object.entries(headers)
      .filter(([name]) => name !== "connection" && name !== "upgrade")
      .map(([name, value]) => `${name}: ${value}`), "Connection: Upgrade", "Upgrade: websocket", "", ""];
    upstream.write(lines.join("\r\n"));
    if (head.length) upstream.write(head);
    upstream.pipe(client);
    client.pipe(upstream);
  });
});

server.listen(port, address);
