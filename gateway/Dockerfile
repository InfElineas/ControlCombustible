# =============================================================================
# combustible-gateway — base Bun, puerto 3010
#
#   deps       → todas las dependencias (con devDependencies, para comprobar)
#   dev        → bun --watch con recarga en caliente (ver ../docker-compose.yml)
#   build      → tipos + pruebas: si fallan, la imagen no se construye
#   prod-deps  → solo dependencias de producción
#   final      → imagen mínima, sin pruebas ni herramientas
#
# No se compila a binario: Bun ejecuta TypeScript directamente, así los stack
# traces apuntan al fichero real.
# =============================================================================

FROM oven/bun:1.4-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM deps AS dev
WORKDIR /app
ENV NODE_ENV=development
COPY tsconfig.json ./
COPY src ./src
COPY test ./test
EXPOSE 3010
CMD ["bun", "--watch", "src/index.ts"]

FROM deps AS build
WORKDIR /app
COPY tsconfig.json ./
COPY src ./src
COPY test ./test
# Un error de tipos o una prueba rota debe romper la construcción de la imagen,
# no el arranque del servicio. Las pruebas no necesitan red ni base de datos.
RUN bun run typecheck && bun test && touch /app/.comprobaciones-ok

FROM oven/bun:1.4-alpine AS prod-deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.4-alpine AS final
WORKDIR /app

# `curl` para el HEALTHCHECK; `tini` como PID 1 para que SIGTERM llegue a Bun.
RUN apk add --no-cache curl tini

ARG APP_VERSION=0.0.0-dev
LABEL org.opencontainers.image.title="combustible-gateway" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.description="Pasarela de ControlCombustible: elineas-auth + Supabase"

ENV NODE_ENV=production PORT=3010 TZ=UTC

COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src
# Dependencia explícita de la etapa `build`: sin ella BuildKit se salta los tipos y
# las pruebas, porque nada de la imagen final procede de esa etapa.
COPY --from=build /app/.comprobaciones-ok ./.comprobaciones-ok

USER bun
EXPOSE 3010

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3010/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["bun", "run", "src/index.ts"]
