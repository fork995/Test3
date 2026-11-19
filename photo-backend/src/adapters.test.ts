import assert from "node:assert/strict";
import { test } from "node:test";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { allowedCaller, storageCredentials } from "./auth.js";
import { createPatientApi } from "./patientApi.js";
import { createPhotoStorage } from "./s3.js";
import { PhotoError } from "./service.js";

test("validated storage claim stays server-side and rejects missing credentials", () => {
  const claim = "https://storage.yandexcloud.net/credentials";
  const credentials = storageCredentials({ sub: "admin", exp: Date.now() / 1000 + 60,
    [claim]: { accessKeyId: "synthetic", secretAccessKey: "synthetic-secret" } });
  assert.equal(credentials.accessKeyId, "synthetic");
  assert.throws(() => storageCredentials({ [claim]: { accessKeyId: "only-one" } }));
  assert.equal(allowedCaller({ sub: "doctor", exp: Date.now() / 1000 + 60 }, "doctor"), true);
  assert.equal(allowedCaller({ sub: "doctor", exp: 1 }, "doctor"), false);
});
test("S3 adapter sends bounded photo object command with synthetic credentials", async () => {
  let command: PutObjectCommand | undefined;
  const client = { async send(value: PutObjectCommand) { command = value; return {}; }, destroy() {} };
  const storage = createPhotoStorage("clevervet-patient-photos", { accessKeyId: "synthetic", secretAccessKey: "synthetic" }, client as never);
  await storage.putObject("11111111-1111-4111-8111-111111111111.jpg", Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]));
  assert.equal(command?.input.Bucket, "clevervet-patient-photos");
  assert.equal(command?.input.ContentType, "image/jpeg");
  assert.throws(() => createPhotoStorage("other", { accessKeyId: "a", secretAccessKey: "b" }));
  storage.close();
});
test("patient API uses full model and If-Match, surfaces a conflict", async () => {
  const requests: RequestInit[] = [];
  const fakeFetch: typeof fetch = async (_url, options) => {
    requests.push(options ?? {});
    if (options?.method === "PUT") return new Response(null, { status: 412 });
    return new Response(JSON.stringify({ id: "pilot", diagnoses: ["keep"] }), { status: 200, headers: { ETag: '"v1"' } });
  };
  const api = createPatientApi("synthetic-token", { branchId: "branch", departmentId: "department" }, fakeFetch);
  const current = await api.getPatient("pilot");
  assert.equal(current.etag, '"v1"');
  await assert.rejects(api.putPatient("pilot", { ...current.patient, photo: "synthetic" }, current.etag),
    (error: unknown) => error instanceof PhotoError && error.code === "CONFLICT");
  assert.equal((requests[1].headers as Record<string, string>)["If-Match"], '"v1"');
  assert.deepEqual(JSON.parse(requests[1].body as string).diagnoses, ["keep"]);
});
