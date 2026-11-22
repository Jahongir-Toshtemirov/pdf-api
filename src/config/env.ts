import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1).optional(),
  FREE_TIER_LIMIT: z.coerce.number().int().positive().default(100),
  SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  URL_SIGNING_SECRET: z.string().min(16),
  PUBLIC_BASE_URL: z.string().url().default("http://localhost:3000"),
  ADMIN_EMAIL: z.string().email().default("admin@pdfapi.local"),
  ADMIN_PASSWORD: z.string().min(8).default("changeme123!"),
  ADMIN_JWT_SECRET: z.string().min(16).optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${details}`);
  }
  return parsed.data;
}

export const env = loadEnv();
