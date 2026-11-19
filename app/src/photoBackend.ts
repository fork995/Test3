import { patientPhotoUrl } from "./PatientPhoto";

/** Synthetic local route. No server credentials are placed in Test3. */
export async function uploadMockPatientPhoto(
  baseUrl: string, callerToken: string, patientId: string, jpeg: Blob,
  requestId = crypto.randomUUID(), fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const base = new URL(baseUrl);
  if (base.protocol !== "https:" && !(base.protocol === "http:" && ["127.0.0.1", "localhost"].includes(base.hostname)))
    throw Error("Адрес backend должен использовать HTTPS или локальное соединение.");
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(patientId) || jpeg.type !== "image/jpeg" || jpeg.size > 8 * 1024 * 1024)
    throw Error("Недопустимая фотография или пациент.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetchImpl(new URL(`/api/mock/patients/${encodeURIComponent(patientId)}/photo`, base), {
      method: "POST", mode: "cors", credentials: "omit", cache: "no-store", redirect: "error",
      headers: { Authorization: `Bearer ${callerToken}`, "Content-Type": "image/jpeg", "X-Request-ID": requestId },
      body: jpeg, signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403) throw Error("Нет доступа к сохранению фотографии.");
    if (!response.ok) throw Error("Не удалось сохранить фотографию.");
    const result: unknown = await response.json();
    const photo = result && typeof result === "object" ? (result as { photo?: unknown; confirmed?: unknown }).photo : null;
    const confirmed = result && typeof result === "object" && (result as { confirmed?: unknown }).confirmed === true;
    if (!confirmed || !patientPhotoUrl(photo)) throw Error("Backend не подтвердил сохранение фотографии.");
    return photo as string;
  } catch (error) {
    if (controller.signal.aborted) throw Error("Превышено время ожидания backend.");
    throw error;
  } finally { clearTimeout(timer); }
}
