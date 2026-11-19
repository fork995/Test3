import { createHmac, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { uploadMockPatientPhoto } from "../src/photoBackend";
import { createMockDependencies } from "../../photo-backend/src/mock";
import { createMockJwtVerifier, createPhotoHttpServer } from "../../photo-backend/src/server";
import { PhotoService } from "../../photo-backend/src/service";

const secret = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const mock = createMockDependencies("synthetic-patient");
const service = new PhotoService({ writesEnabled: true, conditionalUpdateSupported: true,
  pilotPatientId: "synthetic-patient", bucket: "clevervet-patient-photos" }, mock.dependencies);
const server = createPhotoHttpServer({ mockEnabled: true, pilotPatientId: "synthetic-patient",
  verifyCaller: createMockJwtVerifier(secret, "synthetic-doctor"), service });
let base = "";
function token() {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ iss: "clevervet-test3-mock", aud: "photo-backend-mock",
    sub: "synthetic-doctor", exp: Math.floor(Date.now() / 1000) + 120 })).toString("base64url");
  const input = `${header}.${payload}`;
  const signature = createHmac("sha256", secret).update(input).digest("base64url");
  return `${input}.${signature}`;
}
beforeAll(async () => {
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("Missing server address");
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));
it("Test3 client sends JPEG through HTTP to mock S3 and patient API, then receives confirmation", async () => {
  const jpeg = new Blob([Uint8Array.from([0xff, 0xd8, 1, 2, 0xff, 0xd9])], { type: "image/jpeg" });
  const id = randomUUID();
  const photo = await uploadMockPatientPhoto(base, token(), "synthetic-patient", jpeg, id);
  expect(photo).toMatch(/^https:\/\/storage\.yandexcloud\.net\/clevervet-patient-photos\//);
  expect(mock.inspect().patient.photo).toBe(photo);
  expect(mock.inspect().objectCount).toBe(1);
  expect(await uploadMockPatientPhoto(base, token(), "synthetic-patient", jpeg, id)).toBe(photo);
  expect(mock.inspect().objectCount).toBe(1);
});
