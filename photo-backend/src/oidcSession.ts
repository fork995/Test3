import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync, lstatSync } from "node:fs";
import type { JWTPayload } from "jose";
import { storageCredentials, verifyToken, type OidcConfig } from "./auth.js";
import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";

export const issuer = "https://dev-l4aq9wjx.eu.auth0.com/";
export const audience = "https://api.clevervet.tech";
export const callbackUrl = "http://localhost:8788/admin/oidc/callback";
const jwksUrl = `${issuer}.well-known/jwks.json`;
const apiUrl = "https://backend.clevervet.tech/api/branches";
const originalClientId = "Hwatqjc3fRO6qJRGrd0NK2F27ePXiygY";
export interface OidcSettings { clientId: string; clientSecret?: string }
export type TokenVerifier = (token: string, config: OidcConfig) => Promise<JWTPayload>;
type Stored = { accessToken: string; idToken: string; subject: string; expiresAt: number;
  accessExpiresAt: number; idExpiresAt: number; s3Ready: boolean };

export function loadOidcSettings(env: NodeJS.ProcessEnv): OidcSettings | undefined {
  const clientId = env.OIDC_CLIENT_ID;
  if (!clientId) return undefined;
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(clientId)) throw Error("Invalid OIDC_CLIENT_ID");
  let clientSecret: string | undefined;
  if (env.OIDC_CLIENT_SECRET_FILE) {
    const info = lstatSync(env.OIDC_CLIENT_SECRET_FILE);
    if (!info.isFile() || info.isSymbolicLink() || (process.platform !== "win32" && (info.mode & 0o077)))
      throw Error("OIDC client secret file must be private");
    clientSecret = readFileSync(env.OIDC_CLIENT_SECRET_FILE, "utf8").trim();
    if (!clientSecret) throw Error("Empty OIDC client secret");
  }
  return { clientId, ...(clientSecret ? { clientSecret } : {}) };
}

export class AdminOidcSession {
  private pending?: { state: string; nonce: string; verifier: string; until: number };
  private stored?: Stored;
  private authorization: "absent" | "active" | "expired" = "absent";
  private api: "unchecked" | "available" | "unavailable" | "forbidden" = "unchecked";
  private lastCheckAt?: string;
  private lastExpiry?: string;
  constructor(private readonly settings?: OidcSettings, private readonly fetchImpl: typeof fetch = fetch,
    private readonly verify: TokenVerifier = verifyToken) {}

  status() {
    if (this.stored && this.stored.expiresAt <= Date.now()) this.expire();
    return { authorization: this.authorization, subject: this.stored?.subject,
      expiresAt: this.stored ? new Date(this.stored.expiresAt).toISOString() : this.lastExpiry,
      accessExpiresAt: this.stored ? new Date(this.stored.accessExpiresAt).toISOString() : undefined,
      idExpiresAt: this.stored ? new Date(this.stored.idExpiresAt).toISOString() : undefined,
      s3Credentials: this.stored?.s3Ready ?? false, api: this.api, lastCheckAt: this.lastCheckAt,
      configured: !!this.settings };
  }
  private expire() {
    this.stored = undefined;
    this.pending = undefined;
    this.authorization = "expired";
    this.api = "unavailable";
  }
  clear() {
    this.stored = undefined;
    this.pending = undefined;
    this.authorization = "absent";
    this.api = "unchecked";
    this.lastCheckAt = undefined;
    this.lastExpiry = undefined;
  }
  begin(): string {
    if (!this.settings) throw Error("OIDC_CLIENT_NOT_CONFIGURED");
    const verifier = randomBytes(32).toString("base64url");
    const state = randomBytes(32).toString("base64url");
    const nonce = randomBytes(32).toString("base64url");
    this.pending = { verifier, state, nonce, until: Date.now() + 5 * 60_000 };
    const url = new URL("authorize", issuer);
    url.search = new URLSearchParams({ response_type: "code", client_id: this.settings.clientId,
      redirect_uri: callbackUrl, scope: "openid profile email", audience, state, nonce,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" }).toString();
    return url.href;
  }
  async complete(code: string, state: string): Promise<void> {
    const pending = this.pending;
    this.pending = undefined;
    if (!this.settings || !pending || pending.until <= Date.now() || !code || code.length > 4096 ||
      state.length !== pending.state.length || !timingSafeEqual(Buffer.from(state), Buffer.from(pending.state)))
      throw Error("OIDC_STATE_INVALID");
    const body = new URLSearchParams({ grant_type: "authorization_code", client_id: this.settings.clientId,
      code, code_verifier: pending.verifier, redirect_uri: callbackUrl });
    if (this.settings.clientSecret) body.set("client_secret", this.settings.clientSecret);
    const response = await this.fetchImpl(new URL("oauth/token", issuer), { method: "POST", redirect: "error",
      cache: "no-store", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body,
      signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw Error("OIDC_EXCHANGE_FAILED");
    const raw: unknown = await response.json();
    const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    if (typeof value.access_token !== "string" || typeof value.id_token !== "string" || value.token_type !== "Bearer")
      throw Error("OIDC_TOKEN_RESPONSE_INVALID");
    const access = await this.verify(value.access_token, { issuer, audience, jwksUrl });
    const id = await this.verify(value.id_token, { issuer, audience: this.settings.clientId, jwksUrl });
    if (access.sub !== id.sub || id.nonce !== pending.nonce || !access.exp || !id.exp ||
      access.exp * 1000 <= Date.now() || id.exp * 1000 <= Date.now()) throw Error("OIDC_CLAIMS_INVALID");
    let s3Ready = false;
    try { storageCredentials(id); s3Ready = true; } catch { /* claim absent or invalid */ }
    const expiresAt = Math.min(access.exp, id.exp) * 1000;
    this.stored = { accessToken: value.access_token, idToken: value.id_token, subject: access.sub!, expiresAt,
      accessExpiresAt: access.exp * 1000, idExpiresAt: id.exp * 1000, s3Ready };
    this.authorization = "active";
    this.api = "unchecked";
    this.lastCheckAt = undefined;
    this.lastExpiry = new Date(expiresAt).toISOString();
  }
  async checkApi(): Promise<ReturnType<AdminOidcSession["status"]>> {
    this.status();
    if (!this.stored) throw Error("CLEVERVET_SESSION_UNAVAILABLE");
    let response: Response;
    try {
      response = await this.fetchImpl(apiUrl, { method: "GET", cache: "no-store", redirect: "error",
        headers: { Authorization: `Bearer ${this.stored.accessToken}`, Accept: "application/json" },
        signal: AbortSignal.timeout(10_000) });
    } catch { this.api = "unavailable"; throw Error("CLEVERVET_API_UNAVAILABLE"); }
    if (response.status !== 200) {
      await response.body?.cancel().catch(() => {});
      if (response.status === 401) { this.expire(); throw Error("CLEVERVET_SESSION_EXPIRED"); }
      if (response.status === 403) { this.api = "forbidden"; throw Error("CLEVERVET_API_FORBIDDEN"); }
      this.api = "unavailable"; throw Error("CLEVERVET_API_UNAVAILABLE");
    }
    let branches: unknown;
    try { branches = await response.json(); } catch { this.api = "unavailable"; throw Error("CLEVERVET_API_UNAVAILABLE"); }
    if (!Array.isArray(branches)) { this.api = "unavailable"; throw Error("CLEVERVET_API_UNAVAILABLE"); }
    this.api = "available";
    this.lastCheckAt = new Date().toISOString();
    return this.status();
  }
  async attachBrowserTokens(accessToken: string, idToken: string): Promise<void> {
    this.clear();
    const access = await this.verify(accessToken, { issuer, audience, jwksUrl });
    const id = await this.verify(idToken, { issuer, audience: originalClientId, jwksUrl });
    if (!access.sub || access.sub !== id.sub || !access.exp || !id.exp ||
      Math.min(access.exp, id.exp) * 1000 <= Date.now()) throw Error("BROWSER_TOKEN_INVALID");
    let s3Ready = false;
    try { storageCredentials(id); s3Ready = true; } catch { /* claim not present */ }
    const expiresAt = Math.min(access.exp, id.exp) * 1000;
    this.stored = { accessToken, idToken, subject: access.sub, expiresAt,
      accessExpiresAt: access.exp * 1000, idExpiresAt: id.exp * 1000, s3Ready };
    this.authorization = "active";
    this.lastExpiry = new Date(expiresAt).toISOString();
  }
  async compareApiOrigins() {
    this.status();
    if (!this.stored) throw Error("CLEVERVET_SESSION_UNAVAILABLE");
    const results = [];
    for (const origin of [undefined, "https://www.app.clevervet.tech"]) {
      const started = performance.now();
      try {
        const response = await this.fetchImpl(apiUrl, { method: "GET", redirect: "error", cache: "no-store",
          headers: { Authorization: `Bearer ${this.stored.accessToken}`, Accept: "application/json",
            ...(origin ? { Origin: origin } : {}) }, signal: AbortSignal.timeout(10_000) });
        await response.body?.cancel().catch(() => {});
        results.push({ origin: origin ?? null, status: response.status, authorized: response.status === 200,
          durationMs: Math.round(performance.now() - started) });
      } catch { results.push({ origin: origin ?? null, status: null, authorized: false,
        durationMs: Math.round(performance.now() - started) }); }
    }
    this.api = results.some(result => result.authorized) ? "available" : "unavailable";
    this.lastCheckAt = new Date().toISOString();
    return results;
  }
  async headPhotoObject(key: string) {
    this.status();
    if (!this.stored) throw Error("CLEVERVET_SESSION_UNAVAILABLE");
    if (!/^[0-9a-f-]{36}\.jpg$/i.test(key)) throw Error("INVALID_OBJECT_KEY");
    const credentials = storageCredentials((await this.verify(this.stored.idToken,
      { issuer, audience: originalClientId, jwksUrl })));
    const results = [];
    for (const origin of [undefined, "https://www.app.clevervet.tech"]) {
      const client = new S3Client({ region: "ru-central1", endpoint: "https://storage.yandexcloud.net",
        forcePathStyle: true, credentials, maxAttempts: 1 });
      if (origin) client.middlewareStack.add(next => async args => {
        const request = args.request as { headers?: Record<string, string> };
        if (request.headers) request.headers.origin = origin;
        return next(args);
      }, { step: "build", name: "originalOriginReadOnly" });
      const started = performance.now();
      try {
        const result = await client.send(new HeadObjectCommand({ Bucket: "clevervet-patient-photos", Key: key }));
        results.push({ status: result.$metadata.httpStatusCode ?? 200, durationMs: Math.round(performance.now() - started),
          signed: true, origin: origin ?? null });
      } catch (error) {
        const value = error as { $metadata?: { httpStatusCode?: number } };
        results.push({ status: value.$metadata?.httpStatusCode ?? null,
          durationMs: Math.round(performance.now() - started), signed: true, origin: origin ?? null });
      } finally { client.destroy(); }
    }
    return results;
  }
}
