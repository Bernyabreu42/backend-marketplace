# Imagen oficial de Bun
FROM oven/bun:1 AS base

WORKDIR /usr/src/app

# Copiamos los archivos de definición primero para aprovechar cache
COPY package.json bun.lockb tsconfig.json ./

# Instalamos TODAS las dependencias (incluye dev, prisma CLI, etc.)
RUN bun install --frozen-lockfile

# Copiamos el resto del código
COPY . .

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

# 1) Ejecuta migraciones + seed
# 2) Si todo va bien, arranca la API
CMD ["sh", "-c", "bun run init && bun run start"]
