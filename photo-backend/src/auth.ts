import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";

const credentialClaim = "https://storage.yandexcloud.net/credentials";
export interface StorageCredentials { accessKeyId: string; secretAccessKey: string; sessionToken?: string }
export interface OidcConfig { issuer: string; audience: string; jwksUrl: string }
export async function verifyToken(token: string, config: OidcConfig, keyResolver?: JWTVerifyGetKey): Promise<JWTPayload> {
  if (!config.issuer.startsWith("https://") || !config.jwksUrl.startsWith("https://"))
    throw Error("OIDC configuration requires HTTPS");
  const jwks = keyResolver ?? createRemoteJWKSet(new URL(config.jwksUrl));
  const { payload } = await jwtVerify(token, jwks, {
    issuer: config.issuer, audience: config.audience,
    algorithms: ["RS256", "ES256"], clockTolerance: 5,
  });
  if (!payload.sub || !payload.exp) throw Error("Missing identity or expiration");
  return payload;
}
export function storageCredentials(payload: JWTPayload): StorageCredentials {
  const raw = payload[credentialClaim];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw Error("Storage claim absent");
  const value = raw as Record<string, unknown>;
  if (typeof value.accessKeyId !== "string" || !value.accessKeyId ||
      typeof value.secretAccessKey !== "string" || !value.secretAccessKey)
    throw Error("Storage claim invalid");
  if (value.sessionToken !== undefined && typeof value.sessionToken !== "string")
    throw Error("Storage session token invalid");
  return { accessKeyId: value.accessKeyId, secretAccessKey: value.secretAccessKey,
    ...(value.sessionToken ? { sessionToken: value.sessionToken } : {}) };
}
export function allowedCaller(payload: JWTPayload, subject: string): boolean {
  return !!subject && payload.sub === subject && !!payload.exp && payload.exp > Date.now() / 1000;
}
