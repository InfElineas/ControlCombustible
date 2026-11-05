# Sacar la base de datos de Supabase — plan

Objetivo: que los datos, los archivos y el tiempo real vivan en el servidor
propio, junto a la web, la pasarela y elineas-auth. Supabase deja de usarse.

Estado al escribir esto: **nada empezado**. La migración de identidad
(`docs/migracion-is/`) movió la autenticación; la base de datos sigue en el
proyecto `okcvyuemcxzxvvyfkjzp` de Supabase.


## 1. Qué se usa hoy de Supabase, de verdad

No es «una base de datos». Son cinco servicios, y el código usa cinco:

| Pieza | Quién la usa | Cómo se reemplaza |
|---|---|---|
| **PostgreSQL** | todo | contenedor `postgres:17` |
| **PostgREST** (`/rest/v1`) | la pasarela, en cada consulta | contenedor `postgrest/postgrest` |
| **Realtime** | la pasarela, una suscripción que reparte por SSE | `LISTEN/NOTIFY` de Postgres |
| **Storage** | adjuntos de movimientos y APK | archivos en disco servidos por nginx |
| **Edge Functions** | `gps-proxy` y el cron `gps-daily-save` | pasan dentro de la pasarela |

**La buena noticia: el frontend no toca ninguna.** Desde la migración de
identidad todo pasa por la pasarela, así que esto se cambia por detrás y la web y
la APK no se enteran. Solo cambia la configuración con la que se construyen.


## 2. Las tres piezas, por dificultad

### 2.1 PostgreSQL + PostgREST — mecánico

La pasarela habla PostgREST (`/rest/v1/...`). PostgREST es software libre y es
exactamente el mismo que corre dentro de Supabase: se levanta al lado de Postgres
y la pasarela no nota la diferencia, solo cambia `SUPABASE_URL`.

Hay que replicar lo que Supabase da hecho:

- Los roles `anon`, `authenticated` y `service_role`, que el esquema usa en cada
  política RLS. Sin ellos, `MIGRACION_GLOBAL.sql` no se aplica.
- El esquema `auth` con `auth.users` y `auth.uid()`, de los que dependen
  `get_my_role()` y las claves foráneas de autoría. **Aquí hay una decisión**:
  ver el punto 4.
- `pg_cron` o un cron del sistema para `gps-daily-save`.

### 2.2 Tiempo real — ya está casi resuelto, y no por casualidad

El frontend **ya no usa Supabase Realtime**: recibe avisos por SSE de la pasarela
([src/lib/tiempoReal.js](src/lib/tiempoReal.js)). Y la pasarela define el origen
de esos avisos como una interfaz:

```ts
// gateway/src/realtime.ts
/** Origen de los avisos. Es una interfaz para poder probar sin Supabase. */
export interface ChangeSource {
  start(onChange: (tabla: string) => void): void
  stop(): void
}
```

Hoy la implementa `supabaseSource`. Migrar es **escribir un `postgresSource`**
que haga `LISTEN cambios` y un disparador `AFTER INSERT OR UPDATE OR DELETE` en
las 19 tablas que haga `pg_notify('cambios', TG_TABLE_NAME)`. El resto —el
agrupado, el reparto por SSE, la reconexión— no se toca.

Es la pieza que parecía más difícil y es la más barata. Conviene hacerla
**antes** del corte: se puede probar contra una copia sin tocar producción.

### 2.3 Storage — lo que más trabajo da

Dos buckets, con comportamientos distintos:

| Bucket | Qué guarda | Cómo se lee hoy |
|---|---|---|
| `movimiento-adjuntos` | facturas y fotos de movimientos | **URL pública directa a Supabase** |
| `apk` | los instaladores publicados | **URL pública directa a Supabase** |

La subida ya pasa por la pasarela, con permiso y límite de tamaño
([gateway/src/storage.ts](gateway/src/storage.ts)). **La descarga no**: las URL
públicas están **guardadas en la base de datos**, columna a columna
(`movimiento.adjunto_url`, `apk_version.archivo_url`), apuntando a
`okcvyuemcxzxvvyfkjzp.supabase.co`.

Eso significa que no basta con copiar los archivos: hay que **reescribir esas
columnas**. Y mientras no se haga, cada adjunto antiguo sigue descargándose de
Supabase, así que no se puede cerrar la cuenta.


## 3. Orden propuesto

Cada paso se puede parar sin dejar nada a medias.

**Paso 0 — medir.** Cuánto pesa la base y cuántos archivos hay en cada bucket.
Decide si el traslado son minutos u horas, y por tanto cuánta ventana hace falta.

**Paso 1 — levantar el stack en el servidor, vacío.** Postgres + PostgREST en el
mismo compose, sin tocar producción. Aplicar `MIGRACION_GLOBAL.sql` sobre la base
vacía y comprobar que entra entera.

**Paso 2 — `postgresSource` + disparador de avisos.** Con sus pruebas, como el
resto de la pasarela. Producción sigue con `supabaseSource`.

**Paso 3 — ensayo completo con datos reales.** `pg_dump` de Supabase, restaurar
en el servidor, apuntar una copia de la pasarela a la base nueva y recorrer la
lista de comprobación. Nada en producción cambia todavía. **De este ensayo sale
el tiempo real del corte.**

**Paso 4 — archivos.** Copiar los dos buckets al servidor, servirlos por nginx y
reescribir las columnas de URL. Se puede hacer antes del corte si se sirven las
dos direcciones a la vez.

**Paso 5 — el corte.** Congelar escrituras, `pg_dump` final, restaurar, cambiar
`SUPABASE_URL` en la pasarela, reconstruir, comprobar.

**Paso 6 — cerrar Supabase.** Solo cuando lleve días funcionando y haya copia de
seguridad propia en marcha.


## 4. La decisión que hay que tomar antes de empezar

**Qué se hace con `auth.users` y `auth.uid()`.**

El esquema está lleno de referencias a la tabla de usuarios de Supabase: las
políticas RLS llaman a `auth.uid()`, `get_my_role()` lee `user_roles`, y tres
columnas de autoría tienen clave foránea a `auth.users`. Pero la identidad ya no
está ahí, está en elineas-auth.

Dos caminos:

1. **Crear un esquema `auth` mínimo** en la base nueva: una tabla `users` con los
   ids de elineas-auth y una función `auth.uid()` que devuelva nulo. El esquema
   se aplica sin tocar nada, y todo sigue funcionando porque la autorización real
   la hace la pasarela. Es el camino rápido y el que menos riesgo tiene.
2. **Limpiar de verdad**: quitar las políticas que dependen de `auth.uid()` y las
   claves foráneas, y dejar que la autorización viva solo en la pasarela. Es lo
   correcto a medio plazo, pero toca todas las tablas y conviene hacerlo con
   calma, no en la misma ventana del traslado.

**Recomiendo el 1 para el corte y el 2 después**, con el sistema ya estable.

Dicho sea de paso: `migrations/2026-11-03_identidad_externa.sql` ya quita esas
tres claves foráneas. Si se ejecuta antes (hay que hacerlo igualmente, porque hoy
bloquea el registro de bonificaciones), este punto queda más despejado.


## 5. Lo que hay que preparar y no es código

- **Copias de seguridad.** Hoy las hace Supabase. En el servidor hay que montar
  `pg_dump` periódico y comprobar que se puede restaurar. Esto no es opcional:
  es lo que hoy se obtiene gratis y se va a perder.
- **Dónde corre.** Si la base queda en el mismo servidor que la web y la pasarela,
  el día que ese servidor falle no hay nada. Supabase daba redundancia.
- **Acceso.** Hoy se administra con el panel. Con Postgres propio hace falta
  decidir cómo se conecta uno: `psql` por túnel, pgAdmin, o lo que sea.


## 6. Lista de comprobación del corte

Lo que hay que probar antes de dar el traslado por bueno:

- [ ] Entrar con cada uno de los cinco roles
- [ ] Registrar un movimiento, editarlo, borrarlo
- [ ] Registrar una bonificación, entregarla y cobrarla
- [ ] Que el económico no vea «Cancelar» y el cajero no vea «Pagado»
- [ ] Subir un adjunto y **abrir uno antiguo**
- [ ] Descargar el APK publicado
- [ ] Abrir dos navegadores y ver que un cambio llega al otro (tiempo real)
- [ ] El mapa de GPS
- [ ] Una exportación a Excel y otra a PDF
- [ ] La aplicación de Android, incluida la cola sin conexión
