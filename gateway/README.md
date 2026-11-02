# combustible-gateway

Pasarela entre el frontend de ControlCombustible y Supabase. Sustituye a Supabase
Auth + RLS en **autenticación y autorización**; Supabase se queda como base de
datos (tablas, vistas, triggers, Edge Functions).

```
React ──Bearer JWT (elineas-auth)──► gateway ──service_role──► Supabase PostgREST
                                        │
                                        ├─ verifica el JWT en local (JWKS, EdDSA)
                                        └─ pregunta permisos a elineas-auth (cache 30 s)
```

## Qué hace
- `GET /health`, `GET /me` (roles y permisos del usuario).
- `ANY /rest/v1/:tabla` — proxy de PostgREST. Verifica el JWT, resuelve los
  permisos en el IS, decide con `src/rules.ts` y reenvía con la `service_role`.
  El navegador deja de tener acceso directo a Supabase.
- Todo lo demás (`rpc/*`, `auth/v1`, `storage`, esquema OpenAPI) → 404.

## Garantías (cubiertas por `bun test`)
- Solo EdDSA; `exp` y `sub` obligatorios; `none`/HS256/RS256 rechazados.
- Un `kid` desconocido no fuerza descargas del JWKS por petición.
- Lista blanca de tablas; lo no listado se deniega (incluye `user_roles` y los RPC).
- Embebidos (`select=*,otra(*)`) exigen poder leer la tabla anidada.
- PATCH/DELETE sin filtro → 400. Un upsert exige además permiso de update.
- Cuerpo de `movimiento` revisado por tipo; el cajero solo borra `DESPACHO`
  (la pasarela añade `tipo=eq.DESPACHO` al filtro).
- Cancelar / cobrar una bonificación son permisos distintos (antes, un trigger).
- `audit_log`: la pasarela fija `user_id`, `user_email` y `user_name`.
- Si el IS no responde: se sirven permisos ya conocidos durante `PERMISSION_STALE_S`
  y después 502. Nunca se concede ni se quita acceso por un fallo.
- Sin ningún permiso en el sistema → 403 `NO_ACCESS` (equivale al antiguo `pending`/`disabled`).
- La credencial de servicio y el token del usuario nunca se mezclan; las
  cabeceras `x-app-*`, `Accept-Profile` y `Content-Profile` del cliente se descartan.

## Poner en marcha
```bash
bun install
cp .env.example .env        # AUTH_BASE_URL, SUPABASE_*, ALLOWED_ORIGIN
bun run permisos            # qué dar de alta en elineas-auth
bun test && bun run typecheck
bun run dev
```

## Operación
```bash
bun run aprovisionar              # plan: qué falta en elineas-auth (no escribe)
bun run aprovisionar --aplicar    # crea sistema, roles y permisos
bun run test:integracion          # prueba contra un IS real (ver docs/migracion-is/ESTADO-Y-CORTE.md)
# Docker: el compose está en la RAÍZ del repositorio (levanta web y pasarela):
#   docker compose up -d --build                              (desarrollo)
#   docker compose -f docker-compose.prod.yml up -d --build    (producción)
```

## Pendiente
Ver `docs/migracion-is/ESTADO-Y-CORTE.md`.
