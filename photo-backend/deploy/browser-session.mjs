import { createServer } from "node:net";
import { chmodSync, existsSync, unlinkSync } from "node:fs";
import { chromium } from "/home/admin/clevervet-runtime/admin-browser/node_modules/playwright/index.mjs";
import { browserCacheProbe } from "../dist/browserCache.js";

const profile = process.argv[2];
const socketPath = "/dev/shm/clevervet-browser-control.sock";
if (!profile?.startsWith("/dev/shm/clevervet-browser.")) throw Error("Invalid browser profile");
if (existsSync(socketPath)) unlinkSync(socketPath);
const context = await chromium.launchPersistentContext(profile, {
  executablePath: "/home/admin/clevervet-runtime/pw-browsers/chromium-1255/chrome-linux-arm64/chrome",
  headless: false, viewport: { width: 1024, height: 768 },
  args: ["--no-first-run", "--disable-gpu"],
});
const page = context.pages()[0] ?? await context.newPage();
await page.goto("https://www.app.clevervet.tech", { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => {});

async function snapshot() {
  const found = new Map();
  for (const tab of context.pages()) {
    if (tab.isClosed()) continue;
    let origin;
    try { origin = new URL(tab.url()).origin; } catch { continue; }
    if (origin !== "https://www.app.clevervet.tech") continue;
    let value;
    try { value = await tab.evaluate(browserCacheProbe); } catch { continue; }
    if (value) found.set(`${value.accessToken}.${value.idToken}`, value);
  }
  if (found.size === 0) return { ok: false, error: "NO_SESSION" };
  if (found.size > 1) return { ok: false, error: "AMBIGUOUS_SESSION" };
  return { ok: true, ...found.values().next().value };
}

const server = createServer(socket => {
  let received = false;
  socket.setTimeout(5_000, () => socket.destroy());
  socket.on("data", data => {
    if (received) return;
    received = true;
    if (data.length > 128 || data.toString("utf8").trim() !== "snapshot") {
      socket.end(JSON.stringify({ ok: false, error: "BAD_COMMAND" }));
      return;
    }
    void snapshot().then(result => socket.end(JSON.stringify(result)),
      () => socket.end(JSON.stringify({ ok: false, error: "BROWSER_UNAVAILABLE" })));
  });
});
server.listen(socketPath, () => chmodSync(socketPath, 0o600));

let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  server.close();
  try { await context.close(); } catch { /* browser already closed */ }
  try { unlinkSync(socketPath); } catch { /* socket already removed */ }
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { void close(); });
context.on("close", () => { void close(); });
