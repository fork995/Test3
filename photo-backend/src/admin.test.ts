import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createAdminServer, hashAdminPassword, type BrowserControl } from "./admin.js";

let active = false;
const browser: BrowserControl = { start() { active = true; return true; }, stop() { active = false; }, running() { return active; } };
let server: ReturnType<typeof createAdminServer>;
let base: string;
before(async () => {
  server = createAdminServer(await hashAdminPassword("synthetic-admin-password-123"), browser);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("No admin address");
  base = `http://127.0.0.1:${address.port}`;
});
after(() => new Promise<void>(resolve => server.close(() => resolve())));
test("admin requires password, CSRF and local Origin; logout stops browser", async () => {
  const noAuth = await fetch(base + "/admin/status");
  assert.equal(noAuth.status, 401);
  const bad = await fetch(base + "/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "wrong" }) });
  assert.equal(bad.status, 401);
  const login = await fetch(base + "/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "synthetic-admin-password-123" }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);
  const page = await (await fetch(base + "/admin", { headers: { Cookie: cookie } })).text();
  const csrf = /const csrf="([A-Za-z0-9_-]+)"/.exec(page)?.[1];
  assert.ok(csrf);
  const rejected = await fetch(base + "/admin/browser/start", { method: "POST", headers: { Cookie: cookie } });
  assert.equal(rejected.status, 403);
  const start = await fetch(base + "/admin/browser/start", { method: "POST", headers: { Cookie: cookie, "X-CSRF-Token": csrf } });
  assert.equal(start.status, 200);
  assert.equal(browser.running(), true);
  const crossOrigin = await fetch(base + "/admin/status", { headers: { Cookie: cookie, Origin: "https://example.org" } });
  assert.equal(crossOrigin.status, 403);
  const logout = await fetch(base + "/admin/logout", { method: "POST", headers: { Cookie: cookie, "X-CSRF-Token": csrf } });
  assert.equal(logout.status, 200);
  assert.equal(browser.running(), false);
});
