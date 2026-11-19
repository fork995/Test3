import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { StorageCredentials } from "./auth.js";

export function createPhotoStorage(bucket: string, credentials: StorageCredentials, clientOverride?: Pick<S3Client, "send" | "destroy">) {
  if (bucket !== "clevervet-patient-photos") throw Error("Unexpected photo bucket");
  const client = clientOverride ?? new S3Client({
    region: "ru-central1", endpoint: "https://storage.yandexcloud.net",
    forcePathStyle: true, credentials, maxAttempts: 1,
  });
  return {
    async putObject(key: string, jpeg: Uint8Array): Promise<void> {
      if (!/^[0-9a-f-]{36}\.jpg$/i.test(key)) throw Error("Invalid photo key");
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: jpeg,
        ContentType: "image/jpeg", CacheControl: "private, max-age=0" }));
    },
    close() { client.destroy(); },
  };
}
