import { randomUUID, createHash } from "node:crypto";

export type Patient = Record<string, unknown> & { id: string; photo?: string };
export interface PhotoDependencies {
  getPatient(id: string): Promise<{ patient: Patient; etag?: string }>;
  putPatient(id: string, patient: Patient, etag?: string): Promise<void>;
  putObject(key: string, jpeg: Uint8Array): Promise<void>;
}
export interface PhotoConfig {
  writesEnabled: boolean;
  pilotPatientId: string;
  bucket: string;
  conditionalUpdateSupported: boolean;
}
export class PhotoError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}
const validId = (id: string) => /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id);
export function jpegValid(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes.length <= 8 * 1024 * 1024 &&
    bytes[0] === 0xff && bytes[1] === 0xd8 &&
    bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
}
export function samePatientExceptPhoto(a: Patient, b: Patient): boolean {
  const { photo: _a, ...restA } = a;
  const { photo: _b, ...restB } = b;
  return createHash("sha256").update(JSON.stringify(restA)).digest("hex") ===
    createHash("sha256").update(JSON.stringify(restB)).digest("hex");
}
export class PhotoService {
  private readonly inFlight = new Set<string>();
  private readonly completed = new Map<string, { photo: string; at: number }>();
  constructor(private readonly config: PhotoConfig, private readonly dependencies: PhotoDependencies) {}
  async save(patientId: string, jpeg: Uint8Array, requestId: string): Promise<{ photo: string }> {
    if (!this.config.writesEnabled) throw new PhotoError("WRITES_DISABLED", "Запись фотографий отключена.");
    if (!this.config.conditionalUpdateSupported)
      throw new PhotoError("NO_CONDITIONAL_UPDATE", "Условное обновление пациента не подтверждено.");
    if (!validId(patientId) || patientId !== this.config.pilotPatientId)
      throw new PhotoError("PATIENT_DENIED", "Пациент не разрешён для пилота.");
    if (!/^[0-9a-f-]{36}$/i.test(requestId)) throw new PhotoError("BAD_REQUEST", "Некорректный ID запроса.");
    if (!jpegValid(jpeg)) throw new PhotoError("BAD_IMAGE", "Требуется JPEG до 8 МБ.");
    for (const [id, result] of this.completed) {
      if (Date.now() - result.at >= 10 * 60_000) this.completed.delete(id);
    }
    const previous = this.completed.get(requestId);
    if (previous && Date.now() - previous.at < 10 * 60_000) return { photo: previous.photo };
    if (this.inFlight.has(patientId) || this.inFlight.has(requestId))
      throw new PhotoError("IN_PROGRESS", "Сохранение уже выполняется.");
    this.inFlight.add(patientId); this.inFlight.add(requestId);
    try {
      const before = await this.dependencies.getPatient(patientId);
      if (before.patient.id !== patientId) throw new PhotoError("BAD_PATIENT", "Ответ пациента не совпал.");
      if (!before.etag) throw new PhotoError("NO_CONDITIONAL_UPDATE", "ETag пациента отсутствует.");
      const key = `${randomUUID()}.jpg`;
      const photo = `https://storage.yandexcloud.net/${this.config.bucket}/${key}`;
      await this.dependencies.putObject(key, jpeg);
      const current = await this.dependencies.getPatient(patientId);
      if (!samePatientExceptPhoto(before.patient, current.patient) || before.patient.photo !== current.patient.photo ||
        (before.etag && current.etag && before.etag !== current.etag))
        throw new PhotoError("CONFLICT", "Пациент изменился во время загрузки.");
      if (!current.etag) throw new PhotoError("NO_CONDITIONAL_UPDATE", "Сервер не предоставил ETag для безопасного PUT.");
      const updated = { ...current.patient, photo };
      try {
        await this.dependencies.putPatient(patientId, updated, current.etag);
      } catch (error) {
        const check = await this.dependencies.getPatient(patientId);
        if (check.patient.photo !== photo) throw error;
      }
      const confirmed = await this.dependencies.getPatient(patientId);
      if (confirmed.patient.photo !== photo || !samePatientExceptPhoto(current.patient, confirmed.patient))
        throw new PhotoError("NOT_CONFIRMED", "Сохранение фотографии не подтверждено.");
      this.completed.set(requestId, { photo, at: Date.now() });
      return { photo };
    } finally {
      this.inFlight.delete(patientId); this.inFlight.delete(requestId);
    }
  }
}
