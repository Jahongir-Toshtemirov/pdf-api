import { env } from "./config/env.js";
import { buildApp } from "./app.js";
import { closeBrowser } from "./lib/playwright.js";
import { prisma } from "./lib/prisma.js";
import { cleanupExpiredArtifacts } from "./services/pdf.service.js";

async function main() {
  const app = await buildApp();

  const cleanupTimer = setInterval(() => {
    void cleanupExpiredArtifacts().catch((err) => {
      app.log.warn({ err }, "Failed to cleanup expired PDF artifacts");
    });
  }, 15 * 60 * 1000);
  cleanupTimer.unref();

  await app.listen({ port: env.PORT, host: env.HOST });

  app.log.info(
    {
      port: env.PORT,
      docs: `${env.PUBLIC_BASE_URL}/docs`,
      health: `${env.PUBLIC_BASE_URL}/health`,
    },
    "PDF API ready",
  );

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "Shutting down");
    clearInterval(cleanupTimer);
    await app.close();
    await closeBrowser();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
  console.error("Failed to start PDF API:", error);
  process.exit(1);
});
