import { PhotoError, type Patient, type PhotoDependencies } from "./service.js";

/** In-memory synthetic patient and object store. Never connects to CleverVet or S3. */
export function createMockDependencies(patientId: string) {
  let version = 1;
  let patient: Patient = { id: patientId, name: "Synthetic patient", diagnoses: ["synthetic"], photo: "" };
  const objects = new Map<string, Uint8Array>();
  const dependencies: PhotoDependencies = {
    async getPatient(id) {
      if (id !== patientId) throw new PhotoError("PATIENT_DENIED", "Patient is not in mock scope.");
      return { patient: structuredClone(patient), etag: `"mock-${version}"` };
    },
    async putPatient(id, next, etag) {
      if (id !== patientId || etag !== `"mock-${version}"`)
        throw new PhotoError("CONFLICT", "Mock patient changed.");
      patient = structuredClone(next);
      version++;
    },
    async putObject(key, jpeg) { objects.set(key, Uint8Array.from(jpeg)); },
  };
  return { dependencies, inspect: () => ({ patient: structuredClone(patient), objectCount: objects.size, version }) };
}
