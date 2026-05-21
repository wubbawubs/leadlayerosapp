/**
 * AES-256-GCM encryption for tenant-scoped secrets.
 * Server-only: reads ENCRYPTION_KEY from process.env at call time.
 *
 * Storage format (base64): iv (12B) ‖ authTag (16B) ‖ ciphertext
 */
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("ENCRYPTION_KEY is not configured");
  }
  // Accept base64 (preferred) or hex.
  let key: Buffer;
  try {
    key = Buffer.from(raw, "base64");
    if (key.length !== 32) {
      key = Buffer.from(raw, "hex");
    }
  } catch {
    key = Buffer.from(raw, "hex");
  }
  if (key.length !== 32) {
    throw new Error(
      `ENCRYPTION_KEY must decode to 32 bytes (got ${key.length}). Use a base64-encoded 32-byte key.`,
    );
  }
  return key;
}

export function encrypt(plaintext: string): { ciphertext: string; version: number } {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const packed = Buffer.concat([iv, tag, ct]).toString("base64");
  return { ciphertext: packed, version: 1 };
}

export function decrypt(packedBase64: string, version: number): string {
  if (version !== 1) {
    throw new Error(`Unsupported encryption_version: ${version}`);
  }
  const key = getKey();
  const buf = Buffer.from(packedBase64, "base64");
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ct = buf.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}
