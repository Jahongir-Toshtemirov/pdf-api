import { z } from "zod";

export const metaSchema = z.object({
  requestId: z.string(),
}).passthrough();

export const apiSuccessSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
    meta: metaSchema,
  });

export const healthDataSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  service: z.string(),
  version: z.string(),
  database: z.enum(["ok", "error"]),
  uptimeSeconds: z.number(),
});

export const healthResponseSchema = apiSuccessSchema(healthDataSchema);

export const templateIdSchema = z.enum(["invoice", "report", "certificate"]);

export const templateParamsSchema = z.object({
  templateId: templateIdSchema,
});

export const templateMetaSchema = z.object({
  id: templateIdSchema,
  name: z.string(),
  description: z.string(),
  exampleData: z.record(z.unknown()),
});

export const templatesListResponseSchema = apiSuccessSchema(
  z.object({
    templates: z.array(templateMetaSchema),
  }),
);

export const templateDetailResponseSchema = apiSuccessSchema(templateMetaSchema);

export const usageResponseSchema = apiSuccessSchema(
  z.object({
    keyName: z.string(),
    keyPrefix: z.string(),
    used: z.number(),
    limit: z.number(),
    remaining: z.number(),
    resetsAt: z.string(),
    tier: z.string(),
  }),
);

export const signedPdfResponseSchema = apiSuccessSchema(
  z.object({
    url: z.string().url(),
    expiresAt: z.string(),
    filename: z.string(),
    sizeBytes: z.number(),
    usage: z.object({
      used: z.number(),
      limit: z.number(),
      remaining: z.number(),
      resetsAt: z.string(),
    }),
  }),
);

export const downloadParamsSchema = z.object({
  id: z.string().uuid(),
});

export const downloadQuerySchema = z.object({
  exp: z.string().min(1),
  sig: z.string().min(1),
});
