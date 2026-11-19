import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { SignJWT } from "jose";
import { createMockDependencies } from "./mock.js";
import { createPhotoHttpServer, createMockJwtVerifier } from "./server.js";
import { PhotoService } from "./service.js";

const key = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const mock = createMockDependencies("synthetic-patient");
const service = new PhotoService({ writesEnabled: true, conditionalUpdateSupported: true,
  pilotPatientId: "synthetic-patient", bucket: "clevervet-patient-photos" }, mock.dependencies);
const server = createPhotoHttpServer({ mockEnabled: true, pilotPatientId: "synthetic-patient",
  verifyCaller: createMockJwtVerifier(key, "doctor-test"), service });
let base = "";
let token = "";
before(async () => {
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("No test address");
  base = `http://127.0.0.1:${address.port}`;
  token = await new SignJWT({}).setProtectedHeader({ alg: "HS256" })
    .setIssuer("clevervet-test3-mock").setAudience("photo-backend-mock")
    .setSubject("doctor-test").setExpirationTime("2m").sign(key);
});
after(() => new Promise<void>(resolve => server.close(() => resolve())));
const jpeg = Uint8Array.from([0xff, 0xd8, 1, 2, 0xff, 0xd9]);
function upload(path = "/api/mock/patients/synthetic-patient/photo", bearer = token, data: Uint8Array = jpeg, requestId = randomUUID()) {
  return fetch(base + path, { method: "POST", headers: { Authorization: `Bearer ${bearer}`,
    "Content-Type": "image/jpeg", "X-Request-ID": requestId, Origin: "https://fork995.github.io" }, body: Buffer.from(data) });
}
test("HTTP mock route authenticates, stores synthetic object, confirms patient and deduplicates", async () => {
  const requestId = randomUUID();
  const first = await upload(undefined, token, jpeg, requestId);
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("access-control-allow-origin"), "https://fork995.github.io");
  const result = await first.json() as { photo: string; confirmed: boolean };
  assert.equal(result.confirmed, true);
  assert.equal(mock.inspect().patient.photo, result.photo);
  assert.equal(mock.inspect().objectCount, 1);
  const duplicate = await upload(undefined, token, jpeg, requestId);
  assert.equal(duplicate.status, 200);
  assert.equal(mock.inspect().objectCount, 1);
  assert.equal(mock.inspect().version, 2);
});
test("rejects forged caller, other patient, invalid JPEG and oversized input", async () => {
  assert.equal((await upload(undefined, "forged")).status, 401);
  assert.equal((await upload("/api/mock/patients/other/photo")).status, 403);
  assert.equal((await upload(undefined, token, Uint8Array.from([1, 2, 3]))).status, 400);
  assert.equal((await upload(undefined, token, new Uint8Array(8 * 1024 * 1024 + 1))).status, 413);
  assert.equal(mock.inspect().objectCount, 1);
});
test("refuses disallowed Origin", async () => {
  const response = await fetch(base + "/health", { headers: { Origin: "https://example.org" } });
  assert.equal(response.status, 403);
});
test("rate limits authorized uploads before touching mock storage", async () => {
  const isolated = createMockDependencies("synthetic-patient");
  const local = createPhotoHttpServer({ mockEnabled: true, pilotPatientId: "synthetic-patient",
    verifyCaller: createMockJwtVerifier(key, "doctor-test"),
    service: new PhotoService({ writesEnabled: true, conditionalUpdateSupported: true,
      pilotPatientId: "synthetic-patient", bucket: "clevervet-patient-photos" }, isolated.dependencies) });
  await new Promise<void>(resolve => local.listen(0, "127.0.0.1", resolve));
  try {
    const address = local.address();
    if (!address || typeof address === "string") throw Error("No local address");
    let last: Response | undefined;
    for (let index = 0; index < 31; index++) {
      last = await fetch(`http://127.0.0.1:${address.port}/api/mock/patients/synthetic-patient/photo`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "image/jpeg",
          "X-Request-ID": randomUUID() }, body: Buffer.from([1, 2, 3]),
      });
    }
    assert.equal(last?.status, 429);
    assert.equal(isolated.inspect().objectCount, 0);
  } finally { await new Promise<void>(resolve => local.close(() => resolve())); }
});
