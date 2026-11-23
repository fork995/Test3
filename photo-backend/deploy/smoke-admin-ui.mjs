import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createAdminServer, createBrowserControl, hashAdminPassword } from "../dist/admin.js";
import { chromium } from "/home/admin/clevervet-runtime/admin-browser/node_modules/playwright/index.mjs";

const base = "/home/admin/clevervet-runtime";
const address = "192.168.3.108";
const port = 8444;
const password = randomBytes(32).toString("base64url");
const control = createBrowserControl(`${base}/photo-backend/deploy/browser-session.sh`, 180_000,
  "/dev/shm/clevervet-vnc-password");
const server = createAdminServer(await hashAdminPassword(password), control);
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const adminPort = server.address().port;
const proxy = spawn(`${base}/node-v22.23.5-linux-arm64/bin/node`, [`${base}/photo-backend/deploy/lan-https.mjs`], {
  env: { ...process.env, LAN_HTTPS_ADDRESS: address, LAN_HTTPS_PORT: String(port),
    LAN_HTTPS_ADMIN_PORT: String(adminPort), LAN_HTTPS_VNC_PORT: "6080",
    LAN_HTTPS_KEY_FILE: `${base}/lan-tls/server.key`, LAN_HTTPS_CERT_FILE: `${base}/lan-tls/server.crt` },
  stdio: "ignore",
});
let client;
try {
  client = await chromium.launch({ executablePath: `${base}/pw-browsers/chromium-1255/chrome-linux-arm64/chrome`,
    headless: true, args: ["--no-sandbox", "--disable-gpu"],
    env: { ...process.env, LD_LIBRARY_PATH: `${base}/display-libs/root/usr/lib/aarch64-linux-gnu:${base}/browser-libs/root/usr/lib/aarch64-linux-gnu` } });
  const context = await client.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const url = `https://${address}:${port}/admin`;
  for (let attempt = 0; attempt < 10; attempt++) {
    try { await page.goto(url); break; }
    catch (error) { if (attempt === 9) throw error; await new Promise(resolve => setTimeout(resolve, 300)); }
  }
  await page.locator("#password").fill(password);
  await page.locator("#login button").click();
  await page.locator("#start").click();
  await page.waitForFunction(() => document.querySelector("#vncStatus")?.textContent === "Chromium подключён",
    undefined, { timeout: 30_000 });
  const screen = page.locator("#screen canvas");
  await screen.waitFor();
  const canvas = await screen.evaluate(node => ({ width: node.width, height: node.height }));
  const imageBytes = (await screen.screenshot()).length;
  process.stdout.write(`button_connected=true canvas=${canvas.width}x${canvas.height} image_bytes=${imageBytes}\n`);
  await page.waitForTimeout(61_000);
  process.stdout.write(`stable=${await page.locator("#vncStatus").textContent()}\n`);
  await page.locator("#stop").click();
  await page.waitForFunction(() => document.querySelector("#status")?.textContent?.includes("остановлен"),
    undefined, { timeout: 15_000 });
  process.stdout.write("stopped=true\n");
  await page.locator("#start").click();
  await page.waitForFunction(() => document.querySelector("#vncStatus")?.textContent === "Chromium подключён",
    undefined, { timeout: 30_000 });
  process.stdout.write("restarted=true\n");
  await page.locator("#stop").click();
  await context.close();
} finally {
  await control.stop();
  if (client) await client.close();
  proxy.kill("SIGTERM");
  await new Promise(resolve => server.close(resolve));
}
