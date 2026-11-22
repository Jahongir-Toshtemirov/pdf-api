import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import type { AdminUser } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { env } from "../config/env.js";
import { unauthorized } from "../lib/errors.js";

const COOKIE_NAME = "pdf_admin_session";
const TOKEN_TTL = "12h";

function jwtSecret(): Uint8Array {
  const secret = env.ADMIN_JWT_SECRET ?? env.URL_SIGNING_SECRET;
  return new TextEncoder().encode(secret);
}

export function getAdminCookieName(): string {
  return COOKIE_NAME;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export async function createAdminToken(admin: AdminUser): Promise<string> {
  return new SignJWT({
    sub: admin.id,
    email: admin.email,
    role: "admin",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(jwtSecret());
}

export async function verifyAdminToken(
  token: string,
): Promise<{ id: string; email: string }> {
  try {
    const { payload } = await jwtVerify(token, jwtSecret());
    if (
      typeof payload.sub !== "string" ||
      typeof payload.email !== "string" ||
      payload.role !== "admin"
    ) {
      throw unauthorized("Invalid admin session");
    }
    return { id: payload.sub, email: payload.email };
  } catch {
    throw unauthorized("Invalid or expired admin session");
  }
}

export async function loginAdmin(
  email: string,
  password: string,
): Promise<{ admin: AdminUser; token: string }> {
  const admin = await prisma.adminUser.findUnique({
    where: { email: email.toLowerCase().trim() },
  });

  if (!admin) {
    throw unauthorized("Invalid email or password");
  }

  const valid = await verifyPassword(password, admin.passwordHash);
  if (!valid) {
    throw unauthorized("Invalid email or password");
  }

  const token = await createAdminToken(admin);
  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { lastLoginAt: new Date() },
  });

  return { admin, token };
}

export async function getAdminById(id: string): Promise<AdminUser | null> {
  return prisma.adminUser.findUnique({ where: { id } });
}

export async function changeAdminPassword(
  adminId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const admin = await prisma.adminUser.findUniqueOrThrow({
    where: { id: adminId },
  });

  const valid = await verifyPassword(currentPassword, admin.passwordHash);
  if (!valid) {
    throw unauthorized("Current password is incorrect");
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.adminUser.update({
    where: { id: adminId },
    data: { passwordHash },
  });
}

export { COOKIE_NAME };
