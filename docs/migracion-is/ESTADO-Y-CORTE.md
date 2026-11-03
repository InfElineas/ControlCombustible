# Migración a elineas-auth — estado y plan de corte

Objetivo: la autenticación y la autorización pasan a `elineas-auth`. Supabase se
queda como base de datos (tablas, vistas, triggers, Realtime, Storage, Edge
Functions).

```
React ──JWT de elineas-auth──► combustible-gateway ──service_role──► Supabase
   │                              │ verifica el JWT (JWKS, EdDSA) y pide permisos al IS
   └── login / renovar token ──► elineas-auth
```

## Hecho (todo con pruebas; nada desplegado ni commiteado)

| Pieza | Dónde | Pruebas |
|---|---|---|
| Cierre de 4 vulnerabilidades de RLS (autopromoción de rol, escritura abierta, auditoría falsificable, subida anónima) | `migrations/2026-11-02_cerrar_politicas_abiertas.sql` | — (SQL; comprobaciones al final del archivo) |
| Alinear `historial_mantenimiento` | `migrations/2026-11-02_alinear_rls_historial_mantenimiento.sql` | — |
| BD preparada para identidad externa (`app_can`, trigger de bonificaciones, FK a `auth.users`) | `migrations/2026-11-03_identidad_externa.sql` | Probada en Postgres 17 (26 casos) |
| Remapeo de ids de usuario Supabase → IS | `scripts/migracion-is/remapear_usuarios.sql` | Probada (idempotente) |
| Cierre del acceso directo (post-corte) | `scripts/migracion-is/post_corte_cerrar_acceso_directo.sql` | Probada (idempotente) |
| Pasarela: JWT, permisos, proxy REST, Storage, GPS, SSE, rate limiting, Docker | `gateway/` | 165 pruebas + imagen construida y arrancada |
| **Integración contra un elineas-auth REAL** (aprovisionamiento, login, renovación, permisos por rol, pasarela, revocación, cierre de sesión) | `gateway/integracion/` | 14 pruebas, repetidas 2 veces |
| Aprovisionamiento del IS (sistema, 5 roles, 22 permisos) | `gateway/integracion/aprovisionar.ts` | Verificado contra el IS real; idempotente |
| Cliente del IS (sesión, renovación, Google PKCE, modo sin red) | `src/api/authClient.js` | 23 pruebas |
| Frontend: login, contexto, roles, auditoría, GPS, tiempo real, cambio de clave, errores de red | `src/` | 12 pruebas (SSE y errores) + build |
| Android App Link para Google | `android/`, `ANDROID-APP-LINK.md` | — (necesita dominio y firma) |
| Edge Functions `gps-*`: solo aceptan la service key | `supabase/functions/` | sintaxis |

## Antes del corte (se puede hacer ya, es compatible con la app actual)
1. Ejecutar en Supabase, en este orden:
   `2026-11-02_cerrar_politicas_abiertas.sql` → `2026-11-02_alinear_rls_historial_mantenimiento.sql` → `2026-11-03_identidad_externa.sql`.
2. En elineas-auth: crear el sistema `combustible`, los 5 roles y los permisos
   (`cd gateway && bun run permisos` lista qué dar de alta). `ALLOWED_ORIGIN` con el
   origen web y los del WebView; `GOOGLE_REDIRECT_ORIGINS` con el origen https de la app.
3. Crear las 22 cuentas activas en el IS con su rol. Las 7 deshabilitadas/pendiente
   se crean **sin rol**.
3b. **Aprovisionar el IS con un comando:** `cd gateway && IS_URL=… IS_ADMIN_EMAIL=… IS_ADMIN_PASSWORD=… IS_SERVICE_KEY=… bun run aprovisionar`
    (muestra el plan) y `… bun run aprovisionar --aplicar` (crea sistema, roles y permisos que falten).
4. Desplegar web y pasarela desde la raíz: `cp .env.example .env` (rellenar) y
   `docker compose -f docker-compose.prod.yml up -d --build`. La construcción de la pasarela ejecuta tipos y
   pruebas y falla si hay una rota; la de la web falla si faltan `VITE_API_URL`/`VITE_AUTH_URL`. Detrás de un
   proxy con TLS que fije `X-Forwarded-For`. Para desarrollo: `docker compose up -d --build`.

## Lo que la prueba contra el IS real confirmó (y lo que descubrió)
Confirmado: `sign-in` devuelve `user` + `token` (EdDSA, 5 min) + cabecera `set-auth-token`;
`/api/auth/token` exige el **token de sesión** (no el JWT); `/permissions/me` y `/user-roles/me`
**aceptan el JWT**; los permisos de cada rol coinciden exactamente con `catalogo.ts` (el `admin`
recibe el catálogo completo, también el de otros sistemas); un usuario sin rol no puede iniciar
sesión; quitar el rol corta el acceso; cerrar sesión invalida el token de sesión en el servidor.

Descubierto, **a resolver en elineas-auth** (no en este repo):
1. **`jwks` sin `alg`/`crv`.** El repo del IS ya está en better-auth 1.7.2 (el commit `781ae96`
   añadió `account.issuer` por eso), pero `auth-schema.ts` y `init_consolidated.sql` no tienen
   las columnas `alg` y `crv` de la tabla `jwks`. Sobre una base nueva el `sign-in` responde
   **500** («The field "alg" does not exist in the "jwks" Drizzle schema»); en una con clave ya
   creada fallará en la primera rotación. Hay que añadir ambas columnas (`text`, nulas) al
   esquema y generar la migración.
2. **Límites por IP del IS:** `sign-in` 10/min, `/api/auth/token` 60/min, `google/exchange`
   10/min. Una oficina entera tras una misma IP pública se bloquearía a las 8:00 si el IS no
   está detrás de un proxy con `TRUST_PROXY_HOPS≥1` que le pase la IP real.
3. Las altas sin contraseña crean una aleatoria y envían un enlace para que el dueño fije la
   suya: ese es el flujo previsto para las 22 cuentas (necesita correo configurado en el IS).

## Captcha y clave de servicio del IS (commits `d40437a`, `3070cc2` de elineas-auth)
`POST /api/auth/sign-in` exige captcha Turnstile (`TURNSTILE_SECRET_KEY` obligatoria en producción).
Dos vías, según quién llama:
- **Navegador / APK** → widget Turnstile (`src/components/ui-helpers/Turnstile.jsx`), token en
  `X-Turnstile-Token`. Se activa con `VITE_TURNSTILE_SITE_KEY` (clave pública). Sin ella el login
  no manda token y el IS responderá `403 CAPTCHA_FAILED`. El IS debe tener nuestro dominio en el
  widget; en la APK (WebView `https://localhost`) también.
- **Backends, scripts y pruebas** → clave de servicio del sistema (`elsk_…`) en `X-Service-Key` con
  `systemSlug`; sustituye al captcha. Se genera en el panel del IS (ficha del sistema) y se ve una
  sola vez. `IS_SERVICE_KEY` (sistema `auth`) para `bun run aprovisionar`; además
  `IS_COMBUSTIBLE_SERVICE_KEY` para `test:integracion`.
- **La clave de servicio NUNCA va al navegador, a `VITE_*` ni al repo.** Cualquier `VITE_*` queda en
  claro en el bundle. La pasarela no inicia sesión de usuarios, así que no la necesita.
- Rotarla invalida la anterior; revocarla corta a los scripts que la usen.
- `google/exchange` y `/api/auth/token` no pasan por el captcha.

## Cómo reproducir la prueba de integración
```bash
cd gateway
IS_URL=http://127.0.0.1:8098 IS_ADMIN_EMAIL=admin@... IS_ADMIN_PASSWORD='...' \
  IS_SERVICE_KEY=elsk_... IS_COMBUSTIBLE_SERVICE_KEY=elsk_... bun run test:integracion
```
Crea y borra usuarios de prueba: úsala solo contra un IS de pruebas. Con límites por IP,
el IS de pruebas debe arrancar con `TRUST_PROXY_HOPS=1`.

## Pendiente (lo que ya no es código)
- **Google desde el navegador — resuelto en el código del IS.** El CORS del IS cubre todo
  `/api/*` con credenciales y expone `Set-Auth-Token`, así que el canje desde el SPA con PKCE
  funciona **siempre que nuestros orígenes estén en `ALLOWED_ORIGIN`** (web, `https://localhost`
  del WebView) y en `GOOGLE_REDIRECT_ORIGINS`. Confirmarlo con una prueba real.
- **App Android (Google):** código listo; faltan el dominio, la huella de firma y publicar
  `assetlinks.json`. Pasos en `ANDROID-APP-LINK.md`. Sin ello, en la app solo funciona el correo.
- **Probar en dispositivo la captura sin red.** La clasificación de errores está probada
  (`src/lib/errorRed.test.js`), pero el reenvío real de la cola con un token renovado no.
- **Token de sesión en el dispositivo:** vive en `localStorage` (como el token de refresco de
  Supabase) para poder trabajar sin red. Para más protección en Android, moverlo a almacenamiento
  seguro nativo.
- **Revocación:** un permiso retirado en el IS tarda hasta `PERMISSION_TTL_S` (30 s) y el JWT
  hasta 5 min. Si el IS cae, se siguen usando permisos conocidos `PERMISSION_STALE_S` (5 min).
- **Varias réplicas de la pasarela:** el rate limiting y la caché de permisos son por proceso.
  Con una sola réplica no hay problema.
- La pestaña «Roles y permisos» de `AdminPanel` sigue siendo una tabla estática.

## Ventana de corte
1. Congelar escrituras (aviso a los usuarios).
2. Crear en el IS las cuentas que falten; exportar `SELECT email, id FROM "user"`.
3. `scripts/migracion-is/remapear_usuarios.sql` (pasos A–D).
4. Publicar frontend y APK nuevos (`VITE_API_URL`, `VITE_AUTH_URL`…).
5. Comprobar: login, un movimiento por rol, bonificación (cancelar/cobrar), adjunto, GPS, tiempo real.
6. Tras forzar la actualización de las APK antiguas (`apk_version`):
   `scripts/migracion-is/post_corte_cerrar_acceso_directo.sql`.
7. Supabase → Authentication: desactivar el registro y los proveedores.
8. Desplegar las Edge Functions (`gps-proxy`, `gps-daily-save`) con la nueva comprobación.

## Vuelta atrás
Hasta el paso 6 basta con volver al frontend anterior: la BD sigue siendo compatible
(`app_can` mantiene la rama por `user_roles`). Después del paso 6, ver el final de
`post_corte_cerrar_acceso_directo.sql`.
