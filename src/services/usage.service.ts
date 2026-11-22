import type { ApiKey } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { quotaExceeded } from "../lib/errors.js";
import { currentYearMonth, nextMonthResetIso } from "../utils/response.js";

export async function getUsage(
  apiKeyId: string,
  yearMonth = currentYearMonth(),
): Promise<{ used: number; limit: number; remaining: number; resetsAt: string }> {
  const apiKey = await prisma.apiKey.findUniqueOrThrow({
    where: { id: apiKeyId },
  });

  const record = await prisma.usageRecord.findUnique({
    where: {
      apiKeyId_yearMonth: { apiKeyId, yearMonth },
    },
  });

  const used = record?.count ?? 0;
  return {
    used,
    limit: apiKey.monthlyLimit,
    remaining: Math.max(0, apiKey.monthlyLimit - used),
    resetsAt: nextMonthResetIso(),
  };
}

export async function assertWithinQuota(apiKey: ApiKey): Promise<void> {
  const usage = await getUsage(apiKey.id);
  if (usage.used >= usage.limit) {
    throw quotaExceeded(usage.used, usage.limit, usage.resetsAt);
  }
}

export async function incrementUsage(apiKeyId: string): Promise<{
  used: number;
  limit: number;
  remaining: number;
  resetsAt: string;
}> {
  const yearMonth = currentYearMonth();

  const apiKey = await prisma.apiKey.findUniqueOrThrow({
    where: { id: apiKeyId },
  });

  const record = await prisma.usageRecord.upsert({
    where: {
      apiKeyId_yearMonth: { apiKeyId, yearMonth },
    },
    create: {
      apiKeyId,
      yearMonth,
      count: 1,
    },
    update: {
      count: { increment: 1 },
    },
  });

  return {
    used: record.count,
    limit: apiKey.monthlyLimit,
    remaining: Math.max(0, apiKey.monthlyLimit - record.count),
    resetsAt: nextMonthResetIso(),
  };
}
