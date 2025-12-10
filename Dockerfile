# 1. ETAPA DE CONSTRUCCIÓN (Para instalar dependencias y compilar)
# Usar una imagen base de Bun para compatibilidad
FROM oven/bun:latest AS base

# Establecer el directorio de trabajo
WORKDIR /usr/src/app

# Copiar archivos de definición de dependencias
COPY package.json package-lock.json tsconfig.json ./

# Instalar dependencias usando Bun
RUN bun install --production

# Copiar el código fuente (src, scripts, prisma, etc.)
COPY . .

# 2. ETAPA DE EJECUCIÓN (Usar la misma base o una más ligera si es posible, aunque bun:latest es ligera)
FROM base AS final

# Exponer el puerto que tu `server.ts` utiliza (env.PORT)
# Asumo que env.PORT es 3000, si es otro, cámbialo aquí.
ENV PORT 4000
EXPOSE 4000

# Ejecutar las migraciones de Prisma antes de iniciar la aplicación
# Usas el comando 'db:deploy' que es adecuado para entornos de producción
RUN bun run db:deploy

# El comando de inicio que se define en tu package.json
# "start": "bun run src/server.ts"
CMD [ "bun", "run", "src/server.ts" ]