import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { readFileSync, lstatSync, appendFileSync, chmodSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { createConnection } from "node:net";
import { pathToFileURL } from "node:url";
import { AdminOidcSession } from "./oidcSession.js";

const derive = promisify(scrypt);
export interface BrowserControl {
  start(): boolean;
  stop(): Promise<void>;
  running(): boolean;
  password(): string | undefined;
  status(): Promise<{ phase: "stopped" | "stopping" | "starting" | "ready" | "failed"; reason?: string }>;
}
function browserEvent(event: string, details: Record<string, string | number | null> = {}) {
  const path = process.env.ADMIN_BROWSER_EVENT_LOG;
  if (!path) return;
  try {
    appendFileSync(path, JSON.stringify({ at: new Date().toISOString(), event, ...details }) + "\n",
      { mode: 0o600, flag: "a" });
    if (process.platform !== "win32") chmodSync(path, 0o600);
  } catch { /* diagnostics must not crash the admin server */ }
}
async function portReady(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = createConnection({ host: "127.0.0.1", port });
    const done = (ready: boolean) => { socket.destroy(); resolve(ready); };
    socket.setTimeout(500, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
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
export function createBrowserControl(script?: string, durationMs = browserDurationMs(),
  passwordFile?: string): BrowserControl {
  let child: ChildProcess | undefined;
  let timer: NodeJS.Timeout | undefined;
  let phase: "stopped" | "stopping" | "starting" | "ready" | "failed" = "stopped";
  let reason: string | undefined;
  let stopRequested = false;
  let startedAt = 0;
  let stopPromise: Promise<void> | undefined;
  const control: BrowserControl = {
    start() {
      if (!script) return false;
      if (stopRequested && child) return false;
      if (child && child.exitCode === null && child.signalCode === null) return true;
      if (timer) clearTimeout(timer);
      phase = "starting";
      startedAt = Date.now();
      reason = undefined;
      stopRequested = false;
      browserEvent("start_requested");
      try { child = spawn(script, [], { detached: true, stdio: "ignore", shell: false }); }
      catch { phase = "failed"; reason = "SPAWN_FAILED"; browserEvent("spawn_failed"); return false; }
      const launched = child;
      browserEvent("spawned", { pid: launched.pid ?? null });
      const finished = (code: number | null, signal: NodeJS.Signals | null) => {
        if (child !== launched) return;
        child = undefined;
        if (timer) clearTimeout(timer);
        timer = undefined;
        phase = stopRequested ? "stopped" : "failed";
        reason = stopRequested ? undefined : `PROCESS_EXIT_${code ?? signal ?? "UNKNOWN"}`;
        browserEvent("exited", { code, signal: signal ?? null, expected: stopRequested ? 1 : 0 });
      };
      child.once("error", (error: NodeJS.ErrnoException) => {
        if (child !== launched) return;
        phase = "failed";
        reason = `SPAWN_${error.code ?? "ERROR"}`;
        browserEvent("spawn_error", { code: error.code ?? "ERROR" });
        child = undefined;
        if (timer) clearTimeout(timer);
      });
      child.once("exit", finished);
      timer = setTimeout(() => { void control.stop(); }, durationMs);
      timer.unref();
      return true;
    },
    async stop() {
      if (stopPromise) return stopPromise;
      stopRequested = true;
      browserEvent("stop_requested", { pid: child?.pid ?? null });
      if (timer) clearTimeout(timer);
      timer = undefined;
      const launched = child;
      if (!launched || launched.exitCode !== null || launched.signalCode !== null) {
        child = undefined; phase = "stopped"; reason = undefined; return;
      }
      phase = "stopping";
      stopPromise = new Promise<void>(resolve => {
        launched.once("exit", () => resolve());
        launched.once("error", () => resolve());
        const timeout = setTimeout(resolve, 5000);
        timeout.unref();
        if (launched.pid) { try { process.kill(-launched.pid, "SIGTERM"); }
          catch { try { launched.kill("SIGTERM"); } catch { resolve(); } } }
        else resolve();
      }).then(() => {
        if (child === launched) { phase = "failed"; reason = "STOP_TIMEOUT"; }
        else { phase = "stopped"; reason = undefined; }
        stopPromise = undefined;
      });
      return stopPromise;
    },
    running() { return !stopRequested && !!child && child.exitCode === null && child.signalCode === null; },
    password() { return this.running() ? readVncPassword(passwordFile) : undefined; },
    async status() {
      if (phase === "failed") return { phase, reason };
      if (phase === "stopping") return { phase };
      if (!this.running()) return { phase: "stopped" };
      const [vnc, web] = await Promise.all([portReady(5900), portReady(6080)]);
      let browserSocket = false;
      try { const info = lstatSync("/dev/shm/clevervet-browser-control.sock"); browserSocket = info.isSocket(); }
      catch { /* not ready */ }
      const ready = vnc && web && browserSocket && !!this.password();
      if (ready && phase !== "ready") { phase = "ready"; browserEvent("ready", { pid: child?.pid ?? null }); }
      if (!ready && Date.now() - startedAt > 20_000) {
        browserEvent("readiness_timeout", { vnc: vnc ? 1 : 0, websockify: web ? 1 : 0,
          browserSocket: browserSocket ? 1 : 0, password: this.password() ? 1 : 0 });
        await this.stop();
        phase = "failed";
        reason = "READINESS_TIMEOUT";
        return { phase, reason };
      }
      return { phase: ready ? "ready" : "starting" };
    },
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
async function browserTokens(): Promise<{ accessToken: string; idToken: string }> {
  return new Promise((resolve, reject) => {
    const socket = createConnection("/dev/shm/clevervet-browser-control.sock");
    let raw = "";
    socket.setTimeout(7000, () => socket.destroy(Error("BROWSER_TIMEOUT")));
    socket.on("connect", () => socket.write("snapshot\n"));
    socket.on("data", chunk => {
      raw += chunk.toString("utf8");
      if (raw.length > 32000) socket.destroy(Error("BROWSER_RESPONSE_TOO_LARGE"));
    });
    socket.on("error", reject);
    socket.on("end", () => {
      try {
        const result: unknown = JSON.parse(raw);
        if (!result || typeof result !== "object") throw Error("BROWSER_UNAVAILABLE");
        const value = result as Record<string, unknown>;
        if (value.ok !== true || typeof value.accessToken !== "string" || typeof value.idToken !== "string")
          throw Error(typeof value.error === "string" ? value.error : "BROWSER_UNAVAILABLE");
        resolve({ accessToken: value.accessToken, idToken: value.idToken });
      } catch (error) { reject(error); }
    });
  });
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
<button id="connect">Подключить текущую сессию</button><button id="check">Проверить API</button><button id="stop">Закрыть Chromium</button>
<button id="showPassword">Показать / скопировать пароль VNC</button><button id="end">Завершить серверную сессию</button><button id="logout">Выйти из админки</button></div>
<label>Ключ существующего JPEG для проверки HEAD <input id="s3Key" autocomplete="off" spellcheck="false" placeholder="UUID.jpg"></label><button id="headObject">Проверить S3 HEAD</button>
<section id="viewer" hidden><p id="vncStatus">Подключение к Chromium…</p><button id="reconnect" hidden>Повторить подключение noVNC</button><ol id="vncStages" aria-label="Этапы подключения noVNC"></ol><div id="screen" aria-label="Удалённый экран Chromium"></div><p><output id="vncPassword" hidden></output></p></section>` :
`<form id="login"><label>Пароль администратора <input id="password" type="password" autocomplete="current-password" required></label><button>Войти</button></form>`}
<p id="message" role="status"></p><script nonce="${nonce}">
const msg=document.getElementById('message');const csrf=${JSON.stringify(csrf)};
async function post(path,data={}){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(data)});if(!r.headers.get('Content-Type')?.includes('application/json'))return {status:r.status,error:'HTTP_'+r.status+'_NON_JSON'};return {status:r.status,...await r.json()}}
${panel ? `let rfb=null;let connecting=false;let connectFailed=false;let connected=false;let socketOpen=false;let vncGeneration=0;let connectTimer;
const viewer=document.getElementById('viewer');const screen=document.getElementById('screen');const vncStatus=document.getElementById('vncStatus');const reconnect=document.getElementById('reconnect');const vncStages=document.getElementById('vncStages');
const stageNames=['credentials','module_import','rfb_constructor','websocket','rfb_handshake','connected'];
const stageLabels={credentials:'Пароль VNC',module_import:'Модуль noVNC',rfb_constructor:'Создание RFB',websocket:'WebSocket',rfb_handshake:'RFB handshake',connected:'Изображение Chromium'};
function safeError(error,secret=''){const name=String(error?.name||'Error').replace(/[^A-Za-z]/g,'').slice(0,30);
let message=String(error?.message||'Неизвестная ошибка').slice(0,200);if(secret)message=message.split(secret).join('[redacted]');
message=message.replace(/(?:https?|wss?):\\/\\/[^\\s)]+/g,'[url]').replace(/(?:token|cookie|password)\\s*[:=]\\s*[^\\s,;]+/gi,'[redacted]');
const frames=String(error?.stack||'').split('\\n').flatMap(line=>[...line.matchAll(/\\/admin(?:\\/vnc\\/[A-Za-z0-9_./-]+)?:\\d+(?::\\d+)?/g)].map(match=>match[0])).slice(0,2);
return name+': '+message+(frames.length?' · '+frames.join(' ← '):'')}
function stage(name,state,detail=''){const item=vncStages.querySelector('[data-stage="'+name+'"]');if(!item)return;item.textContent=stageLabels[name]+': '+({pending:'ожидание',running:'выполняется',ok:'готово',failed:'ошибка'}[state]||state)+(detail?' — '+detail:'');item.dataset.state=state;
if(state==='failed'){clearTimeout(connectTimer);vncStatus.textContent='noVNC: ошибка на этапе '+stageLabels[name];reconnect.hidden=false;connectFailed=true}}
function resetStages(){vncStages.replaceChildren();for(const name of stageNames){const item=document.createElement('li');item.dataset.stage=name;vncStages.appendChild(item);stage(name,'pending')}}
function failVnc(name,error,secret=''){stage(name,'failed',safeError(error,secret));connecting=false}
function disconnectVnc(){vncGeneration++;clearTimeout(connectTimer);const current=rfb;rfb=null;connecting=false;connected=false;socketOpen=false;connectFailed=false;if(current)current.disconnect();screen.replaceChildren();viewer.hidden=true;reconnect.hidden=true;resetStages()}
async function connectVnc(){if(rfb||connecting||connectFailed)return;const generation=++vncGeneration;connecting=true;viewer.hidden=false;reconnect.hidden=true;vncStatus.textContent='Подключение к Chromium…';resetStages();let currentStage='credentials';let password='';let socket;
try{stage('credentials','running');const credentials=await post('/admin/vnc/password');if(generation!==vncGeneration)return;
if(credentials.status!==200)throw Error(credentials.error||'VNC_NOT_READY');password=credentials.password;stage('credentials','ok');
currentStage='module_import';stage('module_import','running');const {default:RFB}=await import('/admin/vnc/core/rfb.js');if(generation!==vncGeneration)return;stage('module_import','ok');
currentStage='rfb_constructor';stage('rfb_constructor','running');const url=new URL('/admin/vnc/websockify',location.href);url.protocol=location.protocol==='https:'?'wss:':'ws:';
if(!window.WebSocket)throw Error('WebSocket не поддерживается');currentStage='websocket';socket=new WebSocket(url.href);currentStage='rfb_constructor';
const client=new RFB(screen,socket,{credentials:{password}});client.scaleViewport=true;client.resizeSession=true;rfb=client;stage('rfb_constructor','ok');stage('websocket','running');
connectTimer=setTimeout(()=>{if(rfb===client&&!connected)stage(socketOpen?'rfb_handshake':'websocket','failed','Превышено время ожидания 15 с')},15000);
socket.addEventListener('open',()=>{if(rfb!==client)return;socketOpen=true;stage('websocket','ok');stage('rfb_handshake','running')});
socket.addEventListener('error',()=>{if(rfb!==client||connected)return;stage('websocket','failed','Сокет отклонён; проверьте TLS и HTTPS-прокси')});
client.addEventListener('connect',()=>{if(rfb!==client)return;clearTimeout(connectTimer);connected=true;stage('rfb_handshake','ok');stage('connected','ok');vncStatus.textContent='Chromium подключён';msg.textContent='';reconnect.hidden=true;connectFailed=false});
client.addEventListener('credentialsrequired',async()=>{if(rfb!==client)return;stage('rfb_handshake','running','Запрос пароля VNC');try{const latest=await post('/admin/vnc/password');if(rfb!==client)return;if(latest.status!==200)throw Error(latest.error||'VNC_NOT_READY');client.sendCredentials({password:latest.password})}catch(error){failVnc('rfb_handshake',error)}});
client.addEventListener('securityfailure',event=>{if(rfb!==client)return;failVnc('rfb_handshake',Error(event.detail?.reason||'VNC-аутентификация отклонена'))});
client.addEventListener('disconnect',event=>{if(rfb!==client)return;rfb=null;connecting=false;if(connectFailed)return;
const stageName=connected?'connected':socketOpen?'rfb_handshake':'websocket';stage(stageName,'failed',event.detail?.clean?'Соединение закрыто':'Соединение прервано')});
}catch(error){if(socket)socket.close();if(generation===vncGeneration)failVnc(currentStage,error,password)}finally{if(generation===vncGeneration)connecting=false}}
async function refresh(){const r=await fetch('/admin/status');if(r.status===401){location.reload();return}const s=await r.json();const phase=s.browserState.phase;document.getElementById('status').textContent='CleverVet: '+s.authorization+' · Учётная запись: '+(s.subject||'—')+' · API: '+s.api+' · Chromium: '+({ready:'готов',starting:'запускается',stopping:'останавливается',stopped:'остановлен',failed:'ошибка'}[phase]||phase);if(phase==='ready'){void connectVnc()}else{if(!viewer.hidden)disconnectVnc();if(phase==='failed')msg.textContent='Ошибка запуска Chromium: '+s.browserState.reason}}
reconnect.onclick=()=>{clearTimeout(connectTimer);const current=rfb;rfb=null;if(current)current.disconnect();screen.replaceChildren();connectFailed=false;connected=false;socketOpen=false;reconnect.hidden=true;void connectVnc()};
for(const [id,path] of [['start','/admin/browser/start'],['connect','/admin/browser/attach'],['check','/admin/check'],['stop','/admin/browser/stop'],['end','/admin/session/end'],['logout','/admin/logout']])document.getElementById(id).onclick=async()=>{const r=await post(path);msg.textContent=r.error||r.statusText||(r.requests?JSON.stringify(r.requests):'');if(id==='logout')location.reload();else void refresh()};
document.getElementById('showPassword').onclick=async()=>{const result=await post('/admin/vnc/password');if(result.status!==200){msg.textContent=result.error||'Пароль VNC пока недоступен';return}const output=document.getElementById('vncPassword');output.textContent=result.password;output.hidden=false;let copied=false;try{await navigator.clipboard.writeText(result.password);copied=true}catch{}msg.textContent=copied?'Пароль VNC показан и скопирован.':'Пароль VNC показан; автоматическое копирование недоступно.';setTimeout(()=>{output.textContent='';output.hidden=true},30000)};
document.getElementById('headObject').onclick=async()=>{const input=document.getElementById('s3Key');const key=input.value.trim();input.value='';const result=await post('/admin/s3/head',{key});msg.textContent=result.error||JSON.stringify(result.result)};
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
      { ...oidc.status(), browser: browser.running(), browserState: await browser.status() });
    if (request.method !== "POST" || request.headers["x-csrf-token"] !== session.csrf)
      return send(response, 403, { error: "CSRF_DENIED" });
    if (request.url === "/admin/vnc/password") {
      if (!browser.running()) return send(response, 409, { error: "BROWSER_NOT_RUNNING" });
      const password = browser.password();
      return password ? send(response, 200, { password }) : send(response, 503, { error: "VNC_NOT_READY" });
    }
    if (request.url === "/admin/browser/start") {
      const started = browser.start();
      const state = await browser.status();
      return send(response, started ? 202 : 503,
        started ? { statusText: "Chromium запускается", browserState: state } : { error: state.phase === "stopping" ? "BROWSER_STOPPING" : state.reason ?? "SPAWN_FAILED" });
    }
    if (request.url === "/admin/browser/stop") { oidc.clear(); await browser.stop(); return send(response, 200, { statusText: "Браузер остановлен" }); }
    if (request.url === "/admin/browser/attach") {
      if (!browser.running()) return send(response, 409, { error: "BROWSER_NOT_RUNNING" });
      try { const tokens = await browserTokens(); await oidc.attachBrowserTokens(tokens.accessToken, tokens.idToken);
        return send(response, 200, { statusText: "Текущая сессия подключена" }); }
      catch { oidc.clear(); return send(response, 503, { error: "BROWSER_SESSION_UNAVAILABLE" }); }
    }
    if (request.url === "/admin/check") {
      try { return send(response, 200, { requests: await oidc.compareApiOrigins() }); }
      catch { return send(response, 401, { error: "CLEVERVET_SESSION_UNAVAILABLE" }); }
    }
    if (request.url === "/admin/s3/head") {
      try { const input = await readJson(request); const key = input.key;
        if (typeof key !== "string") return send(response, 400, { error: "INVALID_OBJECT_KEY" });
        return send(response, 200, { result: await oidc.headPhotoObject(key) }); }
      catch { return send(response, 400, { error: "S3_HEAD_UNAVAILABLE" }); }
    }
    if (request.url === "/admin/session/end") { oidc.clear(); await browser.stop(); return send(response, 200, { statusText: "Серверная сессия завершена" }); }
    if (request.url === "/admin/logout") { sessions.delete(cookie!); oidc.clear(); await browser.stop(); response.setHeader("Set-Cookie", "cv_admin=; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=0"); return send(response, 200, { statusText: "Выход" }); }
    return send(response, 404, { error: "NOT_FOUND" });
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const hashFile = process.env.ADMIN_PASSWORD_HASH_FILE;
  if (!hashFile) throw Error("ADMIN_PASSWORD_HASH_FILE required");
  const info = lstatSync(hashFile);
  if (info.isSymbolicLink() || (process.platform !== "win32" && (info.mode & 0o077))) throw Error("Admin hash file must be a private regular file");
  const record = readFileSync(hashFile, "utf8");
  const browser = createBrowserControl(process.env.BROWSER_LAUNCH_SCRIPT,
    browserDurationMs(process.env.ADMIN_BROWSER_MINUTES), process.env.VNC_PASSWORD_FILE);
  const oidc = new AdminOidcSession();
  const server = createAdminServer(record, browser, oidc);
  server.listen(8788, "127.0.0.1");
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => { oidc.clear(); void browser.stop().then(() => server.close()); });
}
