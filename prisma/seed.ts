import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import { RolesEnum, UserStatusEnum } from "../src/core/enums";
const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL || "";
  const pwd = process.env.SEED_ADMIN_PASSWORD || "";
  const hash = await bcrypt.hash(pwd, 12);

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      firstName: "Berny Willy",
      lastName: "Abreu Bautista",
      phone: "8294602725",
      username: "Berny Abreu",
      email: email.trim().toLowerCase(),
      password: hash,
      role: RolesEnum.ADMIN,
      status: UserStatusEnum.ACTIVE,
      emailVerified: true,
    },
  });

  console.log(`Seed listo: ${email}`);
}
main().finally(() => prisma.$disconnect());
