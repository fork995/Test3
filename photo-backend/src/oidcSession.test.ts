import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { verifyToken } from "./auth.js";
import { browserDurationMs } from "./admin.js";
import { AdminOidcSession, audience, callbackUrl, issuer } from "./oidcSession.js";

test("browser credentials validate and compare identical GETs without exposing tokens", async () => {
  const calls: Array<{ method?: string; origin?: string; authorization?: string }> = [];
  const session = new AdminOidcSession(undefined, async (_input, init) => {
    const headers = init?.headers as Record<string, string>;
    calls.push({ method: init?.method, origin: headers?.Origin, authorization: headers?.Authorization });
    return new Response(null, { status: headers?.Origin ? 403 : 200 });
  }, async (_token, config) => ({ iss: config.issuer, aud: config.audience, sub: "admin-user",
    exp: Math.floor(Date.now() / 1000) + 300 }));
  await session.attachBrowserTokens("synthetic-access", "synthetic-id");
  const results = await session.compareApiOrigins();
  assert.deepEqual(results.map(result => [result.origin, result.status, result.authorized]),
    [[null, 200, true], ["https://www.app.clevervet.tech", 403, false]]);
  assert.deepEqual(calls.map(call => call.method), ["GET", "GET"]);
  assert.equal(calls[0].authorization, calls[1].authorization);
  assert.equal(JSON.stringify(results).includes("synthetic-access"), false);
  session.clear();
  assert.equal(session.status().authorization, "absent");
});

test("browser lifetime is configurable within a bounded range", () => {
  assert.equal(browserDurationMs(), 20 * 60_000);
  assert.equal(browserDurationMs("120"), 120 * 60_000);
  assert.throws(() => browserDurationMs("121"));
  assert.throws(() => browserDurationMs("0"));
});
test("approved PKCE flow verifies both JWTs, checks read-only API, and clears session", async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...await exportJWK(publicKey), kid: "synthetic-key" };
  const keys = createLocalJWKSet({ keys: [jwk] });
  const clientId = "approved-client-123";
  let challenge = "", nonce = "", apiCalls = 0;
  const credentialsClaim = "https://storage.yandexcloud.net/credentials";
  const access = await new SignJWT({}).setProtectedHeader({ alg: "RS256", kid: "synthetic-key" })
    .setIssuer(issuer).setAudience(audience).setSubject("synthetic-admin")
    .setIssuedAt().setExpirationTime("5m").sign(privateKey);
  const makeId = () => new SignJWT({ nonce,
    [credentialsClaim]: { accessKeyId: "synthetic", secretAccessKey: "synthetic-secret" } })
    .setProtectedHeader({ alg: "RS256", kid: "synthetic-key" }).setIssuer(issuer)
    .setAudience(clientId).setSubject("synthetic-admin").setIssuedAt().setExpirationTime("5m").sign(privateKey);
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/oauth/token")) {
      const body = init?.body as URLSearchParams;
      assert.equal(body.get("grant_type"), "authorization_code");
      assert.equal(body.get("redirect_uri"), callbackUrl);
      assert.equal(createHash("sha256").update(body.get("code_verifier")!).digest("base64url"), challenge);
      return new Response(JSON.stringify({ access_token: access, id_token: await makeId(), token_type: "Bearer" }),
        { status: 200, headers: { "Content-Type": "application/json" } });
    }
    assert.equal(url, "https://backend.clevervet.tech/api/branches");
    assert.equal(init?.method, "GET");
    assert.equal((init?.headers as Record<string, string>).Authorization, `Bearer ${access}`);
    apiCalls++;
    return new Response("[]", { status: 200 });
  };
  const session = new AdminOidcSession({ clientId }, fakeFetch, (token, config) => verifyToken(token, config, keys));
  const url = new URL(session.begin());
  assert.equal(url.origin, new URL(issuer).origin);
  assert.equal(url.searchParams.get("redirect_uri"), callbackUrl);
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  challenge = url.searchParams.get("code_challenge")!;
  nonce = url.searchParams.get("nonce")!;
  await assert.rejects(session.complete("code", "wrong-state"));
  const fresh = new URL(session.begin());
  challenge = fresh.searchParams.get("code_challenge")!;
  nonce = fresh.searchParams.get("nonce")!;
  await session.complete("synthetic-code", fresh.searchParams.get("state")!);
  assert.equal(session.status().authorization, "active");
  assert.equal(session.status().subject, "synthetic-admin");
  assert.equal(session.status().s3Credentials, true);
  assert.ok(session.status().expiresAt);
  assert.ok(session.status().accessExpiresAt);
  assert.ok(session.status().idExpiresAt);
  assert.equal((await session.checkApi()).api, "available");
  assert.equal(apiCalls, 1);
  session.clear();
  assert.equal(session.status().authorization, "absent");
  assert.equal(session.status().s3Credentials, false);
  await assert.rejects(session.checkApi());
});
test("JWT verification rejects altered signature, issuer and audience", async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const keys = createLocalJWKSet({ keys: [{ ...await exportJWK(publicKey), kid: "synthetic-key" }] });
  const token = await new SignJWT({}).setProtectedHeader({ alg: "RS256", kid: "synthetic-key" })
    .setIssuer(issuer).setAudience(audience).setSubject("synthetic-admin")
    .setIssuedAt().setExpirationTime("5m").sign(privateKey);
  const config = { issuer, audience, jwksUrl: `${issuer}.well-known/jwks.json` };
  assert.equal((await verifyToken(token, config, keys)).sub, "synthetic-admin");
  await assert.rejects(verifyToken(token + "tampered", config, keys));
  await assert.rejects(verifyToken(token, { ...config, audience: "other" }, keys));
  await assert.rejects(verifyToken(token, { ...config, issuer: "https://other.example/" }, keys));
});
