import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { readFileSync, lstatSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { pathToFileURL } from "node:url";

const derive = promisify(scrypt);
export interface BrowserControl { start(): boolean; stop(): void; running(): boolean }
export async function hashAdminPassword(password: string) {
  if (password.length < 16) throw Error("Admin password must be at least 16 characters");
  const salt = randomBytes(24);
  const hash = await derive(password, salt, 64) as Buffer;
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}
async function matches(password: string, record: string) {
  const [salt, expected] = record.trim().split(":");
  if (!/^[a-f0-9]{48}$/i.test(salt ?? "") || !/^[a-f0-9]{128}$/i.test(expected ?? "")) throw Error("Invalid admin hash file");
  const actual = await derive(password, Buffer.from(salt, "hex"), 64) as Buffer;
  return timingSafeEqual(actual, Buffer.from(expected, "hex"));
}
export function createBrowserControl(script?: string): BrowserControl {
  let child: ChildProcess | undefined;
  let timer: NodeJS.Timeout | undefined;
  return {
    start() {
      if (!script) return false;
      if (child && child.exitCode === null) return true;
      child = spawn(script, [], { detached: true, stdio: "ignore", shell: false });
      child.on("error", () => { child = undefined; });
      timer = setTimeout(() => this.stop(), 10 * 60_000);
      timer.unref();
      return true;
    },
    stop() {
      if (timer) clearTimeout(timer);
      if (child?.pid) { try { process.kill(-child.pid, "SIGTERM"); } catch { /* already stopped */ } }
      child = undefined;
    },
    running() { return !!child && child.exitCode === null; },
  };
}
async function readJson(request: IncomingMessage) {
  let data = "";
  for await (const chunk of request) {
    data += chunk.toString();
    if (data.length > 4096) throw Error("Request too large");
  }
  return JSON.parse(data) as Record<string, unknown>;
}
function send(response: ServerResponse, status: number, value: Record<string, unknown>) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  response.end(JSON.stringify(value));
}
function html(response: ServerResponse, panel: boolean, csrf = "") {
  const nonce = randomBytes(18).toString("base64url");
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'` });
  response.end(`<!doctype html><html lang="ru"><meta charset="utf-8"><title>CleverVet admin</title>
<style>body{font:16px system-ui;max-width:38rem;margin:3rem auto;padding:1rem;color:#16342b}button,input{font:inherit;padding:.7rem;margin:.4rem 0}button{cursor:pointer}label{display:block}#message{min-height:2rem}</style>
<h1>CleverVet · Orange Pi</h1>${panel ? `<p id="status">Проверка состояния…</p><button id="start">Авторизоваться в CleverVet</button>
<button id="check">Проверить подключение</button><button id="stop">Завершить сессию</button><button id="logout">Выйти из админки</button>
<p>Интерактивный браузер доступен только через отдельный SSH-туннель порта 6080 после запуска.</p>
<a id="vnc" hidden href="http://127.0.0.1:6080/vnc.html?host=127.0.0.1&port=6080">Открыть окно Chromium</a>` :
`<form id="login"><label>Пароль администратора <input id="password" type="password" autocomplete="current-password" required></label><button>Войти</button></form>`}
<p id="message" role="status"></p><script nonce="${nonce}">
const msg=document.getElementById('message');const csrf=${JSON.stringify(csrf)};
async function post(path,data={}){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(data)});return {status:r.status,...await r.json()}}
${panel ? `async function refresh(){const r=await fetch('/admin/status');const s=await r.json();document.getElementById('status').textContent='CleverVet: '+s.clevervet+' · Chromium: '+(s.browser?'работает':'остановлен');document.getElementById('vnc').hidden=!s.browser;}
for(const [id,path] of [['start','/admin/browser/start'],['check','/admin/check'],['stop','/admin/browser/stop'],['logout','/admin/logout']])document.getElementById(id).onclick=async()=>{const r=await post(path);msg.textContent=r.error||r.statusText||'';if(id==='logout')location.reload();else refresh()};refresh();` :
`document.getElementById('login').onsubmit=async e=>{e.preventDefault();const password=document.getElementById('password').value;const r=await post('/admin/login',{password});document.getElementById('password').value='';if(r.status===200)location.reload();else msg.textContent='Неверный пароль или временная блокировка.'}`}
</script></html>`);
}
export function createAdminServer(passwordRecord: string, browser: BrowserControl) {
  const sessions = new Map<string, { csrf: string; expires: number }>();
  const attempts = new Map<string, { count: number; since: number }>();
  return createServer(async (request, response) => {
    const host = request.headers.host;
    if (!host || !/^((127\.0\.0\.1)|(localhost)):\d+$/.test(host)) return send(response, 403, { error: "LOCAL_ONLY" });
    const incomingOrigin = request.headers.origin;
    if (incomingOrigin && incomingOrigin !== `http://${host}`) return send(response, 403, { error: "ORIGIN_DENIED" });
    const cookie = /(?:^|;\s*)cv_admin=([A-Za-z0-9_-]+)/.exec(request.headers.cookie ?? "")?.[1];
    const session = cookie ? sessions.get(cookie) : undefined;
    const valid = !!session && session.expires > Date.now();
    if (request.method === "GET" && request.url === "/admin") return html(response, valid, session?.csrf);
    if (request.method === "POST" && request.url === "/admin/login") {
      const ip = request.socket.remoteAddress ?? "local";
      const state = attempts.get(ip) ?? { count: 0, since: Date.now() };
      if (Date.now() - state.since > 60_000) { state.count = 0; state.since = Date.now(); }
      if (state.count >= 5) return send(response, 429, { error: "RATE_LIMIT" });
      let password = "";
      try { const data = await readJson(request); password = typeof data.password === "string" ? data.password : ""; }
      catch { return send(response, 400, { error: "BAD_REQUEST" }); }
      if (!await matches(password, passwordRecord)) { state.count++; attempts.set(ip, state); return send(response, 401, { error: "AUTH_INVALID" }); }
      attempts.delete(ip);
      const id = randomBytes(32).toString("base64url");
      sessions.set(id, { csrf: randomBytes(24).toString("base64url"), expires: Date.now() + 60 * 60_000 });
      response.setHeader("Set-Cookie", `cv_admin=${id}; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=3600`);
      return send(response, 200, { statusText: "Вход выполнен" });
    }
    if (!valid) return send(response, 401, { error: "AUTH_REQUIRED" });
    if (request.method === "GET" && request.url === "/admin/status") return send(response, 200,
      { clevervet: "не авторизован", browser: browser.running(), api: "не проверен" });
    if (request.method !== "POST" || request.headers["x-csrf-token"] !== session.csrf)
      return send(response, 403, { error: "CSRF_DENIED" });
    if (request.url === "/admin/browser/start") return send(response, browser.start() ? 200 : 503,
      { statusText: browser.running() ? "Chromium запускается" : "", ...(browser.running() ? {} : { error: "DISPLAY_UNAVAILABLE" }) });
    if (request.url === "/admin/browser/stop") { browser.stop(); return send(response, 200, { statusText: "Браузер остановлен" }); }
    if (request.url === "/admin/check") return send(response, 503, { error: "CLEVERVET_SESSION_UNAVAILABLE" });
    if (request.url === "/admin/logout") { sessions.delete(cookie!); browser.stop(); response.setHeader("Set-Cookie", "cv_admin=; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=0"); return send(response, 200, { statusText: "Выход" }); }
    return send(response, 404, { error: "NOT_FOUND" });
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const hashFile = process.env.ADMIN_PASSWORD_HASH_FILE;
  if (!hashFile) throw Error("ADMIN_PASSWORD_HASH_FILE required");
  const info = lstatSync(hashFile);
  if (info.isSymbolicLink() || (process.platform !== "win32" && (info.mode & 0o077))) throw Error("Admin hash file must be a private regular file");
  const record = readFileSync(hashFile, "utf8");
  const browser = createBrowserControl(process.env.BROWSER_LAUNCH_SCRIPT);
  const server = createAdminServer(record, browser);
  server.listen(8788, "127.0.0.1");
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => { browser.stop(); server.close(); });
}
