import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.$connect();
  console.log("📡 Conexión exitosa a PostgreSQL");
  await prisma.$disconnect();
}

main();
