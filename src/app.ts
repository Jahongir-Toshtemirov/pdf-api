import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import scalarApiReference from "@scalar/fastify-api-reference";
import {
  serializerCompiler,
  validatorCompiler,
  createJsonSchemaTransform,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { ZodError } from "zod";
import { env } from "./config/env.js";
import { AppError } from "./lib/errors.js";
import requestIdPlugin from "./middleware/request-id.js";
import authPlugin from "./middleware/auth.js";
import adminApiRoutes from "./routes/admin-api.js";
import adminPageRoutes from "./routes/admin-pages.js";
import healthRoutes from "./routes/health.js";
import pdfRoutes, { invoiceExample } from "./routes/pdf.js";
import templateRoutes from "./routes/templates.js";
import usageRoutes from "./routes/usage.js";
import { errorBody } from "./utils/response.js";
import {
  getBuiltinMeta,
} from "./services/template.service.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      redact: {
        paths: [
          "req.headers.authorization",
          "headers.authorization",
          "apiKey",
          "rawKey",
        ],
        censor: "[Redacted]",
      },
    },
    genReqId: (req) => {
      const incoming = req.headers["x-request-id"];
      return typeof incoming === "string" && incoming.length > 0
        ? incoming
        : crypto.randomUUID();
    },
    requestIdHeader: "x-request-id",
    bodyLimit: 2_500_000,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(helmet, {
    contentSecurityPolicy: false,
  });
  await app.register(cors, {
    origin: true,
    credentials: true,
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute",
    keyGenerator: (request) =>
      request.headers.authorization?.slice(0, 32) ?? request.ip,
  });

  await app.register(requestIdPlugin);
  await app.register(authPlugin);

  const swaggerTransform = createJsonSchemaTransform({
    skipList: [
      "/documentation/",
      "/documentation/initOAuth",
      "/documentation/json",
      "/documentation/uiConfig",
      "/documentation/yaml",
      "/documentation/*",
      "/documentation/static/*",
      "/docs",
      "/docs/",
      "/docs/*",
      "/openapi.json",
      "/admin",
      "/admin/",
      "/admin/login",
      "/admin/api",
      "/admin/api/*",
    ],
  });

  await app.register(swagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "PDF Generation API",
        description: [
          "Premium PDF generation for invoices, reports, certificates, and statements.",
          "",
          "## Authentication",
          "All `/v1/*` endpoints (except health and signed downloads) require:",
          "",
          "```",
          "Authorization: Bearer pdf_live_...",
          "```",
          "",
          "## Quick start",
          "1. Create an API key via the seed script (`npm run db:seed`)",
          "2. Generate from a built-in template: `POST /v1/pdf/templates/invoice`",
          "3. Or pass your own HTML template + data: `POST /v1/pdf/template`",
          "",
          "## Quotas",
          "Free tier: **100 PDFs / month** per API key. Check remaining quota with `GET /v1/usage`.",
          "",
          "## Template syntax",
          "- `{{name}}` — escaped variable",
          "- `{{{html}}}` — raw HTML",
          "- `{{#items}}...{{/items}}` — iterate / truthy section",
          "- `{{^empty}}...{{/empty}}` — inverted section",
        ].join("\n"),
        version: "1.0.0",
        contact: {
          name: "PDF API Support",
          email: "support@example.com",
        },
      },
      servers: [
        {
          url: env.PUBLIC_BASE_URL,
          description: "Current environment",
        },
      ],
      tags: [
        { name: "PDF", description: "Generate and download PDFs" },
        { name: "Templates", description: "Built-in business templates" },
        { name: "Usage", description: "Quota and usage" },
        { name: "System", description: "Health and status" },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "API Key",
            description: "API key issued as `pdf_live_...`",
          },
        },
      },
      security: [{ bearerAuth: [] }],
    },
    transform: swaggerTransform,
  });

  await app.register(scalarApiReference, {
    routePrefix: "/docs",
    configuration: {
      theme: "kepler",
      layout: "modern",
      metaData: {
        title: "PDF Generation API",
      },
    },
  });

  app.get("/openapi.json", { schema: { hide: true } }, async () =>
    app.swagger(),
  );

  await app.register(healthRoutes);
  await app.register(pdfRoutes);
  await app.register(templateRoutes);
  await app.register(usageRoutes);
  await app.register(adminPageRoutes);
  await app.register(adminApiRoutes);

  // Enrich OpenAPI with realistic examples after routes are registered
  app.addHook("onReady", async () => {
    const spec = app.swagger() as {
      paths?: Record<string, Record<string, unknown>>;
    };
    const templatePath = spec.paths?.["/v1/pdf/template"] as
      | { post?: { requestBody?: { content?: Record<string, { examples?: unknown }> } } }
      | undefined;
    if (templatePath?.post?.requestBody?.content?.["application/json"]) {
      templatePath.post.requestBody.content["application/json"].examples = {
        invoice: {
          summary: "Simple invoice template",
          value: invoiceExample,
        },
      };
    }

    const builtinPath = spec.paths?.["/v1/pdf/templates/{templateId}"] as
      | { post?: { requestBody?: { content?: Record<string, { examples?: unknown }> } } }
      | undefined;
    if (builtinPath?.post?.requestBody?.content?.["application/json"]) {
      const invoice = getBuiltinMeta("invoice");
      const report = getBuiltinMeta("report");
      builtinPath.post.requestBody.content["application/json"].examples = {
        invoice: {
          summary: "Professional invoice",
          value: {
            data: invoice.exampleData,
            options: { format: "A4", printBackground: true },
            delivery: "binary",
            filename: "invoice.pdf",
          },
        },
        report: {
          summary: "Monthly business report",
          value: {
            data: report.exampleData,
            options: { format: "A4", printBackground: true },
            delivery: "binary",
            filename: "report.pdf",
          },
        },
      };
    }
  });

  app.setErrorHandler((error, request, reply) => {
    const requestId = request.requestId ?? "unknown";

    if (error instanceof ZodError) {
      return reply.status(400).send(
        errorBody(
          "VALIDATION_ERROR",
          "Request validation failed",
          requestId,
          error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        ),
      );
    }

    if (error instanceof AppError) {
      return reply
        .status(error.statusCode)
        .send(errorBody(error.code, error.message, requestId, error.details));
    }

    const err = error as { statusCode?: number; message?: string };
    const statusCode =
      typeof err.statusCode === "number" ? err.statusCode : 500;

    if (statusCode === 429) {
      return reply
        .status(429)
        .send(
          errorBody(
            "RATE_LIMITED",
            "Too many requests. Please slow down.",
            requestId,
          ),
        );
    }

    if (statusCode >= 400 && statusCode < 500) {
      return reply
        .status(statusCode)
        .send(
          errorBody(
            "VALIDATION_ERROR",
            err.message || "Bad request",
            requestId,
          ),
        );
    }

    request.log.error({ err: error }, "Unhandled error");
    return reply
      .status(500)
      .send(
        errorBody(
          "INTERNAL_ERROR",
          "An unexpected error occurred",
          requestId,
        ),
      );
  });

  app.setNotFoundHandler((request, reply) => {
    reply
      .status(404)
      .send(
        errorBody(
          "NOT_FOUND",
          `Route ${request.method} ${request.url} not found`,
          request.requestId ?? "unknown",
        ),
      );
  });

  return app;
}
