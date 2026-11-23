export interface BrowserTokens { accessToken: string; idToken: string }

/** Runs only inside an original CleverVet tab. The SDK cache field names were
 * checked against the public application bundle; they are version-dependent. */
export function browserCacheProbe(): BrowserTokens | null {
  if (location.origin !== "https://www.app.clevervet.tech") return null;
  const matches: BrowserTokens[] = [];
  let available = 0;
  let unexpected = false;
  const jwt = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
  for (const storageName of ["sessionStorage", "localStorage"] as const) {
    try {
    const storage = globalThis[storageName];
    if (!storage) continue;
    const length = storage.length;
    available++;
  for (let index = 0; index < length; index++) {
    const key = storage.key(index);
    const raw = key ? storage.getItem(key) : null;
    if (!raw || raw.length > 250_000) continue;
    try {
      const record: unknown = JSON.parse(raw);
      if (!record || typeof record !== "object" || Array.isArray(record)) continue;
      const cache = record as Record<string, unknown>;
      const accessToken = cache.authzData;
      const idToken = cache.authnResult && typeof cache.authnResult === "object" &&
        !Array.isArray(cache.authnResult) ? (cache.authnResult as Record<string, unknown>).id_token : undefined;
      if (typeof accessToken === "string" && typeof idToken === "string" &&
        jwt.test(accessToken) && jwt.test(idToken)) {
        if (!matches.some(item => item.accessToken === accessToken && item.idToken === idToken))
          matches.push({ accessToken, idToken });
      } else if (accessToken !== undefined || idToken !== undefined) unexpected = true;
    } catch { /* unrelated session storage entry */ }
  }
    } catch { /* storage access denied */ }
  }
  if (!available) throw Error("STORAGE_UNAVAILABLE");
  if (matches.length > 1) throw Error("AMBIGUOUS_SESSION");
  if (!matches.length && unexpected) throw Error("TOKEN_FORMAT_UNEXPECTED");
  return matches[0] ?? null;
}
