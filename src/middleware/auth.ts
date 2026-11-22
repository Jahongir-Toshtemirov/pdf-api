import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { verifyApiKey } from "../services/auth.service.js";
import { AppError, unauthorized } from "../lib/errors.js";
import { maskApiKey } from "../utils/hash.js";

const PUBLIC_PATHS = new Set([
  "/health",
  "/v1/health",
  "/docs",
  "/openapi.json",
]);

function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (!scheme || !token) return null;
  if (scheme.toLowerCase() !== "bearer") return null;
  return token.trim();
}

async function authenticate(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const path = request.url.split("?")[0] ?? request.url;

  if (
    PUBLIC_PATHS.has(path) ||
    path.startsWith("/docs") ||
    path.startsWith("/admin") ||
    path.startsWith("/v1/pdf/download/")
  ) {
    return;
  }

  // Only protect /v1/* API routes (admin uses its own session auth)
  if (!path.startsWith("/v1/")) {
    return;
  }

  const token = extractBearerToken(request.headers.authorization);
  if (!token) {
    throw unauthorized(
      "Missing API key. Pass it as: Authorization: Bearer pdf_live_...",
    );
  }

  if (!token.startsWith("pdf_live_") && !token.startsWith("pdf_test_")) {
    throw unauthorized("Invalid API key format");
  }

  request.log.info({ apiKey: maskApiKey(token) }, "Authenticating request");

  const apiKey = await verifyApiKey(token);
  if (!apiKey) {
    throw unauthorized("Invalid API key");
  }
  if (!apiKey.isActive) {
    throw new AppError(403, "FORBIDDEN", "This API key has been deactivated");
  }

  request.apiKey = apiKey;
}

const authPlugin: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", authenticate);
};

export default fp(authPlugin, { name: "auth" });
