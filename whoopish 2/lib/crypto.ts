// Seal/unseal small JSON payloads into an opaque cookie value (AES-256-GCM).
import crypto from "crypto";

function key(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return crypto.createHash("sha256").update(secret).digest();
}

export function seal(obj: unknown): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(obj), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, data]).toString("base64url");
}

export function unseal<T>(sealed: string): T | null {
  try {
    const buf = Buffer.from(sealed, "base64url");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8"));
  } catch {
    return null;
  }
}
