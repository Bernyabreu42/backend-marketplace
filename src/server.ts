import prisma from "./database/prisma";
import app from "./app";

// health check opcional
app.get("/healthz", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.send("ok");
  } catch {
    res.status(500).send("db down");
  }
});

const port = Number(process.env.PORT ?? 4000);

async function start() {
  await prisma.$connect(); // abre el pool una vez
  app.listen(port, () => console.log(`API → http://localhost:${port}`));
}

start();

async function shutdown() {
  console.log("Shutting down…");
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
