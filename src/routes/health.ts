import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { prisma } from "../lib/prisma.js";
import { healthResponseSchema } from "../schemas/common.schemas.js";
import { successBody } from "../utils/response.js";

const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/health",
    {
      schema: {
        tags: ["System"],
        summary: "Health check",
        description: "Returns service health and database connectivity.",
        security: [],
        response: {
          200: healthResponseSchema,
          503: healthResponseSchema,
        },
      },
    },
    async (request, reply) => {
      let database: "ok" | "error" = "ok";
      try {
        await prisma.$queryRaw`SELECT 1`;
      } catch {
        database = "error";
      }

      const status = database === "ok" ? "ok" : "degraded";
      void reply.code(database === "ok" ? 200 : 503);

      return successBody(
        {
          status,
          service: "pdf-api",
          version: "1.0.0",
          database,
          uptimeSeconds: Math.floor(process.uptime()),
        },
        request.requestId,
      );
    },
  );

  app.get(
    "/v1/health",
    {
      schema: {
        tags: ["System"],
        summary: "Health check (v1)",
        description: "Versioned health check endpoint.",
        security: [],
        response: {
          200: healthResponseSchema,
          503: healthResponseSchema,
        },
      },
    },
    async (request, reply) => {
      let database: "ok" | "error" = "ok";
      try {
        await prisma.$queryRaw`SELECT 1`;
      } catch {
        database = "error";
      }

      const status = database === "ok" ? "ok" : "degraded";
      void reply.code(database === "ok" ? 200 : 503);

      return successBody(
        {
          status,
          service: "pdf-api",
          version: "1.0.0",
          database,
          uptimeSeconds: Math.floor(process.uptime()),
        },
        request.requestId,
      );
    },
  );
};

export default healthRoutes;
