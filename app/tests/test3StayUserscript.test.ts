import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { createHash, webcrypto } from "node:crypto";
import { expect, it, vi } from "vitest";
import { parseStayAuthTransfer, STAY_READY_EVENT as READY_EVENT, STAY_TOKEN_EVENT as TOKEN_EVENT } from "../src/stayAuth";

const script = readFileSync(
  join(process.cwd(), "../stay/clevervet-mobile-test3.user.js"),
  "utf8",
);
const STORAGE_KEY = "clevervet-mobile:test3-stay-auth:v1";
let claimSequence = 0;

function jwt(exp: number) {
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  return `synthetic.${payload}.not-a-signature`;
}

function wait(milliseconds = 0) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function harness({
  origin,
  pathname,
  storage = new Map<string, unknown>(),
  local = new Map<string, string>(),
  realTimers = true,
  oauth = false,
  search = "",
  session = new Map<string, string>(),
  fetcher = vi.fn<typeof fetch>(),
}: {
  origin: string;
  pathname: string;
  storage?: Map<string, unknown>;
  local?: Map<string, string>;
  realTimers?: boolean;
  oauth?: boolean;
  search?: string;
  session?: Map<string, string>;
  fetcher?: typeof fetch;
}) {
  const listeners = new Map<
    string,
    Set<(event: { type: string; detail?: unknown }) => void>
  >();
  const received: Array<{ type: string; detail?: unknown }> = [];
  class FakeCustomEvent {
    type: string;
    detail: unknown;
    constructor(type: string, init?: { detail?: unknown }) {
      this.type = type;
      this.detail = init?.detail;
    }
  }
  const window = {
    addEventListener(
      type: string,
      listener: (event: { type: string; detail?: unknown }) => void,
    ) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    },
    dispatchEvent(event: { type: string; detail?: unknown }) {
      received.push({
        type: event.type,
        detail:
          event.detail && typeof event.detail === "object"
            ? { ...(event.detail as Record<string, unknown>) }
            : event.detail,
      });
      listeners.get(event.type)?.forEach((listener) => listener(event));
      return true;
    },
  };
  const localStorage = {
    get length() {
      return local.size;
    },
    key(index: number) {
      return [...local.keys()][index] ?? null;
    },
    getItem(key: string) {
      return local.get(key) ?? null;
    },
  };
  const assign = vi.fn();
  const replaceState = vi.fn();
  const context = {
    window,
    location: { origin, pathname, search, href: origin + pathname + search, assign },
    history: { replaceState },
    fetch: fetcher,
    URL, URLSearchParams, TextEncoder, btoa,
    sessionStorage: {
      getItem: (k: string) => session.get(k) ?? null,
      setItem: (k: string, value: string) => session.set(k, value),
      removeItem: (k: string) => session.delete(k),
    },
    localStorage,
    CustomEvent: FakeCustomEvent,
    GM_getValue: async (key: string, fallback: unknown) =>
      storage.has(key) ? storage.get(key) : fallback,
    GM_setValue: async (key: string, value: unknown) => {
      storage.set(key, structuredClone(value));
    },
    GM_deleteValue: async (key: string) => {
      storage.delete(key);
    },
    atob: (value: string) => Buffer.from(value, "base64").toString("binary"),
    crypto: oauth ? webcrypto : {
      randomUUID: () => `claim-${++claimSequence}`,
      getRandomValues: (value: Uint32Array) => {
        value.fill(++claimSequence);
        return value;
      },
    },
    setTimeout: realTimers
      ? setTimeout
      : (_callback: () => void, _milliseconds: number) => 0,
    clearTimeout,
    Uint32Array,
    structuredClone,
  };
  const source = oauth ? script
    .replace('const CLIENT_ID = "";', 'const CLIENT_ID = "test3-fixture";')
    .replace('const API_AUDIENCE = "";', 'const API_AUDIENCE = "test-api";') : script;
  vm.runInNewContext(source, context);
  return { window, received, storage, assign, replaceState };
}

it("is self-contained and limited to the Test3 and CleverVet pages", () => {
  expect(script.match(/^\/\/ @match\s+/gm)).toHaveLength(3);
  expect(script).toContain("https://app.clevervet.tech/*");
  expect(script).toContain("https://www.app.clevervet.tech/*");
  expect(script).toContain("https://fork995.github.io/Test3/*");
  expect(script).toContain("@grant        GM_deleteValue");
  expect(script).not.toMatch(/@require|XMLHttpRequest|GM_xmlhttpRequest/);
  expect(script.match(/\bfetch\s*\(/g)).toHaveLength(1);
  expect(script).toContain('fetch(new URL("oauth/token", ISSUER)');
  expect(script.replace('console.info("[Test3 Stay]", stage)', "")).not.toContain("console.");
  expect(script).not.toMatch(/location\.(?:href|search|hash)\s*=/);
  expect(script).not.toMatch(/innerHTML|textContent|localStorage\.setItem/);
});

it("copies a fresh Auth0 API token and its effective expiry on the original site", async () => {
  const now = Date.now();
  const tokenExpiry = Math.floor((now + 3_600_000) / 1000);
  const token = jwt(tokenExpiry);
  const local = new Map([
    [
      "@@auth0spajs@@::client::https://api.clevervet.tech/::openid",
      JSON.stringify({
        body: { access_token: token },
        expiresAt: Math.floor((now + 7_200_000) / 1000),
      }),
    ],
  ]);
  const { storage } = harness({
    origin: "https://www.app.clevervet.tech",
    pathname: "/patients",
    local,
  });
  await wait();
  const saved = storage.get(STORAGE_KEY) as Record<string, unknown>;
  expect(saved.token).toBe(token);
  expect(saved.version).toBe(1);
  expect(saved.expiresAt).toBe(tokenExpiry * 1000);
  expect(Number(saved.capturedAt)).toBeGreaterThanOrEqual(now);
});

it("does not store an expired Auth0 token", async () => {
  const now = Date.now();
  const token = jwt(Math.floor(now / 1000) - 1);
  const local = new Map([
    [
      "@@auth0spajs@@::client::https://api.clevervet.tech/::openid",
      JSON.stringify({
        body: { access_token: token },
        expiresAt: Math.floor((now + 3_600_000) / 1000),
      }),
    ],
  ]);
  const { storage } = harness({
    origin: "https://www.app.clevervet.tech",
    pathname: "/",
    local,
    realTimers: false,
  });
  await wait();
  expect(storage.has(STORAGE_KEY)).toBe(false);
});

it("delivers one fresh transfer to Test3 and deletes GM storage first", async () => {
  const now = Date.now();
  const token = jwt(Math.floor((now + 3_600_000) / 1000));
  const storage = new Map<string, unknown>([
    [
      STORAGE_KEY,
      { version: 1, token, capturedAt: now, expiresAt: now + 3_600_000 },
    ],
  ]);
  const tab = harness({
    origin: "https://fork995.github.io",
    pathname: "/Test3/",
    storage,
  });
  tab.window.dispatchEvent(
    new (class {
      type = READY_EVENT;
    })(),
  );
  await wait(150);
  const delivered = tab.received.filter((event) => event.type === TOKEN_EVENT);
  expect(delivered).toHaveLength(1);
  expect((delivered[0].detail as Record<string, unknown>).token).toBe(token);
  expect(storage.has(STORAGE_KEY)).toBe(false);
});

it("clears stale GM data without dispatching a token", async () => {
  const now = Date.now();
  const storage = new Map<string, unknown>([
    [
      STORAGE_KEY,
      {
        version: 1,
        token: "stale.token.value",
        capturedAt: now - 180_001,
        expiresAt: now + 3_600_000,
      },
    ],
  ]);
  const tab = harness({
    origin: "https://fork995.github.io",
    pathname: "/Test3/",
    storage,
  });
  tab.window.dispatchEvent(
    new (class {
      type = READY_EVENT;
    })(),
  );
  await wait(10);
  expect(tab.received.some((event) => event.type === TOKEN_EVENT)).toBe(false);
  expect(storage.has(STORAGE_KEY)).toBe(false);
});

it("allows only one of two simultaneous Test3 tabs to consume the transfer", async () => {
  const now = Date.now();
  const token = jwt(Math.floor((now + 3_600_000) / 1000));
  const storage = new Map<string, unknown>([
    [
      STORAGE_KEY,
      { version: 1, token, capturedAt: now, expiresAt: now + 3_600_000 },
    ],
  ]);
  const first = harness({
    origin: "https://fork995.github.io",
    pathname: "/Test3/",
    storage,
  });
  const second = harness({
    origin: "https://fork995.github.io",
    pathname: "/Test3/",
    storage,
  });
  first.window.dispatchEvent(
    new (class {
      type = READY_EVENT;
    })(),
  );
  second.window.dispatchEvent(
    new (class {
      type = READY_EVENT;
    })(),
  );
  await wait(250);
  const deliveries = [...first.received, ...second.received].filter(
    (event) => event.type === TOKEN_EVENT,
  );
  expect(deliveries).toHaveLength(1);
  expect(storage.has(STORAGE_KEY)).toBe(false);
});

const original = "https://app.clevervet.tech";
const app = "https://fork995.github.io";
const issuer = "https://dev-l4aq9wjx.eu.auth0.com/";
const ready = { type: READY_EVENT };

async function startOAuth() {
  const session = new Map<string, string>();
  const local = new Map([["0-synthetic", JSON.stringify({
    authnResult: { access_token: "private-fixture", refresh_token: "private-fixture" },
    authzData: "private-fixture", access_token_expires_at: Date.now() + 3600000,
  })]]);
  const read = vi.spyOn(local, "get");
  const { storage } = harness({ origin: original, pathname: "/", local, oauth: true });
  expect(storage.get(STORAGE_KEY)).toEqual({ kind: "authorize", capturedAt: expect.any(Number) });
  expect(read).not.toHaveBeenCalled();
  const options = { origin: app, pathname: "/Test3/", oauth: true, storage, session };
  const tab = harness(options);
  tab.window.dispatchEvent(ready);
  tab.window.dispatchEvent(ready);
  await vi.waitFor(() => expect(tab.assign).toHaveBeenCalledOnce());
  expect(storage.size).toBe(0);
  const url = new URL(tab.assign.mock.calls[0][0]);
  expect(url.origin + url.pathname).toBe(issuer + "authorize");
  expect(Object.fromEntries(url.searchParams)).toMatchObject({
    response_type: "code", code_challenge_method: "S256", prompt: "none",
    client_id: "test3-fixture", audience: "test-api", redirect_uri: app + "/Test3/",
  });
  return { options, url };
}

it("exchanges a code with S256 and delivers one accepted v1 transfer", async () => {
  const { options, url } = await startOAuth();
  const token = jwt(Math.floor(Date.now() / 1000) + 3600);
  const fetcher = vi.fn<typeof fetch>(async (endpoint, init) => {
    expect(String(endpoint)).toBe(issuer + "oauth/token");
    expect(init).toMatchObject({ method: "POST", credentials: "omit", redirect: "error" });
    const form = init?.body as URLSearchParams;
    expect(Object.fromEntries(form)).toMatchObject({
      grant_type: "authorization_code", code: "fixture", client_id: "test3-fixture",
      redirect_uri: app + "/Test3/",
    });
    expect(createHash("sha256").update(form.get("code_verifier")!).digest("base64url"))
      .toBe(url.searchParams.get("code_challenge"));
    return Response.json({ token_type: "Bearer", access_token: token, expires_in: 3600 });
  });
  const search = "?keep=1&code=fixture&state=" + url.searchParams.get("state");
  const tab = harness({ ...options, fetcher, search });
  expect(tab.replaceState.mock.calls[0][2]).toBe("/Test3/?keep=1");
  expect(options.session.size).toBe(0);
  expect(fetcher).not.toHaveBeenCalled();
  tab.window.dispatchEvent(ready);
  tab.window.dispatchEvent(ready);
  await wait();
  const tokens = tab.received.filter(e => e.type === TOKEN_EVENT);
  expect(tokens).toHaveLength(1);
  expect(parseStayAuthTransfer(tokens[0].detail)?.token).toBe(token);
  expect(options.storage.size).toBe(0);
  const replay = harness({ ...options, fetcher, search });
  replay.window.dispatchEvent(ready);
  expect(fetcher).toHaveBeenCalledOnce();
});

it.each(["wrong-state", "login_required", "expired-request", "wrong-issuer"])(
  "keeps manual login after %s", async (failure) => {
    const { options, url } = await startOAuth();
    const state = failure === "wrong-state" ? "wrong" : url.searchParams.get("state");
    const params = new URLSearchParams({ state: state! });
    if (failure === "login_required") params.set("error", failure);
    else params.set("code", "fixture");
    if (failure === "wrong-issuer") params.set("iss", "https://other.example/");
    if (failure === "expired-request") {
      const [key, raw] = [...options.session][0];
      options.session.set(key, JSON.stringify({ ...JSON.parse(raw), startedAt: Date.now() - 181000 }));
    }
    const fetcher = vi.fn<typeof fetch>();
    const tab = harness({ ...options, search: "?" + params, fetcher });
    tab.window.dispatchEvent(ready);
    await wait();
    expect(tab.assign).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
    expect(options.session.size).toBe(0);
    expect(tab.received.some(e => e.type === TOKEN_EVENT)).toBe(false);
  },
);
