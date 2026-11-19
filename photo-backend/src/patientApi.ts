import { PhotoError, type Patient, type PhotoDependencies } from "./service.js";

export interface PatientLocation { branchId: string; departmentId: string }
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
/** Adapter requires independent verification that original CleverVet honors If-Match. */
export function createPatientApi(accessToken: string, location: PatientLocation, fetchImpl: typeof fetch = fetch): Pick<PhotoDependencies, "getPatient" | "putPatient"> {
  if (!accessToken || !idPattern.test(location.branchId) || !idPattern.test(location.departmentId)) throw Error("Invalid API configuration");
  function url(id: string) {
    if (!idPattern.test(id)) throw new PhotoError("PATIENT_DENIED", "Invalid patient ID");
    return `https://backend.clevervet.tech/api/branches/${location.branchId}/departments/${location.departmentId}/patients/${id}`;
  }
  async function request(id: string, method: "GET" | "PUT", patient?: Patient, etag?: string) {
    const response = await fetchImpl(url(id), { method, redirect: "error", cache: "no-store",
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json",
        ...(method === "PUT" ? { "Content-Type": "application/json", "If-Match": etag! } : {}) },
      ...(patient ? { body: JSON.stringify(patient) } : {}), signal: AbortSignal.timeout(10_000) });
    if (response.status === 401 || response.status === 403) throw new PhotoError("AUTH_EXPIRED", "CleverVet authorization failed");
    if (response.status === 409 || response.status === 412) throw new PhotoError("CONFLICT", "Patient changed");
    if (method === "PUT") {
      if (response.status !== 200 && response.status !== 204) throw new PhotoError("API_ERROR", "Patient PUT failed");
      return response;
    }
    if (response.status !== 200) throw new PhotoError("API_ERROR", "Patient GET failed");
    return response;
  }
  return {
    async getPatient(id) {
      const response = await request(id, "GET");
      const patient = await response.json() as Patient;
      if (!patient || typeof patient !== "object" || patient.id !== id) throw new PhotoError("BAD_PATIENT", "Unexpected patient response");
      return { patient, etag: response.headers.get("etag") ?? undefined };
    },
    async putPatient(id, patient, etag) {
      if (!etag) throw new PhotoError("NO_CONDITIONAL_UPDATE", "ETag required");
      if (patient.id !== id) throw new PhotoError("BAD_PATIENT", "Patient mismatch");
      await request(id, "PUT", patient, etag);
    },
  };
}
