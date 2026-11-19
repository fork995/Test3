import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { jwtVerify } from "jose";
import { createMockDependencies } from "./mock.js";
import { PhotoError, PhotoService } from "./service.js";

export type VerifyCaller = (token: string) => Promise<string>;
export interface HttpOptions { mockEnabled: boolean; pilotPatientId: string; verifyCaller: VerifyCaller; service: PhotoService }
export function createMockJwtVerifier(secret: Uint8Array, allowedSubject: string): VerifyCaller {
  return async token => {
    const { payload } = await jwtVerify(token, secret, { issuer: "clevervet-test3-mock", audience: "photo-backend-mock", algorithms: ["HS256"] });
    if (payload.sub !== allowedSubject || !payload.exp) throw Error("Caller denied");
    return payload.sub;
  };
}
const maxBytes = 8 * 1024 * 1024;
const origin = "https://fork995.github.io";
const requestIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function reply(response: ServerResponse, status: number, data: Record<string, unknown>) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  response.end(JSON.stringify(data));
}
async function body(request: IncomingMessage): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > maxBytes) throw new PhotoError("TOO_LARGE", "JPEG exceeds 8 MB.");
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}
export function createPhotoHttpServer(options: HttpOptions) {
  const attempts = new Map<string, { count: number; since: number }>();
  const server = createServer(async (request, response) => {
    const incomingOrigin = request.headers.origin;
    if (incomingOrigin && incomingOrigin !== origin) return reply(response, 403, { error: "ORIGIN_DENIED" });
    if (incomingOrigin === origin) response.setHeader("Access-Control-Allow-Origin", origin);
    if (request.method === "OPTIONS" && request.url?.startsWith("/api/mock/")) {
      response.setHeader("Access-Control-Allow-Methods", "POST");
      response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Request-ID");
      return reply(response, 204, {});
    }
    if (request.method === "GET" && request.url === "/health")
      return reply(response, 200, { status: "ok", writesEnabled: false, mockEnabled: options.mockEnabled, version: "0.3.0" });
    const match = /^\/api\/mock\/patients\/([A-Za-z0-9_-]{1,128})\/photo$/.exec(request.url ?? "");
    if (!match || request.method !== "POST") return reply(response, 404, { error: "NOT_FOUND" });
    if (!options.mockEnabled) return reply(response, 503, { error: "MOCK_DISABLED" });
    const bearer = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(request.headers.authorization ?? "");
    if (!bearer) return reply(response, 401, { error: "AUTH_REQUIRED" });
    let subject: string;
    try { subject = await options.verifyCaller(bearer[1]); }
    catch { return reply(response, 401, { error: "AUTH_INVALID" }); }
    if (!subject) return reply(response, 403, { error: "CALLER_DENIED" });
    if (match[1] !== options.pilotPatientId) return reply(response, 403, { error: "PATIENT_DENIED" });
    const now = Date.now();
    const attempt = attempts.get(subject) ?? { count: 0, since: now };
    if (now - attempt.since >= 60_000) { attempt.count = 0; attempt.since = now; }
    if (++attempt.count > 30) return reply(response, 429, { error: "RATE_LIMIT" });
    attempts.set(subject, attempt);
    if (request.headers["content-type"] !== "image/jpeg") return reply(response, 415, { error: "JPEG_REQUIRED" });
    const requestId = request.headers["x-request-id"];
    if (typeof requestId !== "string" || !requestIdPattern.test(requestId))
      return reply(response, 400, { error: "REQUEST_ID_REQUIRED" });
    const length = Number(request.headers["content-length"] ?? 0);
    if (length > maxBytes) return reply(response, 413, { error: "TOO_LARGE" });
    try {
      const jpeg = await body(request);
      const result = await options.service.save(match[1], jpeg, requestId);
      return reply(response, 200, { photo: result.photo, confirmed: true });
    } catch (error) {
      if (error instanceof PhotoError) {
        const status = error.code === "TOO_LARGE" ? 413 : error.code === "BAD_IMAGE" || error.code === "BAD_REQUEST" ? 400 :
          error.code === "IN_PROGRESS" || error.code === "CONFLICT" ? 409 : error.code === "PATIENT_DENIED" ? 403 : 503;
        return reply(response, status, { error: error.code });
      }
      return reply(response, 502, { error: "MOCK_FAILURE" });
    }
  });
  server.requestTimeout = 20_000;
  server.headersTimeout = 10_000;
  server.maxRequestsPerSocket = 100;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PHOTO_BACKEND_PORT ?? "8787");
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error("Invalid PHOTO_BACKEND_PORT");
  const pilotPatientId = process.env.MOCK_PILOT_PATIENT_ID ?? "synthetic-patient";
  const mockEnabled = process.env.MOCK_MODE === "true";
  const secretFile = process.env.MOCK_JWT_SECRET_FILE;
  const allowedSubject = process.env.MOCK_ALLOWED_SUBJECT;
  if (mockEnabled && (!secretFile || !allowedSubject)) throw Error("Mock authentication not configured");
  const secret = secretFile ? readFileSync(secretFile) : Buffer.alloc(0);
  if (secretFile && process.platform !== "win32" && (statSync(secretFile).mode & 0o077)) throw Error("Mock key file permissions must be 0600");
  if (mockEnabled && secret.length < 32) throw Error("Mock key must have at least 32 bytes");
  const mock = createMockDependencies(pilotPatientId);
  const service = new PhotoService({ writesEnabled: mockEnabled, conditionalUpdateSupported: true,
    pilotPatientId, bucket: "clevervet-patient-photos" }, mock.dependencies);
  const verifyCaller = createMockJwtVerifier(secret, allowedSubject ?? "");
  const server = createPhotoHttpServer({ mockEnabled, pilotPatientId, verifyCaller, service });
  server.listen(port, "127.0.0.1");
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => server.close());
}
