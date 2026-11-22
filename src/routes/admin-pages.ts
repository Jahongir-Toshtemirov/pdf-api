import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyPluginAsync } from "fastify";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "..", "admin", "public");

async function sendHtml(reply: { type: (t: string) => unknown; send: (b: string) => unknown }, file: string) {
  const html = await readFile(join(PUBLIC_DIR, file), "utf8");
  void reply.type("text/html; charset=utf-8");
  return reply.send(html);
}

const adminPageRoutes: FastifyPluginAsync = async (app) => {
  app.get("/admin/login", { schema: { hide: true } }, async (_request, reply) =>
    sendHtml(reply, "login.html"),
  );

  app.get("/admin", { schema: { hide: true } }, async (_request, reply) =>
    sendHtml(reply, "app.html"),
  );

  app.get("/admin/", { schema: { hide: true } }, async (_request, reply) =>
    sendHtml(reply, "app.html"),
  );
};

export default adminPageRoutes;
