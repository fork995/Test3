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
  const browserEnv = { ...process.env,
    LD_LIBRARY_PATH: `${base}/display-libs/root/usr/lib/aarch64-linux-gnu:${base}/browser-libs/root/usr/lib/aarch64-linux-gnu`,
    FONTCONFIG_FILE: `${base}/browser-libs/root/etc/fonts/fonts.conf`,
    XDG_DATA_DIRS: `${base}/browser-libs/root/usr/share:${base}/display-libs/root/usr/share:/usr/share`,
    XKB_CONFIG_ROOT: "/usr/share/X11/xkb" };
  client = await chromium.launch({ executablePath: `${base}/pw-browsers/chromium-1255/chrome-linux-arm64/chrome`,
    headless: true, args: ["--no-sandbox", "--disable-gpu"],
    env: browserEnv });
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
  try {
    await page.waitForFunction(() => document.querySelector("#vncStatus")?.textContent === "Chromium подключён",
      undefined, { timeout: 30_000 });
  } catch (error) {
    const diagnostics = await page.evaluate(() => ({
      vncStatus: document.querySelector("#vncStatus")?.textContent,
      stages: [...document.querySelectorAll("#vncStages li")].map(node => node.textContent),
      browserStatus: document.querySelector("#status")?.textContent,
      message: document.querySelector("#message")?.textContent }));
    process.stdout.write(`diagnostics=${JSON.stringify(diagnostics)}\n`);
    throw error;
  }
  const screen = page.locator("#screen canvas");
  await screen.waitFor();
  await page.waitForTimeout(5000);
  const canvas = await screen.evaluate(node => ({ width: node.width, height: node.height }));
  const imageBytes = (await screen.screenshot({ path: "/tmp/clevervet-smoke-before.png" })).length;
  const display = await page.evaluate(() => ({
    rfbState: rfb?._rfbConnectionState, socket: rfb?._sock?.readyState,
    framebuffer: [rfb?._fbWidth, rfb?._fbHeight],
    display: [rfb?._display?._fbWidth, rfb?._display?._fbHeight],
    update: { rects: rfb?._FBU?.rects, encoding: rfb?._FBU?.encoding,
      width: rfb?._FBU?.width, height: rfb?._FBU?.height },
    receiveBytes: rfb?._sock?.rQlen(), pending: rfb?._display?.pending(), flushing: rfb?._flushing,
    pixel: [...document.querySelector("#screen canvas").getContext("2d").getImageData(0, 0, 1, 1).data] }));
  process.stdout.write("rfb_display=" + JSON.stringify(display) + "\n");
  process.stdout.write(`button_connected=true canvas=${canvas.width}x${canvas.height} image_bytes=${imageBytes}\n`);
  if (display.pixel[3] === 0) throw Error("VNC_FRAMEBUFFER_EMPTY");
  const beforeInput = await screen.evaluate(node => node.toDataURL());
  await screen.click();
  await page.keyboard.press("Control+L");
  await page.keyboard.type("about:version");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);
  const afterInput = await screen.evaluate(node => node.toDataURL());
  await screen.screenshot({ path: "/tmp/clevervet-smoke-after.png" });
  await page.keyboard.press("Escape");
  process.stdout.write("keyboard_frame_changed=" + (beforeInput !== afterInput) + "\n");
  await page.waitForTimeout(61_000);
  process.stdout.write(`stable=${await page.locator("#vncStatus").textContent()}\n`);
  await page.locator("#stop").click();
  await page.waitForFunction(() => document.querySelector("#status")?.textContent?.includes("остановлен"),
    undefined, { timeout: 15_000 });
  process.stdout.write("stopped=true\n");
  await page.locator("#start").click();
  try {
    await page.waitForFunction(() => document.querySelector("#vncStatus")?.textContent === "Chromium подключён",
      undefined, { timeout: 30_000 });
  } catch (error) {
    const diagnostics = await page.evaluate(() => ({
      vncStatus: document.querySelector("#vncStatus")?.textContent,
      stages: [...document.querySelectorAll("#vncStages li")].map(node => node.textContent),
      browserStatus: document.querySelector("#status")?.textContent,
      message: document.querySelector("#message")?.textContent }));
    process.stdout.write(`restart_diagnostics=${JSON.stringify(diagnostics)}\n`);
    throw error;
  }
  process.stdout.write("restarted=true\n");
  await page.locator("#stop").click();
  await context.close();
} finally {
  await control.stop();
  if (client) await client.close();
  proxy.kill("SIGTERM");
  await new Promise(resolve => server.close(resolve));
}
