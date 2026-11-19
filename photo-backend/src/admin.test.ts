import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { request as httpRequest } from "node:http";
import { createAdminServer, hashAdminPassword, type BrowserControl } from "./admin.js";
import { AdminOidcSession } from "./oidcSession.js";

let active = false;
const browser: BrowserControl = { start() { active = true; return true; }, open() { return active; },
  stop() { active = false; }, running() { return active; } };
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
  const status = await (await fetch(base + "/admin/status", { headers: { Cookie: cookie } })).json() as { authorization: string; s3Credentials: boolean };
  assert.equal(status.authorization, "absent");
  assert.equal(status.s3Credentials, false);
  const noOidc = await fetch(base + "/admin/oidc/start", { method: "POST", headers: { Cookie: cookie, "X-CSRF-Token": csrf } });
  assert.equal(noOidc.status, 503);
  const noApi = await fetch(base + "/admin/check", { method: "POST", headers: { Cookie: cookie, "X-CSRF-Token": csrf } });
  assert.equal(noApi.status, 401);
  const logout = await fetch(base + "/admin/logout", { method: "POST", headers: { Cookie: cookie, "X-CSRF-Token": csrf } });
  assert.equal(logout.status, 200);
  assert.equal(browser.running(), false);
});
test("admin callback links a synthetic OIDC session and check performs only read-only API", async () => {
  let opened = "", nonce = "", reads = 0, running = false;
  const control: BrowserControl = { start() { running = true; return true; }, open(url) { opened = url; return running; },
    stop() { running = false; }, running() { return running; } };
  const oidc = new AdminOidcSession({ clientId: "approved-client-123" }, async (input, init) => {
    if (String(input).endsWith("/oauth/token")) return new Response(JSON.stringify({ access_token: "synthetic-access",
      id_token: "synthetic-id", token_type: "Bearer" }), { status: 200 });
    assert.equal(String(input), "https://backend.clevervet.tech/api/branches");
    assert.equal(init?.method, "GET");
    reads++;
    return new Response("[]", { status: 200 });
  }, async (token, config) => ({ iss: config.issuer, aud: config.audience, sub: "synthetic-admin",
    nonce: token === "synthetic-id" ? nonce : undefined, exp: Math.floor(Date.now() / 1000) + 120,
    ...(config.audience === "approved-client-123" ? { "https://storage.yandexcloud.net/credentials":
      { accessKeyId: "synthetic", secretAccessKey: "synthetic" } } : {}) }));
  const local = createAdminServer(await hashAdminPassword("synthetic-admin-password-123"), control, oidc);
  await new Promise<void>(resolve => local.listen(0, "127.0.0.1", resolve));
  try {
    const address = local.address();
    if (!address || typeof address === "string") throw Error("No address");
    const url = `http://127.0.0.1:${address.port}`;
    const login = await fetch(url + "/admin/login", { method: "POST", body: JSON.stringify({ password: "synthetic-admin-password-123" }) });
    const cookie = login.headers.get("set-cookie")?.split(";")[0];
    assert.ok(cookie);
    const page = await (await fetch(url + "/admin", { headers: { Cookie: cookie } })).text();
    const csrf = /const csrf="([A-Za-z0-9_-]+)"/.exec(page)?.[1];
    assert.ok(csrf);
    const headers = { Cookie: cookie, "X-CSRF-Token": csrf };
    assert.equal((await fetch(url + "/admin/browser/start", { method: "POST", headers })).status, 200);
    assert.equal((await fetch(url + "/admin/oidc/start", { method: "POST", headers })).status, 200);
    const authorize = new URL(opened);
    nonce = authorize.searchParams.get("nonce")!;
    const state = authorize.searchParams.get("state")!;
    const callbackStatus = await new Promise<number>((resolve, reject) => {
      const req = httpRequest({ hostname: "127.0.0.1", port: address.port,
        path: `/admin/oidc/callback?code=synthetic&state=${state}`, headers: { Host: "localhost:8788" } }, res => {
        res.resume(); res.on("end", () => resolve(res.statusCode ?? 0));
      });
      req.on("error", reject); req.end();
    });
    assert.equal(callbackStatus, 200);
    assert.equal((await fetch(url + "/admin/check", { method: "POST", headers })).status, 200);
    assert.equal(reads, 1);
    const status = await (await fetch(url + "/admin/status", { headers: { Cookie: cookie } })).json() as
      { authorization: string; s3Credentials: boolean; api: string };
    assert.deepEqual([status.authorization, status.s3Credentials, status.api], ["active", true, "available"]);
    assert.equal((await fetch(url + "/admin/session/end", { method: "POST", headers })).status, 200);
    assert.equal(oidc.status().authorization, "absent");
    assert.equal(running, false);
  } finally { await new Promise<void>(resolve => local.close(() => resolve())); }
});
