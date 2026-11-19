import assert from "node:assert/strict";
import { test } from "node:test";
import { PhotoError, PhotoService, type Patient } from "./service.js";

const jpeg = Uint8Array.from([0xff, 0xd8, 1, 2, 0xff, 0xd9]);
const id = "11111111-1111-4111-8111-111111111111";
function fixture() {
  let patient: Patient = { id: "pilot", name: "Test", diagnoses: ["unchanged"], photo: "old" };
  let puts = 0, uploads = 0;
  const service = new PhotoService({ writesEnabled: true, conditionalUpdateSupported: true, pilotPatientId: "pilot", bucket: "clevervet-patient-photos" }, {
    async getPatient() { return { patient: structuredClone(patient), etag: `"v${puts}"` }; },
    async putObject() { uploads++; },
    async putPatient(_id, next, etag) { assert.equal(etag, `"v${puts}"`); patient = structuredClone(next); puts++; },
  });
  return { service, counters: () => ({ puts, uploads }), patient: () => patient };
}
test("writes are disabled by default configuration", async () => {
  const f = fixture();
  const service = new PhotoService({ writesEnabled: false, conditionalUpdateSupported: false, pilotPatientId: "pilot", bucket: "clevervet-patient-photos" }, {
    async getPatient() { throw Error("unexpected GET"); }, async putObject() { throw Error("unexpected S3"); }, async putPatient() { throw Error("unexpected PUT"); },
  });
  await assert.rejects(service.save("pilot", jpeg, id), (e: unknown) => e instanceof PhotoError && e.code === "WRITES_DISABLED");
  assert.deepEqual(f.counters(), { puts: 0, uploads: 0 });
});
test("uploads and confirms photo without changing other fields; duplicate returns prior result", async () => {
  const f = fixture();
  const first = await f.service.save("pilot", jpeg, id);
  assert.match(first.photo, /^https:\/\/storage\.yandexcloud\.net\/clevervet-patient-photos\/[\w-]+\.jpg$/);
  assert.equal(f.patient().photo, first.photo);
  assert.deepEqual(f.patient().diagnoses, ["unchanged"]);
  assert.deepEqual(await f.service.save("pilot", jpeg, id), first);
  assert.deepEqual(f.counters(), { puts: 1, uploads: 1 });
});
test("rejects other patient before any side effect", async () => {
  const f = fixture();
  await assert.rejects(f.service.save("other", jpeg, id), (e: unknown) => e instanceof PhotoError && e.code === "PATIENT_DENIED");
  assert.deepEqual(f.counters(), { puts: 0, uploads: 0 });
});
test("refuses PUT without conditional update support", async () => {
  let puts = 0;
  const service = new PhotoService({ writesEnabled: true, conditionalUpdateSupported: true, pilotPatientId: "pilot", bucket: "clevervet-patient-photos" }, {
    async getPatient() { return { patient: { id: "pilot" } }; }, async putObject() { puts++; }, async putPatient() { puts++; },
  });
  await assert.rejects(service.save("pilot", jpeg, id), (e: unknown) => e instanceof PhotoError && e.code === "NO_CONDITIONAL_UPDATE");
  assert.equal(puts, 0);
});
test("does not call S3 when conditional update has not been confirmed", async () => {
  let calls = 0;
  const service = new PhotoService({ writesEnabled: true, conditionalUpdateSupported: false,
    pilotPatientId: "pilot", bucket: "clevervet-patient-photos" }, {
    async getPatient() { calls++; return { patient: { id: "pilot" }, etag: '"v1"' }; },
    async putObject() { calls++; }, async putPatient() { calls++; },
  });
  await assert.rejects(service.save("pilot", jpeg, id), (e: unknown) => e instanceof PhotoError && e.code === "NO_CONDITIONAL_UPDATE");
  assert.equal(calls, 0);
});
