import assert from "node:assert/strict";
import { test } from "node:test";
import { createAdminServer, hashAdminPassword, type BrowserControl } from "./admin.js";

test("admin protects browser connection, token checks and VNC password", async () => {
  let running = false;
  const browser: BrowserControl = { start() { running = true; return true; },
    stop() { running = false; }, running() { return running; }, password() { return running ? "a1b2c3d4" : undefined; } };
  const server = createAdminServer(await hashAdminPassword("synthetic-admin-password-123"), browser);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw Error("No address");
    const base = `http://127.0.0.1:${address.port}`;
    assert.equal((await fetch(base + "/admin/browser/attach", { method: "POST" })).status, 401);
    const login = await fetch(base + "/admin/login", { method: "POST",
      body: JSON.stringify({ password: "synthetic-admin-password-123" }) });
    const cookie = login.headers.get("set-cookie")?.split(";")[0];
    assert.ok(cookie);
    const page = await (await fetch(base + "/admin", { headers: { Cookie: cookie } })).text();
    const csrf = /const csrf="([A-Za-z0-9_-]+)"/.exec(page)?.[1];
    assert.ok(csrf);
    assert.match(page, /Подключить текущую сессию/);
    assert.doesNotMatch(page, /localStorage|vnc\.html\?|password=/);
    assert.equal((await fetch(base + "/admin/browser/start", { method: "POST", headers: { Cookie: cookie } })).status, 403);
    const headers = { Cookie: cookie, "X-CSRF-Token": csrf };
    assert.equal((await fetch(base + "/admin/browser/start", { method: "POST", headers })).status, 200);
    assert.equal((await fetch(base + "/admin/vnc/password", { method: "POST", headers: { Cookie: cookie } })).status, 403);
    const password = await fetch(base + "/admin/vnc/password", { method: "POST", headers });
    assert.equal(password.status, 200);
    assert.equal(password.headers.get("cache-control"), "no-store");
    assert.deepEqual(await password.json(), { password: "a1b2c3d4" });
    assert.equal((await fetch(base + "/admin/status", { headers: { Cookie: cookie, Origin: "https://other.example" } })).status, 403);
    assert.equal((await fetch(base + "/admin/oidc/start", { method: "POST", headers })).status, 404);
    assert.equal((await fetch(base + "/admin/oidc/callback?code=x&state=y", { headers: { Cookie: cookie } })).status, 403);
    assert.equal((await fetch(base + "/admin/check", { method: "POST", headers })).status, 401);
    assert.equal((await fetch(base + "/admin/browser/stop", { method: "POST", headers })).status, 200);
    assert.equal((await fetch(base + "/admin/vnc/password", { method: "POST", headers })).status, 409);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
