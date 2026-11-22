import type { ApiKey } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { hashApiKey } from "../utils/hash.js";

export async function verifyApiKey(rawKey: string): Promise<ApiKey | null> {
  const keyHash = hashApiKey(rawKey);
  const apiKey = await prisma.apiKey.findUnique({ where: { keyHash } });
  if (!apiKey) return null;

  // Fire-and-forget last used stamp
  void prisma.apiKey
    .update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    })
    .catch(() => undefined);

  return apiKey;
}
