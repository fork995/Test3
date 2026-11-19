import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const secretFile = process.env.MOCK_JWT_SECRET_FILE;
if (!secretFile) throw Error("MOCK_JWT_SECRET_FILE required");
const key = readFileSync(secretFile);
const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
const unsigned = `${encode({ alg: "HS256" })}.${encode({ iss: "clevervet-test3-mock",
  aud: "photo-backend-mock", sub: "synthetic-doctor", exp: Math.floor(Date.now() / 1000) + 90 })}`;
const token = `${unsigned}.${createHmac("sha256", key).update(unsigned).digest("base64url")}`;
const requestId = randomUUID();
const url = "http://127.0.0.1:8787/api/mock/patients/synthetic-patient/photo";
async function send() {
  const response = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}`,
    "Content-Type": "image/jpeg", "X-Request-ID": requestId },
    body: Buffer.from([0xff, 0xd8, 1, 2, 0xff, 0xd9]), signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw Error(`Mock upload failed: HTTP ${response.status}`);
  const data = await response.json();
  if (!data.confirmed || typeof data.photo !== "string") throw Error("Mock save not confirmed");
  return data.photo;
}
const first = await send();
const duplicate = await send();
if (first !== duplicate) throw Error("Duplicate request was not deduplicated");
process.stdout.write("Live local HTTP mock upload confirmed; duplicate request reused the result.\n");
