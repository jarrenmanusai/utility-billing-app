/**
 * Storage abstraction layer.
 *
 * Supports two backends:
 *   1. "forge" — Manus Forge presigned-URL flow (original behavior)
 *   2. "s3"   — Any S3-compatible provider (AWS S3, Supabase Storage, Cloudflare R2, DigitalOcean Spaces)
 *
 * The backend is selected by the STORAGE_PROVIDER env var (default: "forge").
 * When STORAGE_PROVIDER=s3, the following env vars are required:
 *   S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY, S3_PUBLIC_URL
 */

import { ENV } from "./_core/env";
import crypto from "crypto";

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

// ─── Forge Backend (original Manus behavior) ────────────────────────────────

function getForgeConfig() {
  const forgeUrl = ENV.forgeApiUrl;
  const forgeKey = ENV.forgeApiKey;

  if (!forgeUrl || !forgeKey) {
    throw new Error(
      "Storage config missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY (or switch to STORAGE_PROVIDER=s3)",
    );
  }

  return { forgeUrl: forgeUrl.replace(/\/+$/, ""), forgeKey };
}

async function forgePut(
  key: string,
  data: Buffer | Uint8Array | string,
  contentType: string,
): Promise<{ key: string; url: string }> {
  const { forgeUrl, forgeKey } = getForgeConfig();

  const presignUrl = new URL("v1/storage/presign/put", forgeUrl + "/");
  presignUrl.searchParams.set("path", key);

  const presignResp = await fetch(presignUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` },
  });

  if (!presignResp.ok) {
    const msg = await presignResp.text().catch(() => presignResp.statusText);
    throw new Error(`Storage presign failed (${presignResp.status}): ${msg}`);
  }

  const { url: s3Url } = (await presignResp.json()) as { url: string };
  if (!s3Url) throw new Error("Forge returned empty presign URL");

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

  return { key, url: `/manus-storage/${key}` };
}

async function forgeGetSignedUrl(key: string): Promise<string> {
  const { forgeUrl, forgeKey } = getForgeConfig();

  const getUrl = new URL("v1/storage/presign/get", forgeUrl + "/");
  getUrl.searchParams.set("path", key);

  const resp = await fetch(getUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` },
  });

  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    throw new Error(`Storage signed URL failed (${resp.status}): ${msg}`);
  }

  const { url } = (await resp.json()) as { url: string };
  return url;
}

// ─── S3-Compatible Backend ──────────────────────────────────────────────────

function getS3Config() {
  if (!ENV.s3Endpoint || !ENV.s3Bucket || !ENV.s3AccessKey || !ENV.s3SecretKey) {
    throw new Error(
      "S3 storage config missing: set S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY",
    );
  }
  return {
    endpoint: ENV.s3Endpoint.replace(/\/+$/, ""),
    bucket: ENV.s3Bucket,
    accessKey: ENV.s3AccessKey,
    secretKey: ENV.s3SecretKey,
    region: ENV.s3Region,
    publicUrl: ENV.s3PublicUrl.replace(/\/+$/, ""),
  };
}

/**
 * Generate HMAC-SHA256 signature for S3 PUT requests.
 * This is a minimal AWS Signature V4 implementation for PUT operations.
 */
function hmacSha256(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac("sha256", key).update(data).digest();
}

function sha256(data: Buffer | Uint8Array | string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

async function s3Put(
  key: string,
  data: Buffer | Uint8Array | string,
  contentType: string,
): Promise<{ key: string; url: string }> {
  const config = getS3Config();
  const body = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);
  const now = new Date();
  const dateStamp = now.toISOString().replace(/[:-]|\.\d{3}/g, "").slice(0, 8);
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "").slice(0, 15) + "Z";

  const host = new URL(config.endpoint).host;
  const path = `/${config.bucket}/${key}`;
  const payloadHash = sha256(body);

  const canonicalHeaders =
    `content-type:${contentType}\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";

  const canonicalRequest = [
    "PUT",
    path,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join("\n");

  const signingKey = hmacSha256(
    hmacSha256(
      hmacSha256(
        hmacSha256(`AWS4${config.secretKey}`, dateStamp),
        config.region,
      ),
      "s3",
    ),
    "aws4_request",
  );

  const signature = hmacSha256(signingKey, stringToSign).toString("hex");
  const authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const uploadUrl = `${config.endpoint}/${config.bucket}/${key}`;
  const resp = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      Authorization: authorization,
    },
    body: body,
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => resp.statusText);
    throw new Error(`S3 upload failed (${resp.status}): ${errText}`);
  }

  const publicUrl = config.publicUrl
    ? `${config.publicUrl}/${key}`
    : `${config.endpoint}/${config.bucket}/${key}`;

  return { key, url: publicUrl };
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));

  if (ENV.storageProvider === "s3") {
    return s3Put(key, data, contentType);
  }
  return forgePut(key, data, contentType);
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);

  if (ENV.storageProvider === "s3") {
    const config = getS3Config();
    const publicUrl = config.publicUrl
      ? `${config.publicUrl}/${key}`
      : `${config.endpoint}/${config.bucket}/${key}`;
    return { key, url: publicUrl };
  }

  return { key, url: `/manus-storage/${key}` };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const key = normalizeKey(relKey);

  if (ENV.storageProvider === "s3") {
    // For S3 providers with public buckets, return the public URL directly
    const config = getS3Config();
    return config.publicUrl
      ? `${config.publicUrl}/${key}`
      : `${config.endpoint}/${config.bucket}/${key}`;
  }

  return forgeGetSignedUrl(key);
}
