import assert from "node:assert/strict";
import { test } from "node:test";
import { browserCacheProbe } from "./browserCache.js";

test("reads only the two SDK tokens from an original-origin session cache", () => {
  const oldLocation = globalThis.location;
  const oldStorage = globalThis.sessionStorage;
  const values = new Map<string, string>([
    ["unrelated", JSON.stringify({ password: "never-read" })],
    ["sdk-config", JSON.stringify({ authzData: "access.payload.signature",
      authnResult: { id_token: "identity.payload.signature", refresh_token: "never-return" } })],
  ]);
  Object.defineProperty(globalThis, "location", { configurable: true, value: { origin: "https://www.app.clevervet.tech" } });
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: {
    get length() { return values.size; }, key(index: number) { return [...values.keys()][index] ?? null; },
    getItem(key: string) { return values.get(key) ?? null; },
  } });
  try {
    assert.deepEqual(browserCacheProbe(), { accessToken: "access.payload.signature", idToken: "identity.payload.signature" });
    Object.defineProperty(globalThis, "location", { configurable: true, value: { origin: "https://other.example" } });
    assert.equal(browserCacheProbe(), null);
  } finally {
    if (oldLocation === undefined) delete (globalThis as { location?: Location }).location;
    else Object.defineProperty(globalThis, "location", { configurable: true, value: oldLocation });
    if (oldStorage === undefined) delete (globalThis as { sessionStorage?: Storage }).sessionStorage;
    else Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: oldStorage });
  }
});

test("finds tokens in localStorage and detects unexpected token format", () => {
  const saved = Object.getOwnPropertyDescriptors(globalThis);
  const values = new Map<string, string>();
  const storage = { get length() { return values.size; }, key(i: number) { return [...values.keys()][i] ?? null; },
    getItem(key: string) { return values.get(key) ?? null; } };
  Object.defineProperty(globalThis, "location", { configurable: true, value: { origin: "https://www.app.clevervet.tech" } });
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: { length: 0 } });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  try {
    values.set("sdk", JSON.stringify({ authzData: "access.payload.signature", authnResult: { id_token: "id.payload.signature" } }));
    assert.deepEqual(browserCacheProbe(), { accessToken: "access.payload.signature", idToken: "id.payload.signature" });
    values.set("sdk", JSON.stringify({ authzData: "opaque", authnResult: { id_token: "id.payload.signature" } }));
    assert.throws(() => browserCacheProbe(), /TOKEN_FORMAT_UNEXPECTED/);
  } finally {
    for (const key of ["location", "sessionStorage", "localStorage"]) {
      if (saved[key]) Object.defineProperty(globalThis, key, saved[key]);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
