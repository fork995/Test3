import { createServer } from 'node:https';
import { request as httpRequest } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { Socket } from 'node:net';

const address = process.env.LAN_HTTPS_ADDRESS ?? '192.168.3.108';
const port = Number(process.env.LAN_HTTPS_PORT ?? '8443');
const adminPort = Number(process.env.LAN_HTTPS_ADMIN_PORT ?? '8788');
const vncPort = Number(process.env.LAN_HTTPS_VNC_PORT ?? '6080');
const origin = `https://${address}:${port}`;
const key = readFileSync(process.env.LAN_HTTPS_KEY_FILE);
const cert = readFileSync(process.env.LAN_HTTPS_CERT_FILE);
const allowed = ip => ip === address || /^192\.168\.3\.(?:[1-9]|[1-9]\d|1\d\d|2[0-4]\d|25[0-4])$/.test(ip);

function deny(res, status = 403) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(status === 404 ? 'Not found' : 'Forbidden');
}
function isAllowed(req) {
  if (!allowed(req.socket.remoteAddress ?? '')) return false;
  if (req.headers.host !== `${address}:${port}`) return false;
  if (req.headers.origin && req.headers.origin !== origin) return false;
  return true;
}
function target(path) {
  if (path.startsWith('/admin/vnc/')) return { port: vncPort, path: '/' + path.slice('/admin/vnc/'.length) };
  if (path === '/admin' || path.startsWith('/admin/')) return { port: adminPort, path };
  return undefined;
}
function headers(req, upstreamPort) {
  const h = { ...req.headers, host: `127.0.0.1:${upstreamPort}` };
  delete h['x-forwarded-for'];
  delete h['x-forwarded-host'];
  delete h['x-forwarded-proto'];
  if (h.origin) h.origin = `http://127.0.0.1:${upstreamPort}`;
  return h;
}
function authorized(req) {
  return new Promise(resolve => {
    const check = httpRequest({ hostname: '127.0.0.1', port: adminPort, path: '/admin/status',
      method: 'GET', headers: { host: `127.0.0.1:${adminPort}`, cookie: req.headers.cookie ?? '' }, timeout: 3000 }, res => {
      res.resume(); resolve(res.statusCode === 200);
    });
    check.on('error', () => resolve(false));
    check.on('timeout', () => { check.destroy(); resolve(false); });
    check.end();
  });
}
const server = createServer({ key, cert, minVersion: 'TLSv1.2' }, async (req, res) => {
  if (!isAllowed(req)) return deny(res);
  const route = target(req.url ?? '');
  if (!route) return deny(res, 404);
  if (route.port === vncPort && !await authorized(req)) return deny(res);
  if (req.url === '/admin/vnc-password') {
    if (!await authorized(req)) return deny(res);
    const path = '/dev/shm/clevervet-vnc-password';
    if (!existsSync(path)) return deny(res, 404);
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(readFileSync(path));
  }
  const upstream = httpRequest({ hostname: '127.0.0.1', port: route.port, path: route.path,
    method: req.method, headers: headers(req, route.port), timeout: 15000 }, upstreamRes => {
    const h = { ...upstreamRes.headers, 'strict-transport-security': 'max-age=31536000',
      'x-content-type-options': 'nosniff' };
    if (h['set-cookie']) h['set-cookie'] = h['set-cookie'].map(value => value.includes('; Secure') ? value : `${value}; Secure`);
    if (route.port === adminPort && req.url === '/admin' && upstreamRes.statusCode === 200) {
      const chunks = [];
      upstreamRes.on('data', chunk => chunks.push(chunk));
      upstreamRes.on('end', () => {
        let body = Buffer.concat(chunks).toString('utf8');
        body = body.replace('http://127.0.0.1:6080/vnc.html?host=127.0.0.1&port=6080',
          '/admin/vnc/vnc.html?path=websockify');
        body = body.replace('Интерактивный браузер доступен только через отдельный SSH-туннель порта 6080 после запуска.',
          'Окно Chromium открывается по защищённому локальному адресу. Пароль VNC: <a href="/admin/vnc-password" target="_blank" rel="noopener">показать после запуска</a>.');
        delete h['content-length'];
        res.writeHead(200, h); res.end(body);
      });
      return;
    }
    res.writeHead(upstreamRes.statusCode ?? 502, h); upstreamRes.pipe(res);
  });
  upstream.on('error', () => deny(res, 502));
  req.pipe(upstream);
});
server.on('upgrade', async (req, client, head) => {
  if (!isAllowed(req) || !req.url?.startsWith('/admin/vnc/') || !await authorized(req)) {
    client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return;
  }
  const route = target(req.url);
  const upstream = new Socket();
  upstream.setTimeout(10000, () => upstream.destroy());
  upstream.once('error', () => client.destroy());
  client.once('error', () => upstream.destroy());
  upstream.connect(vncPort, '127.0.0.1', () => {
    upstream.setTimeout(0);
    const lines = [`GET ${route.path} HTTP/1.1`, ...Object.entries(headers(req, vncPort))
      .filter(([name]) => name !== 'connection' && name !== 'upgrade')
      .map(([name, value]) => `${name}: ${value}`), 'Connection: Upgrade', 'Upgrade: websocket', '', ''];
    upstream.write(lines.join('\r\n'));
    if (head.length) upstream.write(head);
    upstream.pipe(client); client.pipe(upstream);
  });
});
server.listen(port, address);
