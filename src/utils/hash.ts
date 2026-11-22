import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";

export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

export function generateApiKey(): { rawKey: string; prefix: string; hash: string } {
  const secret = randomBytes(24).toString("base64url");
  const rawKey = `pdf_live_${secret}`;
  const prefix = rawKey.slice(0, 16);
  return { rawKey, prefix, hash: hashApiKey(rawKey) };
}

export function maskApiKey(rawKey: string): string {
  if (rawKey.length <= 12) return "***";
  return `${rawKey.slice(0, 12)}...${rawKey.slice(-4)}`;
}

export function signPayload(payload: string): string {
  return createHmac("sha256", env.URL_SIGNING_SECRET)
    .update(payload)
    .digest("hex");
}

export function verifySignature(payload: string, signature: string): boolean {
  const expected = signPayload(payload);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
