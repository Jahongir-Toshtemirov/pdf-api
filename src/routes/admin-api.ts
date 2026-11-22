import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAdmin } from "../middleware/admin-auth.js";
import {
  changeAdminPassword,
  COOKIE_NAME,
  loginAdmin,
} from "../services/admin-auth.service.js";
import {
  createApiKey,
  deleteApiKey,
  getDashboardStats,
  getTemplateForAdmin,
  listApiKeys,
  listGenerations,
  listTemplateSummaries,
  resetTemplate,
  revokeApiKey,
  saveTemplate,
  updateApiKey,
} from "../services/admin.service.js";
import { getSettings, updateSettings } from "../services/settings.service.js";
import { env } from "../config/env.js";
import { unauthorized } from "../lib/errors.js";

const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const createKeyBody = z.object({
  name: z.string().min(1).max(120),
  monthlyLimit: z.number().int().positive().max(1_000_000).optional(),
});

const updateKeyBody = z.object({
  name: z.string().min(1).max(120).optional(),
  monthlyLimit: z.number().int().positive().max(1_000_000).optional(),
  isActive: z.boolean().optional(),
});

const settingsBody = z.object({
  defaultMonthlyLimit: z.number().int().positive().max(1_000_000).optional(),
  signedUrlTtlSeconds: z.number().int().positive().max(604_800).optional(),
});

const passwordBody = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});

const templateBody = z.object({
  html: z.string().min(1).max(2_000_000),
  name: z.string().min(1).max(120).optional(),
  description: z.string().min(1).max(500).optional(),
});

function cookieOptions(maxAgeSeconds: number) {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.NODE_ENV === "production",
    maxAge: maxAgeSeconds,
  };
}

const adminApiRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/admin/api/login",
    {
      schema: {
        hide: true,
        body: loginBody,
      },
    },
    async (request, reply) => {
      const { email, password } = request.body;
      const { admin, token } = await loginAdmin(email, password);

      void reply.setCookie(COOKIE_NAME, token, cookieOptions(60 * 60 * 12));

      return {
        success: true,
        data: {
          email: admin.email,
          name: admin.name,
        },
      };
    },
  );

  app.post(
    "/admin/api/logout",
    { schema: { hide: true } },
    async (_request, reply) => {
      void reply.clearCookie(COOKIE_NAME, { path: "/" });
      return { success: true };
    },
  );

  app.addHook("preHandler", async (request, reply) => {
    const path = request.url.split("?")[0] ?? "";
    if (path === "/admin/api/login" || path === "/admin/api/logout") {
      return;
    }
    if (!path.startsWith("/admin/api/")) {
      return;
    }
    await requireAdmin(request, reply);
  });

  app.get("/admin/api/me", { schema: { hide: true } }, async (request) => {
    if (!request.admin) throw unauthorized();
    return {
      success: true,
      data: {
        email: request.admin.email,
        name: request.admin.name,
        lastLoginAt: request.admin.lastLoginAt?.toISOString() ?? null,
      },
    };
  });

  app.get("/admin/api/stats", { schema: { hide: true } }, async () => ({
    success: true,
    data: await getDashboardStats(),
  }));

  app.get("/admin/api/keys", { schema: { hide: true } }, async () => ({
    success: true,
    data: { keys: await listApiKeys() },
  }));

  app.post(
    "/admin/api/keys",
    { schema: { hide: true, body: createKeyBody } },
    async (request) => ({
      success: true,
      data: await createApiKey(request.body),
    }),
  );

  app.patch(
    "/admin/api/keys/:id",
    {
      schema: {
        hide: true,
        params: z.object({ id: z.string().min(1) }),
        body: updateKeyBody,
      },
    },
    async (request) => ({
      success: true,
      data: await updateApiKey(request.params.id, request.body),
    }),
  );

  app.post(
    "/admin/api/keys/:id/revoke",
    {
      schema: {
        hide: true,
        params: z.object({ id: z.string().min(1) }),
      },
    },
    async (request) => ({
      success: true,
      data: await revokeApiKey(request.params.id),
    }),
  );

  app.delete(
    "/admin/api/keys/:id",
    {
      schema: {
        hide: true,
        params: z.object({ id: z.string().min(1) }),
      },
    },
    async (request) => ({
      success: true,
      data: await deleteApiKey(request.params.id),
    }),
  );

  app.get(
    "/admin/api/usage",
    {
      schema: {
        hide: true,
        querystring: z.object({
          apiKeyId: z.string().optional(),
          limit: z.coerce.number().int().positive().max(200).optional(),
        }),
      },
    },
    async (request) => ({
      success: true,
      data: {
        generations: await listGenerations({
          apiKeyId: request.query.apiKeyId,
          limit: request.query.limit,
        }),
        keys: await listApiKeys(),
      },
    }),
  );

  app.get("/admin/api/templates", { schema: { hide: true } }, async () => ({
    success: true,
    data: { templates: await listTemplateSummaries() },
  }));

  app.get(
    "/admin/api/templates/:id",
    {
      schema: {
        hide: true,
        params: z.object({
          id: z.enum(["invoice", "report", "certificate"]),
        }),
      },
    },
    async (request) => ({
      success: true,
      data: await getTemplateForAdmin(request.params.id),
    }),
  );

  app.put(
    "/admin/api/templates/:id",
    {
      schema: {
        hide: true,
        params: z.object({
          id: z.enum(["invoice", "report", "certificate"]),
        }),
        body: templateBody,
      },
    },
    async (request) => ({
      success: true,
      data: await saveTemplate(request.params.id, request.body),
    }),
  );

  app.post(
    "/admin/api/templates/:id/reset",
    {
      schema: {
        hide: true,
        params: z.object({
          id: z.enum(["invoice", "report", "certificate"]),
        }),
      },
    },
    async (request) => ({
      success: true,
      data: await resetTemplate(request.params.id),
    }),
  );

  app.get("/admin/api/settings", { schema: { hide: true } }, async () => {
    const settings = await getSettings();
    return {
      success: true,
      data: {
        defaultMonthlyLimit: settings.defaultMonthlyLimit,
        signedUrlTtlSeconds: settings.signedUrlTtlSeconds,
        updatedAt: settings.updatedAt.toISOString(),
        publicBaseUrl: env.PUBLIC_BASE_URL,
        nodeEnv: env.NODE_ENV,
      },
    };
  });

  app.put(
    "/admin/api/settings",
    { schema: { hide: true, body: settingsBody } },
    async (request) => {
      const settings = await updateSettings(request.body);
      return {
        success: true,
        data: {
          defaultMonthlyLimit: settings.defaultMonthlyLimit,
          signedUrlTtlSeconds: settings.signedUrlTtlSeconds,
          updatedAt: settings.updatedAt.toISOString(),
        },
      };
    },
  );

  app.post(
    "/admin/api/password",
    { schema: { hide: true, body: passwordBody } },
    async (request) => {
      if (!request.admin) throw unauthorized();
      await changeAdminPassword(
        request.admin.id,
        request.body.currentPassword,
        request.body.newPassword,
      );
      return { success: true, data: { updated: true } };
    },
  );
};

export default adminApiRoutes;
