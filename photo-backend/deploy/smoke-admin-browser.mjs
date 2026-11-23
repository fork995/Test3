import { randomBytes } from "node:crypto";
import { createAdminServer, createBrowserControl, hashAdminPassword } from "../dist/admin.js";

const script = process.env.BROWSER_LAUNCH_SCRIPT;
const passwordFile = process.env.VNC_PASSWORD_FILE;
if (!script || !passwordFile) throw Error("Browser smoke configuration missing");
const password = randomBytes(32).toString("base64url");
const browser = createBrowserControl(script, 180_000, passwordFile);
const server = createAdminServer(await hashAdminPassword(password), browser);
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string") throw Error("No loopback listener");
const base = `http://127.0.0.1:${address.port}`;
let cookie, csrf;
async function post(path, body = {}) {
  return fetch(base + path, { method: "POST", headers: { Cookie: cookie, "X-CSRF-Token": csrf,
    "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
try {
  const login = await fetch(base + "/admin/login", { method: "POST", body: JSON.stringify({ password }) });
  if (login.status !== 200) throw Error(`Login returned ${login.status}`);
  cookie = login.headers.get("set-cookie")?.split(";")[0];
  const page = await (await fetch(base + "/admin", { headers: { Cookie: cookie } })).text();
  csrf = /const csrf="([A-Za-z0-9_-]+)"/.exec(page)?.[1];
  if (!cookie || !csrf) throw Error("Admin session unavailable");
  for (let cycle = 1; cycle <= 2; cycle++) {
    const started = await post("/admin/browser/start");
    process.stdout.write(`cycle=${cycle} start_http=${started.status}\n`);
    if (started.status !== 202) throw Error("Start failed");
    let ready = false;
    for (let i = 0; i < 30; i++) {
      const status = await (await fetch(base + "/admin/status", { headers: { Cookie: cookie } })).json();
      if (status.browserState.phase === "ready") { ready = true; break; }
      if (status.browserState.phase === "failed") throw Error(`Browser ${status.browserState.reason}`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    if (!ready) throw Error("Browser did not become ready");
    const vnc = await post("/admin/vnc/password");
    process.stdout.write(`cycle=${cycle} ready=${ready} password_http=${vnc.status}\n`);
    if (vnc.status !== 200) throw Error("VNC password unavailable");
    if (cycle === 1) {
      await new Promise(resolve => setTimeout(resolve, 61_000));
      const stable = await (await fetch(base + "/admin/status", { headers: { Cookie: cookie } })).json();
      process.stdout.write(`stable_after_61s=${stable.browserState.phase}\n`);
      if (stable.browserState.phase !== "ready") throw Error("Browser became unavailable");
    }
    const stopped = await post("/admin/browser/stop");
    process.stdout.write(`cycle=${cycle} stop_http=${stopped.status}\n`);
    if (stopped.status !== 200) throw Error("Stop failed");
  }
} finally {
  await browser.stop();
  await new Promise(resolve => server.close(resolve));
}
