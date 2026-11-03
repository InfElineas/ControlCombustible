# syntax=docker/dockerfile:1
# =============================================================================
# Control Combustible — frontend web (React + Vite)
#
#   deps  → dependencias (npm ci)
#   dev   → servidor de Vite con recarga en caliente (ver docker-compose.yml)
#   build → compila a dist/. Las variables VITE_* se INCRUSTAN aquí: no se pueden
#           cambiar después sin reconstruir la imagen.
#   prod  → nginx sin privilegios sirviendo dist/ (ver nginx/default.conf)
#
# La pasarela (combustible-gateway) tiene su propio Dockerfile en gateway/.
# =============================================================================

ARG NODE_VERSION=22-alpine
ARG NGINX_VERSION=1.27-alpine

# ---- deps: cacheado mientras no cambien los manifiestos ----
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# `npm ci` falla si el lockfile no coincide con package.json (no resuelve versiones
# distintas a las probadas).
RUN --mount=type=cache,target=/root/.npm npm ci

# ---- dev: hot reload vía bind mount (ver docker-compose.yml) ----
FROM deps AS dev
ENV NODE_ENV=development
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]

# ---- build ----
FROM deps AS build
# Se copia solo lo que compila: un cambio en docs/, android/ o gateway/ no invalida la caché.
COPY index.html vite.config.js tailwind.config.js postcss.config.js jsconfig.json components.json ./
COPY public ./public
COPY src ./src

# Vite solo expone al código las variables VITE_*. Se pasan como build args
# (docker-compose.prod.yml las lee del entorno / .env).
ARG VITE_API_URL
ARG VITE_AUTH_URL
ARG VITE_SYSTEM_SLUG=combustible
ARG VITE_SUPABASE_URL
ARG VITE_AUTH_ADMIN_URL=
ARG VITE_NATIVE_REDIRECT=
ARG VITE_URL_APK=
ARG VITE_TURNSTILE_SITE_KEY=
ENV VITE_API_URL=$VITE_API_URL \
    VITE_AUTH_URL=$VITE_AUTH_URL \
    VITE_SYSTEM_SLUG=$VITE_SYSTEM_SLUG \
    VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_AUTH_ADMIN_URL=$VITE_AUTH_ADMIN_URL \
    VITE_NATIVE_REDIRECT=$VITE_NATIVE_REDIRECT \
    VITE_URL_APK=$VITE_URL_APK \
    VITE_TURNSTILE_SITE_KEY=$VITE_TURNSTILE_SITE_KEY

# Sin VITE_API_URL ni VITE_AUTH_URL la app compila pero no puede iniciar sesión ni
# pedir datos: mejor romper la construcción que descubrirlo en producción.
RUN test -n "$VITE_API_URL" && test -n "$VITE_AUTH_URL" \
    || (echo "ERROR: VITE_API_URL y VITE_AUTH_URL son obligatorias al construir la imagen de producción" >&2; exit 1)
RUN npm run build

# ---- prod ----
FROM nginxinc/nginx-unprivileged:${NGINX_VERSION} AS prod
ARG APP_VERSION=0.0.0-dev
LABEL org.opencontainers.image.title="control-combustible-web" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.description="Control Combustible — frontend web"
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
# El usuario `nginx` (sin privilegios) y el puerto 8080 vienen de la imagen base.
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/health || exit 1
