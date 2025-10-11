import app from "./app";
import { env } from "./config/env";
import prisma from "./database/prisma";
import "./modules/orders/order-loyalty-hook";

// health check opcional
app.get("/healthz", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.send("ok");
  } catch {
    res.status(500).send("db down");
  }
});

const port = env.PORT;

async function start() {
  await prisma.$connect();
  app.listen(port, () => console.log(`API running on http://localhost:${port}`));
}

start();

async function shutdown() {
  console.log("Shutting down.");
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
