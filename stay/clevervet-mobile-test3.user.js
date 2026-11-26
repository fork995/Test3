// ==UserScript==
// @name         CleverVet Mobile — автоматический вход в Test3
// @namespace    https://fork995.github.io/Test3/
// @version      1.2.0
// @description  Автовход Test3 через OAuth PKCE или прежний мост Stay.
// @match        https://www.app.clevervet.tech/*
// @match        https://app.clevervet.tech/*
// @match        https://fork995.github.io/Test3/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @run-at       document-start
// @noframes
// ==/UserScript==

(function () {
  "use strict";

  const ORIGINAL_ORIGIN = "https://www.app.clevervet.tech";
  const TEST_ORIGIN = "https://fork995.github.io";
  const TEST_PATH = "/Test3/";
  const STORAGE_KEY = "clevervet-mobile:test3-stay-auth:v1";
  const MAX_AGE_MS = 3 * 60 * 1000;
  const CLAIM_TTL_MS = 1_500;
  const READY_EVENT = "clevervet-mobile:test3-stay-ready:v1";
  const BRIDGE_READY_EVENT = "clevervet-mobile:test3-stay-bridge-ready:v1";
  const TOKEN_EVENT = "clevervet-mobile:test3-stay-token:v1";
  // Public settings supplied by the CleverVet OAuth administrator for Test3.
  const CLIENT_ID = "";
  const API_AUDIENCE = "";
  const ISSUER = "https://dev-l4aq9wjx.eu.auth0.com/";
  const CALLBACK = TEST_ORIGIN + TEST_PATH;
  const TRANSACTION_KEY = "clevervet-mobile:test3-stay-pkce:v1";
  const DEBUG = false;

  function diagnostic(stage) {
    if (DEBUG) console.info("[Test3 Stay]", stage);
  }

  function base64url(bytes) {
    return btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function fresh(timestamp) {
    const age = Date.now() - timestamp;
    return Number.isFinite(timestamp) && age >= 0 && age <= MAX_AGE_MS;
  }

  async function authorize() {
    const state = base64url(crypto.getRandomValues(new Uint8Array(32)));
    const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    const url = new URL("authorize", ISSUER);
    url.search = new URLSearchParams({
      client_id: CLIENT_ID,
      audience: API_AUDIENCE,
      redirect_uri: CALLBACK,
      response_type: "code",
      prompt: "none",
      state,
      code_challenge: base64url(new Uint8Array(digest)),
      code_challenge_method: "S256",
    }).toString();
    sessionStorage.setItem(TRANSACTION_KEY, JSON.stringify({
      state, verifier, startedAt: Date.now(),
    }));
    diagnostic("authorize");
    location.assign(url.href);
  }

  function takeCallback() {
    if (location.pathname !== TEST_PATH) return null;
    const params = new URLSearchParams(location.search);
    if (!params.has("code") && !params.has("error")) return null;
    const clean = new URL(location.href);
    for (const key of ["code", "state", "error", "error_description", "error_uri", "iss"])
      clean.searchParams.delete(key);
    history.replaceState(history.state, "", clean.pathname + clean.search + clean.hash);
    const raw = sessionStorage.getItem(TRANSACTION_KEY);
    sessionStorage.removeItem(TRANSACTION_KEY);
    const transaction = JSON.parse(raw || "null");
    if (!CLIENT_ID || !API_AUDIENCE || !transaction ||
        !fresh(transaction.startedAt) || params.getAll("state").length !== 1 ||
        params.get("state") !== transaction.state ||
        !/^[A-Za-z0-9_-]{43}$/.test(transaction.verifier) ||
        (params.has("iss") && params.get("iss") !== ISSUER)) {
      throw new Error("invalid-callback");
    }
    if (params.has("error")) {
      diagnostic(["login_required", "consent_required", "interaction_required"].includes(params.get("error"))
        ? "interaction-required" : "authorization-denied");
      return { denied: true };
    }
    if (!params.get("code") || params.getAll("code").length !== 1)
      throw new Error("invalid-callback");
    return { code: params.get("code"), verifier: transaction.verifier };
  }

  async function exchange(callback) {
    const response = await fetch(new URL("oauth/token", ISSUER), {
      method: "POST",
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: CLIENT_ID,
        redirect_uri: CALLBACK,
        code: callback.code,
        code_verifier: callback.verifier,
      }),
    });
    if (!response.ok) throw new Error("exchange-failed");
    const result = await response.json();
    const now = Date.now();
    if (typeof result.access_token !== "string" ||
        typeof result.token_type !== "string" || result.token_type.toLowerCase() !== "bearer" ||
        !Number.isFinite(result.expires_in) || result.expires_in <= 0)
      throw new Error("invalid-token-response");
    const expiresAt = now + result.expires_in * 1000;
    const transfer = {
      version: 1, token: result.access_token, capturedAt: now,
      expiresAt: Math.min(expiresAt, decodeJwtExpiry(result.access_token) ?? expiresAt),
    };
    if (!validTransfer(transfer, now)) throw new Error("invalid-transfer");
    return transfer;
  }

  async function getStored() {
    try {
      return await GM_getValue(STORAGE_KEY, null);
    } catch {
      return null;
    }
  }

  async function setStored(value) {
    await GM_setValue(STORAGE_KEY, value);
  }

  async function clearStored() {
    try {
      if (typeof GM_deleteValue === "function") {
        await GM_deleteValue(STORAGE_KEY);
      } else {
        await GM_setValue(STORAGE_KEY, null);
      }
    } catch {
      try {
        await GM_setValue(STORAGE_KEY, null);
      } catch {
        // Stay недоступен: обычный экран входа Test3 остаётся рабочим.
      }
    }
  }

  function decodeJwtExpiry(token) {
    try {
      const parts = token.split(".");
      if (parts.length !== 3 || !parts[1]) return null;
      const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
      const payload = JSON.parse(atob(padded));
      return typeof payload.exp === "number" && Number.isFinite(payload.exp)
        ? Math.trunc(payload.exp * 1000)
        : null;
    } catch {
      return null;
    }
  }

  function normalizeExpiry(value) {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
      return null;
    return Math.trunc(value < 1_000_000_000_000 ? value * 1000 : value);
  }

  function findAuth0Token(now) {
    let best = null;
    try {
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (
          !key ||
          !key.startsWith("@@auth0spajs@@") ||
          !key.includes("api.clevervet.tech")
        )
          continue;
        let cached;
        try {
          cached = JSON.parse(localStorage.getItem(key) || "null");
        } catch {
          continue;
        }
        const token = cached?.body?.access_token;
        const cacheExpiry = normalizeExpiry(cached?.expiresAt);
        if (
          typeof token !== "string" ||
          !token ||
          /\s/.test(token) ||
          !cacheExpiry
        )
          continue;
        const jwtExpiry = decodeJwtExpiry(token);
        const expiresAt =
          jwtExpiry === null ? cacheExpiry : Math.min(cacheExpiry, jwtExpiry);
        if (expiresAt <= now + 15_000) continue;
        if (!best || expiresAt > best.expiresAt) best = { token, expiresAt };
      }
    } catch {
      return null;
    }
    return best;
  }

  function validTransfer(value, now) {
    return Boolean(
      value &&
        value.version === 1 &&
        typeof value.token === "string" &&
        value.token.length > 0 &&
        value.token.length <= 16_384 &&
        !/\s/.test(value.token) &&
        typeof value.capturedAt === "number" &&
        Number.isFinite(value.capturedAt) &&
        value.capturedAt <= now + 30_000 &&
        now - value.capturedAt <= MAX_AGE_MS &&
        typeof value.expiresAt === "number" &&
        Number.isFinite(value.expiresAt) &&
        value.expiresAt > now,
    );
  }

  function claimId() {
    if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();
    const bytes = new Uint32Array(4);
    crypto.getRandomValues(bytes);
    return [...bytes].map((part) => part.toString(16)).join("-");
  }

  async function captureFromOriginal() {
    let attempts = 20;
    let finished = false;
    const attempt = async () => {
      if (finished) return;
      const now = Date.now();
      const found = findAuth0Token(now);
      if (found) {
        finished = true;
        await setStored({
          version: 1,
          token: found.token,
          capturedAt: now,
          expiresAt: found.expiresAt,
        });
        found.token = "";
        return;
      }
      attempts -= 1;
      if (attempts > 0) setTimeout(() => void attempt(), 750);
      else diagnostic("no-legacy-token-configure-oauth");
    };
    await attempt();
  }

  function installTestBridge() {
    let delivered = false;
    let delivering = false;
    let claimRetryScheduled = false;
    let callback;
    try {
      callback = takeCallback();
      if (callback?.denied) delivered = true;
    } catch {
      delivered = true;
      diagnostic("callback-rejected");
    }

    function sendTransfer(transfer) {
      delivered = true;
      diagnostic("token-dispatched");
      window.dispatchEvent(new CustomEvent(TOKEN_EVENT, { detail: transfer }));
      transfer.token = "";
    }

    const deliver = async () => {
      if (delivered || delivering) return;
      delivering = true;
      try {
        if (callback) {
          delivered = true;
          const pending = callback;
          callback = null;
          try {
            sendTransfer(await exchange(pending));
          } catch {
            diagnostic("token-exchange-failed");
          }
          return;
        }
        const now = Date.now();
        const stored = await getStored();
        if (stored?.kind === "authorize") {
          delivered = true;
          await clearStored();
          if (CLIENT_ID && API_AUDIENCE && location.pathname === TEST_PATH && fresh(stored.capturedAt) &&
              !new URLSearchParams(location.search).has("importAuth"))
            await authorize();
          return;
        }
        if (!validTransfer(stored, now)) {
          if (stored !== null && stored !== undefined) await clearStored();
          return;
        }
        if (
          typeof stored.claimedAt === "number" &&
          now - stored.claimedAt < CLAIM_TTL_MS
        ) {
          if (!claimRetryScheduled) {
            claimRetryScheduled = true;
            setTimeout(() => {
              claimRetryScheduled = false;
              void deliver();
            }, CLAIM_TTL_MS + 50);
          }
          return;
        }
        const ownClaim = claimId();
        await setStored({ ...stored, claimId: ownClaim, claimedAt: now });
        await new Promise((resolve) => setTimeout(resolve, 100));
        const claimed = await getStored();
        if (claimed?.claimId !== ownClaim) return;
        const transfer = {
          version: 1,
          token: claimed.token,
          capturedAt: claimed.capturedAt,
          expiresAt: claimed.expiresAt,
        };
        await clearStored();
        sendTransfer(transfer);
      } catch {
        diagnostic("bridge-failed");
        await clearStored();
      } finally {
        delivering = false;
      }
    };

    window.addEventListener(READY_EVENT, () => {
      diagnostic("app-ready");
      void deliver();
    });
    diagnostic("bridge-ready");
    window.dispatchEvent(
      new CustomEvent(BRIDGE_READY_EVENT, { detail: { version: 1 } }),
    );
  }

  if (window.top !== window.self) return;
  if (location.origin === ORIGINAL_ORIGIN || location.origin === "https://app.clevervet.tech") {
    if (CLIENT_ID && API_AUDIENCE) {
      void setStored({ kind: "authorize", capturedAt: Date.now() })
        .then(() => diagnostic("authorization-request-stored"))
        .catch(() => diagnostic("storage-unavailable"));
    } else if (location.origin === ORIGINAL_ORIGIN) {
      void captureFromOriginal().catch(() => diagnostic("storage-unavailable"));
    } else {
      diagnostic("configure-oauth");
    }
  } else if (
    location.origin === TEST_ORIGIN &&
    location.pathname.startsWith(TEST_PATH)
  ) {
    installTestBridge();
  }
})();
