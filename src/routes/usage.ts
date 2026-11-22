import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { unauthorized } from "../lib/errors.js";
import { usageResponseSchema } from "../schemas/common.schemas.js";
import { getUsage } from "../services/usage.service.js";
import { successBody } from "../utils/response.js";

const usageRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/v1/usage",
    {
      schema: {
        tags: ["Usage"],
        summary: "Get current month usage",
        description:
          "Returns PDF generation usage for the authenticated API key in the current calendar month (UTC).",
        security: [{ bearerAuth: [] }],
        response: {
          200: usageResponseSchema,
        },
      },
    },
    async (request) => {
      if (!request.apiKey) {
        throw unauthorized();
      }

      const usage = await getUsage(request.apiKey.id);

      return successBody(
        {
          keyName: request.apiKey.name,
          keyPrefix: `${request.apiKey.keyPrefix}...`,
          ...usage,
          tier: "free",
        },
        request.requestId,
      );
    },
  );
};

export default usageRoutes;
