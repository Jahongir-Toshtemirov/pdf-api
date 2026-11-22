import { prisma } from "../lib/prisma.js";
import { env } from "../config/env.js";

export async function getSettings() {
  const existing = await prisma.appSettings.findUnique({ where: { id: 1 } });
  if (existing) return existing;

  return prisma.appSettings.create({
    data: {
      id: 1,
      defaultMonthlyLimit: env.FREE_TIER_LIMIT,
      signedUrlTtlSeconds: env.SIGNED_URL_TTL_SECONDS,
    },
  });
}

export async function updateSettings(input: {
  defaultMonthlyLimit?: number;
  signedUrlTtlSeconds?: number;
}) {
  await getSettings();
  return prisma.appSettings.update({
    where: { id: 1 },
    data: {
      ...(input.defaultMonthlyLimit !== undefined
        ? { defaultMonthlyLimit: input.defaultMonthlyLimit }
        : {}),
      ...(input.signedUrlTtlSeconds !== undefined
        ? { signedUrlTtlSeconds: input.signedUrlTtlSeconds }
        : {}),
    },
  });
}
