import { prisma } from "../lib/prisma.js";
import { generateApiKey } from "../utils/hash.js";
import { currentYearMonth, nextMonthResetIso } from "../utils/response.js";
import { getSettings } from "./settings.service.js";
import {
  BUILTIN_TEMPLATES,
  type BuiltinTemplateId,
  getBuiltinMeta,
  invalidateTemplateCache,
  loadFileTemplate,
} from "./template.service.js";
import { notFound, validationError } from "../lib/errors.js";

export async function getDashboardStats() {
  const yearMonth = currentYearMonth();

  const [
    totalPdfs,
    activeKeys,
    totalKeys,
    monthUsageAgg,
    recentGenerations,
    settings,
  ] = await Promise.all([
    prisma.pdfGeneration.count(),
    prisma.apiKey.count({ where: { isActive: true } }),
    prisma.apiKey.count(),
    prisma.usageRecord.aggregate({
      where: { yearMonth },
      _sum: { count: true },
    }),
    prisma.pdfGeneration.findMany({
      take: 8,
      orderBy: { createdAt: "desc" },
      include: {
        apiKey: { select: { id: true, name: true, keyPrefix: true } },
      },
    }),
    getSettings(),
  ]);

  return {
    totalPdfs,
    activeKeys,
    totalKeys,
    usageThisMonth: monthUsageAgg._sum.count ?? 0,
    defaultMonthlyLimit: settings.defaultMonthlyLimit,
    resetsAt: nextMonthResetIso(),
    recentGenerations: recentGenerations.map(serializeGeneration),
  };
}

function serializeGeneration(g: {
  id: string;
  source: string;
  filename: string;
  sizeBytes: number;
  delivery: string;
  requestId: string | null;
  createdAt: Date;
  apiKey: { id: string; name: string; keyPrefix: string } | null;
}) {
  return {
    id: g.id,
    source: g.source,
    filename: g.filename,
    sizeBytes: g.sizeBytes,
    delivery: g.delivery,
    requestId: g.requestId,
    createdAt: g.createdAt.toISOString(),
    apiKey: g.apiKey
      ? {
          id: g.apiKey.id,
          name: g.apiKey.name,
          keyPrefix: `${g.apiKey.keyPrefix}...`,
        }
      : null,
  };
}

export async function listApiKeys() {
  const yearMonth = currentYearMonth();
  const keys = await prisma.apiKey.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      usageRecords: { where: { yearMonth } },
      _count: { select: { generations: true } },
    },
  });

  return keys.map((key) => ({
    id: key.id,
    name: key.name,
    keyPrefix: `${key.keyPrefix}...`,
    isActive: key.isActive,
    monthlyLimit: key.monthlyLimit,
    usedThisMonth: key.usageRecords[0]?.count ?? 0,
    remaining: Math.max(
      0,
      key.monthlyLimit - (key.usageRecords[0]?.count ?? 0),
    ),
    totalGenerations: key._count.generations,
    createdAt: key.createdAt.toISOString(),
    lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
  }));
}

export async function createApiKey(input: {
  name: string;
  monthlyLimit?: number;
}) {
  const settings = await getSettings();
  const { rawKey, prefix, hash } = generateApiKey();

  const key = await prisma.apiKey.create({
    data: {
      name: input.name.trim(),
      keyPrefix: prefix,
      keyHash: hash,
      monthlyLimit: input.monthlyLimit ?? settings.defaultMonthlyLimit,
      isActive: true,
    },
  });

  return {
    id: key.id,
    name: key.name,
    keyPrefix: `${key.keyPrefix}...`,
    monthlyLimit: key.monthlyLimit,
    isActive: key.isActive,
    rawKey,
    createdAt: key.createdAt.toISOString(),
  };
}

export async function updateApiKey(
  id: string,
  input: { name?: string; monthlyLimit?: number; isActive?: boolean },
) {
  const existing = await prisma.apiKey.findUnique({ where: { id } });
  if (!existing) throw notFound("API key not found");

  const key = await prisma.apiKey.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.monthlyLimit !== undefined
        ? { monthlyLimit: input.monthlyLimit }
        : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });

  return {
    id: key.id,
    name: key.name,
    keyPrefix: `${key.keyPrefix}...`,
    monthlyLimit: key.monthlyLimit,
    isActive: key.isActive,
  };
}

export async function revokeApiKey(id: string) {
  return updateApiKey(id, { isActive: false });
}

export async function deleteApiKey(id: string) {
  const existing = await prisma.apiKey.findUnique({ where: { id } });
  if (!existing) throw notFound("API key not found");
  await prisma.apiKey.delete({ where: { id } });
  return { deleted: true };
}

export async function listGenerations(opts: {
  limit?: number;
  apiKeyId?: string;
}) {
  const generations = await prisma.pdfGeneration.findMany({
    where: opts.apiKeyId ? { apiKeyId: opts.apiKeyId } : undefined,
    take: Math.min(opts.limit ?? 50, 200),
    orderBy: { createdAt: "desc" },
    include: {
      apiKey: { select: { id: true, name: true, keyPrefix: true } },
    },
  });

  return generations.map(serializeGeneration);
}

export async function listTemplateSummaries() {
  const stored = await prisma.storedTemplate.findMany();
  const storedMap = new Map(stored.map((t) => [t.id, t]));

  return BUILTIN_TEMPLATES.map((meta) => {
    const override = storedMap.get(meta.id);
    return {
      id: meta.id,
      name: override?.name ?? meta.name,
      description: override?.description ?? meta.description,
      customized: Boolean(override),
      updatedAt: override?.updatedAt.toISOString() ?? null,
    };
  });
}

export async function getTemplateForAdmin(id: string) {
  const meta = getBuiltinMeta(id);
  const stored = await prisma.storedTemplate.findUnique({ where: { id } });
  const fileHtml = await loadFileTemplate(id as BuiltinTemplateId);

  return {
    id: meta.id,
    name: stored?.name ?? meta.name,
    description: stored?.description ?? meta.description,
    html: stored?.html ?? fileHtml,
    customized: Boolean(stored),
    exampleData: meta.exampleData,
    updatedAt: stored?.updatedAt.toISOString() ?? null,
  };
}

export async function saveTemplate(
  id: string,
  input: { html: string; name?: string; description?: string },
) {
  if (!input.html.trim()) {
    throw validationError("Template HTML cannot be empty");
  }

  const meta = getBuiltinMeta(id);
  const saved = await prisma.storedTemplate.upsert({
    where: { id },
    create: {
      id,
      name: input.name?.trim() || meta.name,
      description: input.description?.trim() || meta.description,
      html: input.html,
    },
    update: {
      html: input.html,
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined
        ? { description: input.description.trim() }
        : {}),
    },
  });

  invalidateTemplateCache(id as BuiltinTemplateId);

  return {
    id: saved.id,
    name: saved.name,
    description: saved.description,
    customized: true,
    updatedAt: saved.updatedAt.toISOString(),
  };
}

export async function resetTemplate(id: string) {
  getBuiltinMeta(id);
  await prisma.storedTemplate.deleteMany({ where: { id } });
  invalidateTemplateCache(id as BuiltinTemplateId);
  return { reset: true };
}

export async function recordGeneration(input: {
  apiKeyId: string;
  source: string;
  filename: string;
  sizeBytes: number;
  delivery: string;
  requestId?: string;
}) {
  await prisma.pdfGeneration.create({
    data: {
      apiKeyId: input.apiKeyId,
      source: input.source,
      filename: input.filename,
      sizeBytes: input.sizeBytes,
      delivery: input.delivery,
      requestId: input.requestId,
    },
  });
}
