import { PrismaClient } from "@prisma/client";

import { env } from "../config/env";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  return new PrismaClient({ log: ["warn", "error"] });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (!env.isProd) {
  globalForPrisma.prisma = prisma;
}

export default prisma;
