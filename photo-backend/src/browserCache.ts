export interface BrowserTokens { accessToken: string; idToken: string }

/** Runs only inside an original CleverVet tab. The SDK cache field names were
 * checked against the public application bundle; they are version-dependent. */
export function browserCacheProbe(): BrowserTokens | null {
  if (location.origin !== "https://www.app.clevervet.tech") return null;
  const matches: BrowserTokens[] = [];
  const jwt = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
  for (let index = 0; index < sessionStorage.length; index++) {
    const key = sessionStorage.key(index);
    const raw = key ? sessionStorage.getItem(key) : null;
    if (!raw || raw.length > 250_000) continue;
    try {
      const record: unknown = JSON.parse(raw);
      if (!record || typeof record !== "object" || Array.isArray(record)) continue;
      const cache = record as Record<string, unknown>;
      const accessToken = cache.authzData;
      const idToken = cache.authnResult && typeof cache.authnResult === "object" &&
        !Array.isArray(cache.authnResult) ? (cache.authnResult as Record<string, unknown>).id_token : undefined;
      if (typeof accessToken === "string" && typeof idToken === "string" &&
        jwt.test(accessToken) && jwt.test(idToken)) matches.push({ accessToken, idToken });
    } catch { /* unrelated session storage entry */ }
  }
  if (matches.length > 1) throw Error("AMBIGUOUS_SESSION");
  return matches[0] ?? null;
}
