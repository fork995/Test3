// @vitest-environment jsdom
import { createHmac } from "node:crypto";
import { Blob as NodeBlob } from "node:buffer";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { PatientPhotoDialog } from "../src/PatientPhotoDialog";
import { uploadMockPatientPhoto } from "../src/photoBackend";
import type { Patient } from "../src/model";
import { createMockDependencies } from "../../photo-backend/src/mock";
import { createMockJwtVerifier, createPhotoHttpServer } from "../../photo-backend/src/server";
import { PhotoService } from "../../photo-backend/src/service";

it("Test3 dialog confirms photo only after the HTTP mock S3 and patient API complete", async () => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  const oldCreate = URL.createObjectURL;
  const oldRevoke = URL.revokeObjectURL;
  URL.createObjectURL = vi.fn(() => "blob:synthetic-preview");
  URL.revokeObjectURL = vi.fn();
  const secret = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
  const header = Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ iss: "clevervet-test3-mock", aud: "photo-backend-mock", sub: "synthetic-doctor",
    exp: Math.floor(Date.now() / 1000) + 120 })).toString("base64url");
  const unsigned = `${header}.${payload}`;
  const token = `${unsigned}.${createHmac("sha256", secret).update(unsigned).digest("base64url")}`;
  const mock = createMockDependencies("synthetic-patient");
  const service = new PhotoService({ writesEnabled: true, conditionalUpdateSupported: true,
    pilotPatientId: "synthetic-patient", bucket: "clevervet-patient-photos" }, mock.dependencies);
  const server = createPhotoHttpServer({ mockEnabled: true, pilotPatientId: "synthetic-patient",
    verifyCaller: createMockJwtVerifier(secret, "synthetic-doctor"), service });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("No server address");
  const base = `http://127.0.0.1:${address.port}`;
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  const saved = vi.fn();
  const patient = { id: "synthetic-patient", name: "Synthetic", photo: "" } as Patient;
  const jpeg = new NodeBlob([Uint8Array.from([0xff, 0xd8, 1, 2, 0xff, 0xd9])], { type: "image/jpeg" }) as Blob;
  const networkFetch: typeof fetch = (async (input, init) => fetch(String(input), {
    ...init, signal: undefined, body: Buffer.from(await (init?.body as Blob).arrayBuffer()),
  })) as typeof fetch;
  try {
    await act(async () => root.render(<PatientPhotoDialog patient={patient} onClose={() => {}}
      processor={async () => ({ blob: jpeg, width: 2, height: 1 })}
      upload={(id, data) => uploadMockPatientPhoto(base, token, id, data, undefined, networkFetch)} onSaved={saved}/>));
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { value: [new File([jpeg], "test.jpg", { type: "image/jpeg" })] });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    expect(saved).not.toHaveBeenCalled();
    const button = [...container.querySelectorAll("button")].find(x => x.textContent?.trim() === "Сохранить")!;
    await act(async () => { button.click(); await vi.waitFor(() => expect(saved).toHaveBeenCalledTimes(1), { timeout: 8_000 }); });
    expect(saved, container.querySelector(".error")?.textContent ?? "no dialog error").toHaveBeenCalledTimes(1);
    expect(mock.inspect().objectCount).toBe(1);
    expect(mock.inspect().patient.photo).toBe(saved.mock.calls[0][0]);
  } finally {
    await act(async () => root.unmount()); container.remove();
    URL.createObjectURL = oldCreate; URL.revokeObjectURL = oldRevoke;
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
