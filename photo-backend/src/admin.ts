import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { readFileSync, lstatSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { pathToFileURL } from "node:url";
import { AdminOidcSession, callbackUrl, loadOidcSettings } from "./oidcSession.js";

const derive = promisify(scrypt);
export interface BrowserControl {
  start(): boolean;
  open(url: string): boolean;
  stop(): void;
  running(): boolean;
  password(): string | undefined;
}
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
export function browserDurationMs(value?: string): number {
  const minutes = value === undefined ? 20 : Number(value);
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 120) throw Error("ADMIN_BROWSER_MINUTES must be 5..120");
  return minutes * 60_000;
}
function readVncPassword(path?: string): string | undefined {
  if (!path) return undefined;
  try {
    const info = lstatSync(path);
    if (!info.isFile() || info.isSymbolicLink() || info.size < 8 || info.size > 64 ||
      (process.platform !== "win32" && (info.mode & 0o077))) return undefined;
    const password = readFileSync(path, "utf8").trim();
    return /^[a-f0-9]{8}$/i.test(password) ? password : undefined;
  } catch { return undefined; }
}
export function createBrowserControl(script?: string, openScript?: string, durationMs = browserDurationMs(),
  passwordFile?: string): BrowserControl {
  let child: ChildProcess | undefined;
  let timer: NodeJS.Timeout | undefined;
  const control: BrowserControl = {
    start() {
      if (!script) return false;
      if (child && child.exitCode === null) return true;
      if (timer) clearTimeout(timer);
      child = spawn(script, [], { detached: true, stdio: "ignore", shell: false });
      const launched = child;
      const finished = () => {
        if (child !== launched) return;
        child = undefined;
        if (timer) clearTimeout(timer);
        timer = undefined;
      };
      child.once("error", finished);
      child.once("exit", finished);
      timer = setTimeout(() => control.stop(), durationMs);
      timer.unref();
      return true;
    },
    open(url) {
      if (!openScript || !this.running() || !url.startsWith("https://dev-l4aq9wjx.eu.auth0.com/authorize?")) return false;
      const process = spawn(openScript, [url], { stdio: "ignore", shell: false });
      process.on("error", () => {});
      return true;
    },
    stop() {
      if (timer) clearTimeout(timer);
      if (child?.pid) { try { process.kill(-child.pid, "SIGTERM"); } catch { /* already stopped */ } }
      child = undefined;
      timer = undefined;
    },
    running() { return !!child && child.exitCode === null; },
    password() { return this.running() ? readVncPassword(passwordFile) : undefined; },
  };
  return control;
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
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" });
  response.end(JSON.stringify(value));
}
function html(response: ServerResponse, panel: boolean, csrf = "") {
  const nonce = randomBytes(18).toString("base64url");
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": `default-src 'none'; script-src 'self' 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'` });
  response.end(`<!doctype html><html lang="ru"><meta charset="utf-8"><title>CleverVet admin</title>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>body{font:16px system-ui;max-width:70rem;margin:2rem auto;padding:1rem;color:#16342b;background:#f6faf8}button,input{font:inherit;padding:.7rem;margin:.3rem}button{cursor:pointer}.actions{display:flex;flex-wrap:wrap;gap:.35rem}label{display:block}#message{min-height:2rem}#viewer{margin-top:1rem;padding:1rem;background:#fff;border:1px solid #b8cec5;border-radius:.7rem}#screen{width:100%;aspect-ratio:4/3;background:#17201d;overflow:hidden;touch-action:none}#screen canvas{width:100%!important;height:100%!important;object-fit:contain}#vncPassword{display:inline-block;padding:.45rem;font:1rem ui-monospace,monospace;background:#edf4f1}@media(max-width:600px){body{margin:.25rem auto;padding:.65rem}.actions button{flex:1 1 11rem}#viewer{padding:.5rem}}</style>
<h1>CleverVet · Orange Pi</h1>${panel ? `<p id="status">Проверка состояния…</p><div class="actions"><button id="start">Открыть Chromium</button>
<button id="connect">Подключить OIDC к backend</button><button id="check">Проверить API</button><button id="stop">Закрыть Chromium</button>
<button id="showPassword">Показать / скопировать пароль VNC</button><button id="end">Завершить серверную сессию</button><button id="logout">Выйти из админки</button></div>
<section id="viewer" hidden><p id="vncStatus">Подключение к Chromium…</p><div id="screen" aria-label="Удалённый экран Chromium"></div><p><output id="vncPassword" hidden></output></p></section>` :
`<form id="login"><label>Пароль администратора <input id="password" type="password" autocomplete="current-password" required></label><button>Войти</button></form>`}
<p id="message" role="status"></p><script nonce="${nonce}">
const msg=document.getElementById('message');const csrf=${JSON.stringify(csrf)};
async function post(path,data={}){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(data)});return {status:r.status,...await r.json()}}
${panel ? `let rfb=null;let connecting=false;let retryTimer;const viewer=document.getElementById('viewer');const screen=document.getElementById('screen');const vncStatus=document.getElementById('vncStatus');
function disconnectVnc(){clearTimeout(retryTimer);const current=rfb;rfb=null;connecting=false;if(current)current.disconnect();screen.replaceChildren();viewer.hidden=true;}
function retryVnc(){clearTimeout(retryTimer);retryTimer=setTimeout(()=>void refresh(),1200)}
async function connectVnc(){if(rfb||connecting)return;connecting=true;viewer.hidden=false;vncStatus.textContent='Подключение к Chromium…';
try{const credentials=await post('/admin/vnc/password');if(credentials.status!==200)throw Error(credentials.error||'VNC_NOT_READY');
const {default:RFB}=await import('/admin/vnc/core/rfb.js');const scheme=location.protocol==='https:'?'wss':'ws';const client=new RFB(screen,scheme+'://'+location.host+'/admin/vnc/websockify',{credentials:{password:credentials.password}});client.scaleViewport=true;client.resizeSession=true;rfb=client;
client.addEventListener('connect',()=>{vncStatus.textContent='Chromium подключён';msg.textContent=''});
client.addEventListener('credentialsrequired',async()=>{const latest=await post('/admin/vnc/password');if(latest.status===200)client.sendCredentials({password:latest.password})});
client.addEventListener('securityfailure',event=>{msg.textContent='Ошибка VNC-аутентификации: '+(event.detail?.reason||'доступ отклонён')});
client.addEventListener('disconnect',()=>{if(rfb!==client)return;rfb=null;vncStatus.textContent='Соединение с Chromium прервано';retryVnc()});
}catch{vncStatus.textContent='Chromium запускается…';retryVnc()}finally{connecting=false}}
async function refresh(){const r=await fetch('/admin/status');if(r.status===401){location.reload();return}const s=await r.json();document.getElementById('status').textContent='CleverVet: '+s.authorization+' · Учётная запись: '+(s.subject||'—')+' · API: '+s.api+' · Chromium: '+(s.browser?'работает':'остановлен');if(s.browser)void connectVnc();else disconnectVnc()}
for(const [id,path] of [['start','/admin/browser/start'],['connect','/admin/oidc/start'],['check','/admin/check'],['stop','/admin/browser/stop'],['end','/admin/session/end'],['logout','/admin/logout']])document.getElementById(id).onclick=async()=>{const r=await post(path);msg.textContent=r.error||r.statusText||'';if(id==='logout')location.reload();else void refresh()};
document.getElementById('showPassword').onclick=async()=>{const result=await post('/admin/vnc/password');if(result.status!==200){msg.textContent=result.error||'Пароль VNC пока недоступен';return}const output=document.getElementById('vncPassword');output.textContent=result.password;output.hidden=false;let copied=false;try{await navigator.clipboard.writeText(result.password);copied=true}catch{}msg.textContent=copied?'Пароль VNC показан и скопирован.':'Пароль VNC показан; автоматическое копирование недоступно.';setTimeout(()=>{output.textContent='';output.hidden=true},30000)};
void refresh();setInterval(()=>void refresh(),5000);` :
`document.getElementById('login').onsubmit=async e=>{e.preventDefault();const input=document.getElementById('password');const r=await post('/admin/login',{password:input.value});input.value='';if(r.status===200)location.reload();else msg.textContent='Неверный пароль или временная блокировка.'}`}
</script></html>`);
}
export function createAdminServer(passwordRecord: string, browser: BrowserControl, oidc = new AdminOidcSession()) {
  const sessions = new Map<string, { csrf: string; expires: number }>();
  const attempts = new Map<string, { count: number; since: number }>();
  return createServer(async (request, response) => {
    const host = request.headers.host;
    if (!host || !/^((127\.0\.0\.1)|(localhost)):\d+$/.test(host)) return send(response, 403, { error: "LOCAL_ONLY" });
    const incomingOrigin = request.headers.origin;
    if (incomingOrigin && incomingOrigin !== `http://${host}`) return send(response, 403, { error: "ORIGIN_DENIED" });
    if (request.method === "GET" && request.url?.startsWith("/admin/oidc/callback?")) {
      if (host !== "localhost:8788") return send(response, 403, { error: "CALLBACK_HOST_DENIED" });
      const query = new URL(request.url, callbackUrl);
      try {
        await oidc.complete(query.searchParams.get("code") ?? "", query.searchParams.get("state") ?? "");
        response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" });
        return response.end("Backend authorization complete. Return to the admin panel.");
      } catch { return send(response, 400, { error: "OIDC_CALLBACK_FAILED" }); }
    }
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
      { ...oidc.status(), browser: browser.running() });
    if (request.method !== "POST" || request.headers["x-csrf-token"] !== session.csrf)
      return send(response, 403, { error: "CSRF_DENIED" });
    if (request.url === "/admin/vnc/password") {
      if (!browser.running()) return send(response, 409, { error: "BROWSER_NOT_RUNNING" });
      const password = browser.password();
      return password ? send(response, 200, { password }) : send(response, 503, { error: "VNC_NOT_READY" });
    }
    if (request.url === "/admin/browser/start") return send(response, browser.start() ? 200 : 503,
      { statusText: browser.running() ? "Chromium запускается" : "", ...(browser.running() ? {} : { error: "DISPLAY_UNAVAILABLE" }) });
    if (request.url === "/admin/browser/stop") { browser.stop(); return send(response, 200, { statusText: "Браузер остановлен" }); }
    if (request.url === "/admin/oidc/start") {
      if (!browser.running()) return send(response, 409, { error: "BROWSER_NOT_RUNNING" });
      let url: string;
      try { url = oidc.begin(); } catch { return send(response, 503, { error: "OIDC_CLIENT_NOT_CONFIGURED" }); }
      const opened = browser.open(url);
      return send(response, opened ? 200 : 503,
        opened ? { statusText: "OIDC authorization opened in Chromium" } : { error: "BROWSER_UNAVAILABLE" });
    }
    if (request.url === "/admin/check") {
      try { return send(response, 200, await oidc.checkApi()); }
      catch (error) { const code = error instanceof Error ? error.message : "CLEVERVET_API_UNAVAILABLE";
        return send(response, code === "CLEVERVET_SESSION_UNAVAILABLE" ? 401 : code === "CLEVERVET_API_FORBIDDEN" ? 403 : 503,
          { error: code }); }
    }
    if (request.url === "/admin/session/end") { oidc.clear(); browser.stop(); return send(response, 200, { statusText: "Серверная сессия завершена" }); }
    if (request.url === "/admin/logout") { sessions.delete(cookie!); oidc.clear(); browser.stop(); response.setHeader("Set-Cookie", "cv_admin=; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=0"); return send(response, 200, { statusText: "Выход" }); }
    return send(response, 404, { error: "NOT_FOUND" });
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const hashFile = process.env.ADMIN_PASSWORD_HASH_FILE;
  if (!hashFile) throw Error("ADMIN_PASSWORD_HASH_FILE required");
  const info = lstatSync(hashFile);
  if (info.isSymbolicLink() || (process.platform !== "win32" && (info.mode & 0o077))) throw Error("Admin hash file must be a private regular file");
  const record = readFileSync(hashFile, "utf8");
  const browser = createBrowserControl(process.env.BROWSER_LAUNCH_SCRIPT, process.env.BROWSER_OPEN_URL_SCRIPT,
    browserDurationMs(process.env.ADMIN_BROWSER_MINUTES), process.env.VNC_PASSWORD_FILE);
  const oidc = new AdminOidcSession(loadOidcSettings(process.env));
  const server = createAdminServer(record, browser, oidc);
  server.listen(8788, "127.0.0.1");
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => { oidc.clear(); browser.stop(); server.close(); });
}
