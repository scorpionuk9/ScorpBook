import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM for HMRC tokens at rest: "v1.<iv>.<tag>.<ciphertext>" (base64url).
function key(): Buffer {
  const value = process.env.HMRC_TOKEN_KEY;
  const buffer = value ? Buffer.from(value, "base64") : Buffer.alloc(0);
  if (buffer.length !== 32) throw new Error("HMRC_TOKEN_KEY must be 32 bytes, base64 encoded.");
  return buffer;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function decryptSecret(stored: string): string {
  const [version, iv, tag, data] = stored.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Stored HMRC token is not readable.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
