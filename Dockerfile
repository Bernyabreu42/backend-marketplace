# 1. ETAPA DE CONSTRUCCIÓN (Build Stage)
# Usar la imagen LTS actual de Node.js 24-alpine
FROM node:24-alpine AS base

# Establecer el directorio de trabajo
WORKDIR /usr/src/app

# Copiar archivos de definición de dependencias
COPY package.json package-lock.json tsconfig.json ./

# Instalar dependencias de producción
RUN npm install --production

# Copiar el resto del código
COPY . .

# 2. ETAPA DE EJECUCIÓN (Final Stage)
FROM base AS final

# Exponer el puerto
ENV PORT 4000
EXPOSE 4000

# El comando de inicio:
# 1. Ejecuta la migración de la base de datos (db:deploy).
# 2. Si es exitosa (&&), ejecuta la aplicación (npm run start).
# ESTO RESUELVE EL ERROR P1001.
CMD ["/bin/sh", "-c", "npm run db:deploy && npm run start"]