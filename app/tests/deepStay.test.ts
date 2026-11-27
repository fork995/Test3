import { readFileSync } from 'node:fs';
// jsdom is already a test dependency; the project does not install its type package.
// @ts-expect-error jsdom declarations are not installed
import { JSDOM } from 'jsdom';
import { expect, it, vi } from 'vitest';
const script = readFileSync('../stay/DeepStay.txt', 'utf8');
const key = 'clevervet_test3_auth_bridge_v1';
const ready = 'clevervet-mobile:test3-stay-ready:v1';
const token = 'clevervet-mobile:test3-stay-token:v1';
const bridge = 'clevervet-mobile:test3-stay-bridge-ready:v1';
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function setup(before: boolean, blocked = false) {
  const dom = new JSDOM('<body></body>', { url: 'https://fork995.github.io/Test3/', runScripts: 'outside-only' });
  const w = dom.window as any;
  const now = Date.now();
  const store = new Map<string, any>([[key, { version: 1, token: 'synthetic.payload.signature', capturedAt: now, expiresAt: now + 180000 }]]);
  w.GM_getValue = vi.fn(async (k: string) => store.get(k));
  w.GM_deleteValue = vi.fn(async (k: string) => { store.delete(k); });
  w.alert = vi.fn();
  if (blocked) w.localStorage.setItem('clevervet.mobile.test3.explicit-logout.v1', '1');
  const receive = vi.fn();
  w.addEventListener(token, receive);
  if (before) w.addEventListener(bridge, () => w.dispatchEvent(new w.CustomEvent(ready)));
  w.eval(script);
  if (!before) w.dispatchEvent(new w.CustomEvent(ready));
  return { w, store, receive, dom };
}
it.each([true, false])('delivers once with app listener ordering %s', async before => {
  const { w, store, receive, dom } = setup(before);
  await tick();
  expect(receive).toHaveBeenCalledTimes(1);
  expect(store.has(key)).toBe(false);
  w.dispatchEvent(new w.CustomEvent(ready));
  await tick();
  expect(receive).toHaveBeenCalledTimes(1);
  dom.window.close();
});
it('retains the transfer after logout until an explicit click', async () => {
  const { w, store, receive, dom } = setup(false, true);
  await tick();
  expect(receive).not.toHaveBeenCalled();
  expect(store.has(key)).toBe(true);
  w.document.getElementById('stay-import-btn').click();
  await tick();
  expect(receive).toHaveBeenCalledTimes(1);
  expect(receive.mock.calls[0][0].detail.manual).toBe(true);
  dom.window.close();
});
it('deletes stale transfers without sending them', async () => {
  const { w, store, receive, dom } = setup(false, true);
  store.set(key, { version: 1, token: 'synthetic.payload.signature', capturedAt: Date.now() - 181000, expiresAt: Date.now() + 5000 });
  w.document.getElementById('stay-import-btn').click();
  await tick();
  expect(receive).not.toHaveBeenCalled();
  expect(store.has(key)).toBe(false);
  dom.window.close();
});
