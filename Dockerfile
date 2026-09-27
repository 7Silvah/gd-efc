# ---- dependencias (con herramientas de compilación por si better-sqlite3
#      necesita compilarse en lugar de usar su binario precompilado) ----
FROM node:24-alpine AS deps
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- runtime ----
FROM node:24-alpine
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server ./server
COPY shared ./shared
COPY public ./public

ENV NODE_ENV=production \
    PORT=3000 \
    CACHE_DB=/data/cache.db

VOLUME /data
EXPOSE 3000
CMD ["node", "server/index.js"]
