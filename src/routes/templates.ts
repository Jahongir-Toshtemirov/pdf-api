import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import {
  getBuiltinMeta,
  listBuiltinTemplates,
} from "../services/template.service.js";
import {
  templateDetailResponseSchema,
  templateParamsSchema,
  templatesListResponseSchema,
} from "../schemas/common.schemas.js";
import { successBody } from "../utils/response.js";

const templateRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/v1/templates",
    {
      schema: {
        tags: ["Templates"],
        summary: "List built-in templates",
        description:
          "Returns metadata and example data for all built-in PDF templates.",
        security: [{ bearerAuth: [] }],
        response: {
          200: templatesListResponseSchema,
        },
      },
    },
    async (request) => {
      const templates = listBuiltinTemplates().map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        exampleData: t.exampleData,
      }));

      return successBody({ templates }, request.requestId);
    },
  );

  app.get(
    "/v1/templates/:templateId",
    {
      schema: {
        tags: ["Templates"],
        summary: "Get a built-in template",
        description: "Returns metadata and example data for one template.",
        security: [{ bearerAuth: [] }],
        params: templateParamsSchema,
        response: {
          200: templateDetailResponseSchema,
        },
      },
    },
    async (request) => {
      const { templateId } = request.params;
      const meta = getBuiltinMeta(templateId);

      return successBody(
        {
          id: meta.id,
          name: meta.name,
          description: meta.description,
          exampleData: meta.exampleData,
        },
        request.requestId,
      );
    },
  );
};

export default templateRoutes;
