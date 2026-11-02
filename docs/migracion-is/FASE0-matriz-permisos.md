# Fase 0 — Matriz de autorización y alta en elineas-auth

Estado: **CONFIRMADA con el export de producción del 2026-11-02** (`pg_policies`).
Las discrepancias de §3 están resueltas y las vulnerabilidades que reveló el
export se cierran con `migrations/2026-11-02_cerrar_politicas_abiertas.sql`.
Originalmente reconstruida a partir de `MIGRACION_GLOBAL.sql` y de `migrations/`. Hay contradicciones entre ambos (ver §3), así que antes de dar
la matriz por buena hay que contrastarla con la base real ejecutando
`scripts/fase0/extraer_estado_real.sql` en el SQL Editor de Supabase.

Roles actuales (`user_roles.role`): `superadmin`, `operador`, `cajero`,
`economico`, `auditor`. Estados (`user_roles.status`): `pending`, `active`,
`disabled`.

Leyenda: **S** superadmin · **O** operador · **C** cajero · **E** económico ·
**A** auditor · `R` lectura · `W` escritura (insert+update+delete salvo que se
detalle) · `todos` = cualquier usuario autenticado.

## 1. Matriz por tabla

### Lectura abierta a todos los autenticados, escritura restringida

| Tabla | R | Insert | Update | Delete |
|---|---|---|---|---|
| tipo_consumidor | todos | S | S | S |
| tipo_combustible | todos | S,O | S,O | S,O |
| vehiculo | todos | S,O | S,O | S,O |
| config_alerta | todos | S,O | S,O | S,O |
| ruta | todos | S,O | S,O | S,O |
| ruta_marcador | todos | S,O | S,O | S,O |
| marcador | todos | S,O | S,O | S,O |
| reporte_chat_transporte | todos | S,O | S,O | S,O |
| consumidor | todos | S,O | S,O | S |
| conductor | todos | S,O | S,O | S |
| asignacion_ruta | todos | S,O | S,O | S |
| tarjeta | todos | S,O,E | S,O,E | S,E |
| precio_combustible | todos | S,E | S,E | S,E |
| precio_despacho_tipo | todos | S,E | S,E | S,E |
| concepto_precio | todos | S,E | S,E | S,E |
| cpp_ajuste | todos | S,E | S,E | S,E |
| clase_vehiculo | todos | S,E | S,E | S,E |
| tarifa_transporte | todos | S,E | S,E | S,E |
| beneficiario | todos | S,O,C,E | S,O,C,E | S |
| venta_trabajador | todos | S,O,C,E | S,O,C,E (+ §2.2) | S |
| anomalia_descartada | todos | S,O,E,A | — | S,O,E,A |
| audit_log | todos | todos (§2.3) | — | — |

### Tablas con regla por fila

**`movimiento`** (la única con condición sobre el contenido, `tipo`):

| Op | Regla |
|---|---|
| R | todos |
| Insert | S,O cualquier tipo · C solo `DESPACHO` · E solo `DEPOSITO` |
| Update | S,O,C (sin condición de tipo) |
| Delete | S · O · C solo si `tipo = 'DESPACHO'` (confirmado con el export de producción) |

### Tablas fuera de la regla general

| Tabla / objeto | Regla actual | Nota |
|---|---|---|
| historial_mantenimiento | R todos los autenticados; W S,O (alineada el 2026-11-02, migración `2026-11-02_alinear_rls_historial_mantenimiento.sql`) | Antes era lectura pública y escritura para cualquier autenticado. |
| apk_version | R **anon + autenticados**; W solo S | Se mantiene público (decisión tuya). |
| user_roles | desaparece | Los roles viven en el IS. |
| Vistas `v_stock_tanques`, `v_cpp_por_tanque`, `v_cpp_por_combustible`, `v_vehiculos_transporte` | lectura | Una vista corre con los derechos de su dueño y puede saltarse RLS. Confirmar con el script quién puede leerlas hoy. |

### Storage (Supabase Storage, también autoriza con `get_my_role()`)

| Bucket | Lectura | Subir / actualizar / borrar |
|---|---|---|
| `apk` | pública | S |
| `movimiento-adjuntos` | `getPublicUrl` (público) | S,O,E |

La pasarela tiene que cubrir `/storage/v1` además de `/rest/v1`. Es un punto
que el plan anterior no tenía.

## 2. Lógica de autorización que NO está en las políticas

### 2.1 Resumen
La matriz de arriba es la parte fácil. Hay autorización escondida en
funciones, y con la `service_role` esas comprobaciones **fallan en silencio**.

### 2.2 `validate_venta_update()` usa `get_my_role()` (trigger)
Reglas de separación de funciones, hoy dentro de la base de datos:
- `economico` no puede pasar una bonificación a `CANCELADO` / `ANULADO`.
- `cajero` no puede pasarla a `PAGADO_FINALIZADO` / `PAGADO`.

Con la `service_role`, `auth.uid()` es NULL, `get_my_role()` devuelve NULL, las
dos comprobaciones dan falso y **cualquier rol puede cancelar o cobrar**. No
salta ningún error.

Solución propuesta (defensa en dos capas):
1. La pasarela envía la identidad en cabeceras hacia PostgREST
   (`x-app-user` = `sub` del IS, `x-app-role` = rol resuelto).
2. `get_my_role()` se reescribe para leer
   `current_setting('request.headers', true)::json ->> 'x-app-role'`.
   El trigger queda igual y sigue siendo una barrera que no se rodea por
   la API. Es seguro porque, tras la migración, `anon` y `authenticated` no
   pueden escribir en ninguna tabla.
3. La pasarela además valida el mismo caso en su propia capa.

### 2.3 `audit_log`
Hoy el cliente inserta con `user_id = auth.uid()`. La pasarela pasa a poner
`user_id` ella misma desde el `sub` verificado y rechaza el valor que mande el
cliente. Hace falta saber si `audit_log.user_id` es `uuid` (ver §4).

### 2.4 `get_or_create_user_role()` y el estado `pending`
Hoy un usuario nuevo se autoregistra como `auditor` + `pending` y un
superadmin lo aprueba. Con el IS esto se transforma así:

| Hoy | Con el IS |
|---|---|
| `pending` | usuario existe en el IS pero **sin rol asignado** en el sistema → el login responde 403 (según el README del IS). La pantalla "pendiente" del frontend se alimenta de ese 403 |
| `active` | tiene un rol en el sistema |
| `disabled` | cuenta deshabilitada o sin rol en el IS |
| `user_roles_insert_bootstrap` | desaparece (el autoalta es del IS) |

## 3. Discrepancias del repo (resolver con la base real)

1. **(RESUELTA: S, O y C solo DESPACHO)** **`movimiento` DELETE.** `2026-06-25` crea `movimiento_delete_ops`
   (S,O). `2026-08-12` crea `movimiento_delete_superadmin` (S, y C si DESPACHO).
   `MIGRACION_GLOBAL.sql` solo hace `DROP` de la segunda. Si la base tiene las
   dos políticas (las políticas se suman con OR), el efecto real es
   **S,O + C(DESPACHO)**; si no, es lo que diga el global. Solo el script lo
   aclara.
2. **(RESUELTA: DEPOSITO)** **`movimiento` INSERT para económico.** `2026-06-17` le daba `DESPACHO`;
   `2026-08-12` y el global le dan `DEPOSITO`. La matriz usa lo último (`DEPOSITO`),
   lo cual es consistente con el frontend, pero hay que confirmarlo.
3. **`historial_mantenimiento`** (RESUELTA: alineada a S,O) dependía solo de
   `auth.uid() IS NOT NULL` y con SELECT público: puede ser intencional o no.
4. `MIGRACION_GLOBAL.sql` y `migrations/` deberían coincidir según CLAUDE.md,
   y no lo hacen. Tras la migración conviene regenerar ambos desde la base real.

## 4. Catálogo de permisos propuesto para el IS

Convención del IS: `resource:action`. Para no tener 80 permisos, se agrupan
las tablas por quién las gestiona:

| Permiso | Qué cubre | Roles |
|---|---|---|
| `catalogos:read` | lectura de todas las tablas y vistas (todas son abiertas) | S,O,C,E,A |
| `catalogos:write` | tipo_combustible, vehiculo, config_alerta, ruta, ruta_marcador, marcador, reporte_chat_transporte, consumidor, conductor, asignacion_ruta (insert/update) | S,O |
| `catalogos:delete` | delete de consumidor, conductor, asignacion_ruta | S |
| `catalogos:admin` | tipo_consumidor (todo) | S |
| `finanzas:write` | precio_combustible, precio_despacho_tipo, concepto_precio, cpp_ajuste, clase_vehiculo, tarifa_transporte | S,E |
| `tarjeta:write` | tarjeta insert/update | S,O,E |
| `tarjeta:delete` | tarjeta delete | S,E |
| `movimiento:create` | S,O cualquier tipo | S,O |
| `movimiento:create_despacho` | | C |
| `movimiento:create_deposito` | | E |
| `movimiento:update` | | S,O,C |
| `movimiento:delete` | | S (+ O según §3.1) |
| `movimiento:delete_despacho` | | C |
| `bonificacion:write` | beneficiario y venta_trabajador insert/update | S,O,C,E |
| `bonificacion:delete` | | S |
| `bonificacion:cancelar` | pasar a CANCELADO/ANULADO | S,O,C |
| `bonificacion:cobrar` | pasar a PAGADO / PAGADO_FINALIZADO | S,O,E |
| `anomalia:write` | anomalia_descartada insert/delete | S,O,E,A |
| `adjunto:write` | bucket movimiento-adjuntos | S,O,E |
| `apk:write` | apk_version + bucket apk | S |
| `mantenimiento:write` | historial_mantenimiento insert/update/delete | S,O |
| `usuarios:admin` | pantalla AdminPanel (hoy `superadmin`) | S |

Nota: `bonificacion:cancelar` y `bonificacion:cobrar` salen de los dos casos del
trigger de §2.2. Para `operador` el trigger no restringe nada, por eso se le
dan los dos.

El rol `admin` de cada sistema en el IS actúa como comodín local. Mapear
`superadmin` → `admin` te ahorra asignarle permisos uno a uno.

## 5. Qué crear en elineas-auth (lo creas tú)

1. **Sistema**: nombre "Control Combustible", slug `combustible`.
2. **CORS** (`ALLOWED_ORIGIN`): dominio de producción del front, `http://localhost:5173`
   y los orígenes del WebView de Capacitor (ver `capacitor.config.json`; típicamente
   `https://localhost` o `http://localhost` en Android).
3. **Roles del sistema**: `admin` (= superadmin), `operador`, `cajero`,
   `economico`, `auditor`.
4. **Permisos** de §4 y su asignación a roles.
5. **Usuarios**: crear los existentes con `scripts/fase0/extraer_estado_real.sql`
   (consulta 8). Las contraseñas **no se pueden migrar** (hashes de Supabase vs
   better-auth): cada usuario hace "olvidé mi contraseña" o se le fija una temporal.
   Los usuarios de Google se enlazan por correo.
6. Decidir con quien administra el IS el login de Google para este sistema
   (cómo lo hacen los otros sistemas, README del IS §5.3).

## 6. Requisitos que salen de tus respuestas y afectan a fases posteriores

- **Captura offline imprescindible**: el JWT del IS dura poco. La cola de
  escritura (`colaEscritura.js`) no puede depender de un token válido en el
  momento de encolar; debe reenviar al volver la red con un token renovado, y la
  app necesita una credencial de refresco guardada de forma segura en el
  dispositivo (no en `localStorage`) para obtener ese token sin teclear la
  contraseña. Es lo más delicado de la Fase 3: conviene un spike corto antes de
  construirla, probando `GET /api/auth/token` con el token de sesión (bearer) del IS.
- **`anon` público** (`apk_version`, bucket `apk`): la pasarela tiene que
  dejar pasar sin token esas rutas concretas. El resto, denegado por defecto.
- **Google en móvil**: flujo por redirect contra el IS; `authNativa.js` se
  reescribe siguiendo cómo lo hacen los otros sistemas.

## 7. Siguiente paso

1. Ejecutar `scripts/fase0/extraer_estado_real.sql` y pasarme los resultados de
   las consultas 1, 2, 3, 4 y 6.
2. Con eso congelo esta matriz como definitiva y arranco la Fase 1 (pasarela).
3. En paralelo, tú puedes ir creando el sistema, roles y permisos en el IS
   (§4 y §5); la lista de permisos no cambiará salvo por §3.
