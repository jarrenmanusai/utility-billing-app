/**
 * File storage service.
 * Abstracts S3-compatible storage via presigned URLs.
 * If no storage is configured, files can be stored locally or the upload
 * endpoint can be pointed at any S3-compatible bucket.
 */

import { ENV } from "./env.js";

export interface StorageResult {
  key: string;
  url: string;
}

/**
 * Upload a file to storage.
 * If STORAGE_API_URL and STORAGE_API_KEY are configured, uses presigned PUT.
 * Otherwise, returns a local path reference.
 */
export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<StorageResult> {
  const key = appendHashSuffix(normalizeKey(relKey));

  if (!ENV.storageApiUrl || !ENV.storageApiKey) {
    // Fallback: no external storage configured
    // In production, you should configure S3 or compatible storage
    console.warn("[Storage] No storage configured — file not persisted externally");
    return { key, url: `/storage/${key}` };
  }

  // Get presigned PUT URL
  const presignUrl = new URL("v1/storage/presign/put", ENV.storageApiUrl + "/");
  presignUrl.searchParams.set("path", key);

  const presignResp = await fetch(presignUrl, {
    headers: { Authorization: `Bearer ${ENV.storageApiKey}` },
  });

  if (!presignResp.ok) {
    const msg = await presignResp.text().catch(() => presignResp.statusText);
    throw new Error(`Storage presign failed (${presignResp.status}): ${msg}`);
  }

  const { url: s3Url } = (await presignResp.json()) as { url: string };
  if (!s3Url) throw new Error("Storage returned empty presign URL");

  // PUT file directly to S3
  const blob =
    typeof data === "string"
      ? new Blob([data], { type: contentType })
      : new Blob([data as any], { type: contentType });

  const uploadResp = await fetch(s3Url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });

  if (!uploadResp.ok) {
    throw new Error(`Storage upload to S3 failed (${uploadResp.status})`);
  }

  return { key, url: `/storage/${key}` };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  if (!ENV.storageApiUrl || !ENV.storageApiKey) {
    return `/storage/${normalizeKey(relKey)}`;
  }

  const key = normalizeKey(relKey);
  const getUrl = new URL("v1/storage/presign/get", ENV.storageApiUrl + "/");
  getUrl.searchParams.set("path", key);

  const resp = await fetch(getUrl, {
    headers: { Authorization: `Bearer ${ENV.storageApiKey}` },
  });

  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    throw new Error(`Storage signed URL failed (${resp.status}): ${msg}`);
  }

  const { url } = (await resp.json()) as { url: string };
  return url;
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}
