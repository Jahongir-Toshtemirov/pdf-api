import type { FastifyReply, FastifyRequest } from "fastify";
import {
  COOKIE_NAME,
  getAdminById,
  verifyAdminToken,
} from "../services/admin-auth.service.js";
import { unauthorized } from "../lib/errors.js";

function extractAdminToken(request: FastifyRequest): string | null {
  const cookieHeader = request.headers.cookie;
  if (cookieHeader) {
    const parts = cookieHeader.split(";").map((p) => p.trim());
    for (const part of parts) {
      const eq = part.indexOf("=");
      if (eq === -1) continue;
      const name = part.slice(0, eq);
      const value = part.slice(eq + 1);
      if (name === COOKIE_NAME && value) {
        return decodeURIComponent(value);
      }
    }
  }

  const auth = request.headers.authorization;
  if (auth?.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    if (token && !token.startsWith("pdf_live_") && !token.startsWith("pdf_test_")) {
      return token;
    }
  }

  return null;
}

export async function requireAdmin(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const token = extractAdminToken(request);
  if (!token) {
    throw unauthorized("Admin authentication required");
  }

  const payload = await verifyAdminToken(token);
  const admin = await getAdminById(payload.id);
  if (!admin) {
    throw unauthorized("Admin account not found");
  }

  request.admin = admin;
}
