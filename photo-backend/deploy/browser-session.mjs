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
  const errors = new Set();
  for (const tab of context.pages()) {
    if (tab.isClosed()) continue;
    let origin;
    try { origin = new URL(tab.url()).origin; } catch { continue; }
    if (origin !== "https://www.app.clevervet.tech") continue;
    let value;
    try { value = await tab.evaluate(browserCacheProbe); }
    catch (error) {
      const code = ["STORAGE_UNAVAILABLE", "TOKEN_FORMAT_UNEXPECTED", "AMBIGUOUS_SESSION"].find(item =>
        String(error?.message ?? "").includes(item));
      errors.add(code ?? "EVALUATE_FAILED");
      continue;
    }
    if (value) found.set(`${value.accessToken}.${value.idToken}`, value);
  }
  if (errors.has("AMBIGUOUS_SESSION")) return { ok: false, error: "AMBIGUOUS_SESSION" };
  if (found.size === 0) return { ok: false, error:
    errors.has("TOKEN_FORMAT_UNEXPECTED") ? "TOKEN_FORMAT_UNEXPECTED" :
    errors.has("STORAGE_UNAVAILABLE") ? "STORAGE_UNAVAILABLE" :
    errors.has("EVALUATE_FAILED") ? "EVALUATE_FAILED" : "NO_SESSION" };
  if (found.size > 1) return { ok: false, error: "AMBIGUOUS_SESSION" };
  return { ok: true, ...found.values().next().value };
}

const server = createServer(socket => {
  let received = false;
  let buffer = Buffer.alloc(0);
  socket.setTimeout(5_000, () => socket.destroy());
  socket.on("data", data => {
    if (received) return;
    buffer = Buffer.concat([buffer, data]);
    if (buffer.length > 65536) { socket.destroy(); return; }
    if (!buffer.includes(10)) return;
    received = true;
    const command = buffer.toString("utf8").trim();
    buffer = Buffer.alloc(0);
    if (command.startsWith("insert ")) {
      void (async () => {
        const payload = JSON.parse(command.slice(7));
        if (typeof payload.text !== "string" || !payload.text || Buffer.byteLength(payload.text) > 16000) throw Error();
        const matches = [];
        for (const tab of context.pages()) {
          if (tab.isClosed()) continue;
          for (const frame of tab.frames()) {
            try {
              if (await frame.evaluate(() => {
                const e = document.activeElement;
                return document.hasFocus() && !!e && ((e instanceof HTMLTextAreaElement && !e.disabled && !e.readOnly) ||
                  (e instanceof HTMLInputElement && !e.disabled && !e.readOnly && ["text", "search", "email", "url", "tel", "password"].includes(e.type)) || e.isContentEditable);
              })) matches.push(tab);
            } catch { /* detached frame */ }
          }
        }
        if (matches.length !== 1) return { ok: false, error: "ACTIVE_FIELD_REQUIRED" };
        await matches[0].keyboard.insertText(payload.text);
        return { ok: true };
      })().then(result => socket.end(JSON.stringify(result)), () => socket.end(JSON.stringify({ ok: false, error: "INSERT_FAILED" })));
      return;
    }
    if (command !== "snapshot") {
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
