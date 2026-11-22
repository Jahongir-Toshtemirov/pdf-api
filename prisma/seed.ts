import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

function generateApiKey(): { rawKey: string; prefix: string; hash: string } {
  const secret = randomBytes(24).toString("base64url");
  const rawKey = `pdf_live_${secret}`;
  const prefix = rawKey.slice(0, 16);
  return { rawKey, prefix, hash: hashApiKey(rawKey) };
}

async function seedAdmin() {
  const email = (process.env.ADMIN_EMAIL ?? "admin@pdfapi.local")
    .toLowerCase()
    .trim();
  const password = process.env.ADMIN_PASSWORD ?? "changeme123!";
  const passwordHash = await bcrypt.hash(password, 12);

  // Solo-founder mode: keep a single admin synced from .env
  const existingByEmail = await prisma.adminUser.findUnique({ where: { email } });
  if (existingByEmail) {
    await prisma.adminUser.update({
      where: { id: existingByEmail.id },
      data: { passwordHash, name: "Admin" },
    });
    console.log(`Admin synced from .env: ${email}`);
    return { email, password, created: false, synced: true };
  }

  const anyAdmin = await prisma.adminUser.findFirst({ orderBy: { createdAt: "asc" } });
  if (anyAdmin) {
    await prisma.adminUser.update({
      where: { id: anyAdmin.id },
      data: { email, passwordHash, name: "Admin" },
    });
    console.log(`Admin updated to ${email} (was ${anyAdmin.email})`);
    return { email, password, created: false, synced: true };
  }

  await prisma.adminUser.create({
    data: {
      email,
      passwordHash,
      name: "Admin",
    },
  });

  return { email, password, created: true, synced: false };
}

async function seedSettings() {
  const existing = await prisma.appSettings.findUnique({ where: { id: 1 } });
  if (existing) return;

  await prisma.appSettings.create({
    data: {
      id: 1,
      defaultMonthlyLimit: Number(process.env.FREE_TIER_LIMIT ?? 100),
      signedUrlTtlSeconds: Number(process.env.SIGNED_URL_TTL_SECONDS ?? 3600),
    },
  });
}

async function seedApiKey() {
  const existing = await prisma.apiKey.findFirst({
    where: { name: "Development Key" },
  });

  if (existing) {
    console.log("Development API key already exists.");
    console.log(`  Prefix: ${existing.keyPrefix}...`);
    return null;
  }

  const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
  const { rawKey, prefix, hash } = generateApiKey();

  await prisma.apiKey.create({
    data: {
      name: "Development Key",
      keyPrefix: prefix,
      keyHash: hash,
      monthlyLimit: settings?.defaultMonthlyLimit ?? 100,
      isActive: true,
    },
  });

  return rawKey;
}

async function main() {
  await seedSettings();
  const admin = await seedAdmin();
  const apiKey = await seedApiKey();

  console.log("");
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║              PDF API — Seed Complete                     ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log("");

  console.log("  Admin login");
  console.log(`    URL:      http://localhost:3000/admin/login`);
  console.log(`    Email:    ${admin.email}`);
  if (admin.password) {
    console.log(`    Password: ${admin.password}`);
  }
  if (admin.synced) {
    console.log("    (synced from ADMIN_EMAIL / ADMIN_PASSWORD in .env)");
  }
  console.log("");

  if (apiKey) {
    console.log("  Development API key (shown once):");
    console.log(`    ${apiKey}`);
    console.log("");
  }
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
