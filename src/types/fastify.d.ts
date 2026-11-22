import type { AdminUser, ApiKey } from "@prisma/client";

declare module "fastify" {
  interface FastifyRequest {
    requestId: string;
    apiKey?: ApiKey;
    admin?: AdminUser;
  }
}
