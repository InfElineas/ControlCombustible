# Documentación Técnica — WebCombustible

> **Versión**: Mayo 2026  
> **Público objetivo**: Desarrolladores que necesiten entender, mantener o extender este proyecto sin haber participado en su creación original.

---

## Tabla de contenidos

1. [Visión general del proyecto](#1-visión-general-del-proyecto)
2. [Arquitectura técnica](#2-arquitectura-técnica)
3. [Estructura de carpetas](#3-estructura-de-carpetas)
4. [Base de datos — Esquema completo](#4-base-de-datos--esquema-completo)
5. [Sistema de roles y permisos](#5-sistema-de-roles-y-permisos)
6. [Clientes API y servicios externos](#6-clientes-api-y-servicios-externos)
7. [Edge Functions (Supabase/Deno)](#7-edge-functions-supabasedeno)
8. [Módulos de la aplicación](#8-módulos-de-la-aplicación)
9. [Cómo implementar un nuevo módulo](#9-cómo-implementar-un-nuevo-módulo)
10. [Guía de desarrollo y deploy](#10-guía-de-desarrollo-y-deploy)
11. [Convenciones de código](#11-convenciones-de-código)

---

## 1. Visión general del proyecto

**WebCombustible** es un sistema web de gestión y auditoría de combustible para flotas de vehículos y equipos. Permite:

- Registrar y auditar cada carga (`COMPRA`), despacho interno (`DESPACHO`), ajuste y depósito de combustible.
- Controlar el saldo en litros de cada vehículo, tanque de reserva y equipo.
- Gestionar tarjetas de crédito/combustible con seguimiento de saldo por moneda.
- Programar rutas diarias, registrar km reales recorridos y calcular eficiencia de consumo (km/L).
- Integrar datos GPS desde Traccar para comparar km GPS vs km registrados manualmente.
- Generar alertas automáticas cuando el consumo supera umbrales configurados.
- Exportar reportes en Excel y PDF.
- Auditar cada acción de usuario (CREATE/UPDATE/DELETE) con registro completo del estado previo y posterior.

El sistema opera en **zona horaria Cuba (UTC−5)** y está diseñado para entornos con conectividad limitada (todas las operaciones son asíncronas con caché local de 5 minutos).

---

## 2. Arquitectura técnica

### Stack completo

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Frontend framework | React | 18.2 |
| Build tool | Vite | 6.1 |
| CSS | Tailwind CSS | 3.4 |
| Componentes UI | Radix UI + shadcn/ui | — |
| Iconos | Lucide React | 0.475 |
| State / cache | TanStack Query (React Query) | v5 |
| Backend / Auth | Supabase (PostgreSQL + Auth) | 2.104 |
| Edge Functions | Deno (TypeScript) | — |
| Formularios | React Hook Form + Zod | 7.54 / 3.24 |
| Mapas | React Leaflet | 4.2 |
| Routing geográfico | OSRM (servicio externo público) | — |
| GPS | Traccar (servidor privado) vía proxy | — |
| Exportación | ExcelJS + jsPDF + html2canvas | — |
| Animaciones | Framer Motion | 11 |
| Deploy | Apache + `.htaccess` (SPA rewrite) | — |

### Flujo de datos

```
Navegador (React SPA)
  │
  ├── TanStack Query (caché local, staleTime: 5 min)
  │     │
  │     ├── supabaseClient.js → Supabase REST API (PostgREST) → PostgreSQL
  │     │
  │     └── gpsClient.js → Edge Function gps-proxy → Traccar API
  │
  ├── base44Client.js → Supabase + audit_log automático
  │
  └── routingClient.js → OSRM público (router.project-osrm.org)

Edge Functions (Deno, servidor Supabase):
  ├── gps-proxy     → autentica usuario Supabase, proxea llamadas a Traccar
  └── gps-daily-save → guardado automático vía pg_cron a las 23:55 hora Cuba
```

### Decisiones de arquitectura clave

**¿Por qué `consumidor` y no `vehiculo`?**  
La tabla `vehiculo` existe como catálogo técnico (datos estáticos: marca, modelo, matrícula). La tabla `consumidor` es la entidad transaccional: agrupa vehículos, tanques de reserva y equipos bajo un mismo modelo. Todos los movimientos de combustible apuntan a `consumidor`, no a `vehiculo`. Esto permite gestionar con un único modelo tanto un camión como un tanque de reserva o un generador.

**¿Por qué `fecha` en `movimiento` es `TEXT` y no `DATE`?**  
Compatibilidad con datos históricos importados. El frontend siempre envía formato `YYYY-MM-DD`. Los filtros usan comparación léxica (funciona correctamente para ese formato).

**¿Por qué campos desnormalizados (p.ej. `consumidor_nombre`, `combustible_nombre`)?**  
Para que los registros históricos sean legibles incluso si el nombre cambia en el catálogo. No implica inconsistencia porque se muestran en contexto de auditoría, no en lógica de cálculo (que siempre usa IDs).

**¿Por qué TanStack Query y no Context/Redux?**  
Todas las operaciones son async sobre Supabase. TanStack Query maneja loading/error/stale states, caché automática y re-fetching sin boilerplate. El `staleTime: 5 * 60_000` equilibra frescura de datos con llamadas a la API.

---

## 3. Estructura de carpetas

```
WebCombustible/
├── public/
│   └── .htaccess              ← rewrite SPA + cabeceras de seguridad (copiado a dist/)
├── src/
│   ├── api/
│   │   ├── supabaseClient.js  ← cliente Supabase singleton (usa env vars)
│   │   ├── base44Client.js    ← CRUD genérico con auditoría automática
│   │   ├── auditLog.js        ← logAudit() — escribe en audit_log
│   │   ├── gpsClient.js       ← proxy a Traccar vía Edge Function
│   │   └── routingClient.js   ← OSRM para geometría de rutas en mapa
│   ├── lib/
│   │   ├── AuthContext.jsx    ← AuthProvider + useAuth() — sesión global
│   │   ├── query-client.js    ← QueryClient singleton (staleTime y retry)
│   │   └── fuel-analytics.js  ← cálculos de rendimiento km/L
│   ├── components/
│   │   ├── ui/                ← shadcn/ui (NO editar manualmente)
│   │   ├── ui-helpers/        ← hooks y utilidades propias
│   │   │   ├── useUserRole.jsx     ← hook central de roles y permisos
│   │   │   ├── useTheme.jsx        ← dark mode toggle
│   │   │   ├── ExportButton.jsx    ← Excel/PDF/CSV unificado
│   │   │   ├── SaldoUtils.jsx      ← formatMonto() con moneda
│   │   │   ├── CombustibleBadge.jsx← badge con color por tipo
│   │   │   ├── ConfirmDialog.jsx   ← diálogo de confirmación
│   │   │   ├── CSVExport.jsx       ← exportación CSV
│   │   │   └── StatusBadge.jsx     ← badge de estado
│   │   ├── dashboard/
│   │   │   ├── ConsumidoresPorTipo.jsx  ← panel principal del Dashboard
│   │   │   └── GastosMensualesChart.jsx ← gráfico 6 meses gasto/litros
│   │   ├── rutas/
│   │   │   ├── MapaRutas.jsx            ← mapa Leaflet con tracks GPS y rutas
│   │   │   ├── MarcadoresPanel.jsx      ← gestión de waypoints del mapa
│   │   │   ├── BackfillGpsDialog.jsx    ← diálogo de guardado histórico GPS
│   │   │   ├── ImportarChatPanel.jsx    ← importación desde WhatsApp
│   │   │   ├── ReporteChatPanel.jsx     ← análisis de reportes de chat
│   │   │   └── parsearChat.js           ← parser de texto de chat
│   │   ├── movimientos/       ← NuevoMovimientoForm, EditarMovimientoModal
│   │   ├── alertas/           ← componentes del módulo de alertas
│   │   ├── configuracion/     ← paneles de configuración GPS, importación
│   │   ├── consumidores/      ← vistas de consumidores
│   │   ├── reportes/          ← paneles de reportes
│   │   ├── ProtectedRoute.jsx ← wrapper de rutas con autenticación
│   │   └── UserNotRegisteredError.jsx
│   ├── pages/
│   │   ├── Login.jsx          ← autenticación Supabase Auth
│   │   ├── Dashboard.jsx      ← KPIs, Flota GPS, gráficos (pantalla "Inicio")
│   │   ├── Movimientos.jsx    ← tabla transaccional central
│   │   ├── Rutas.jsx          ← programa diario + estadísticas + GPS vs Mov + mapa
│   │   ├── Catalogos.jsx      ← tipos combustible, tipos consumidor, tarjetas, conductores
│   │   ├── Finanzas.jsx       ← saldos por tarjeta, precios de combustible
│   │   ├── Alertas.jsx        ← alertas de consumo configurables
│   │   ├── Reportes.jsx       ← exportación Excel/PDF
│   │   ├── Configuracion.jsx  ← vinculación GPS, importación, ajustes
│   │   ├── AdminPanel.jsx     ← solo superadmin: usuarios y audit log
│   │   ├── Vehiculos.jsx      ← catálogo de vehículos (tabla vehiculo)
│   │   └── Ayuda.jsx          ← documentación in-app interactiva
│   ├── Layout.jsx             ← sidebar + navbar + control de acceso por rol
│   └── pages.config.js        ← mapa página→componente (generado automáticamente)
├── supabase/
│   └── functions/
│       ├── gps-proxy/index.ts      ← proxy seguro a Traccar API
│       └── gps-daily-save/index.ts ← guardado diario GPS vía cron
├── migrations/                ← SQL incrementales con fecha (YYYY-MM-DD_descripcion.sql)
├── MIGRACION_GLOBAL.sql       ← esquema completo acumulado (fuente de verdad)
├── CLAUDE.md                  ← contexto abreviado para Claude Code AI
├── package.json
├── vite.config.js
└── tailwind.config.js
```

---

## 4. Base de datos — Esquema completo

La base de datos es **PostgreSQL** gestionada por Supabase. El archivo `MIGRACION_GLOBAL.sql` en la raíz del proyecto es la fuente de verdad del esquema completo. Es seguro ejecutarlo sobre una base existente (usa `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`).

### Diagrama de relaciones

```
tipo_consumidor ←── consumidor ←── movimiento ──→ tipo_combustible
                         │              │
                         │              ├──→ tarjeta
                         │              └──→ consumidor (origen, para DESPACHO)
                         │
                    conductor ←─────────┤
                         │              │
                    asignacion_ruta ─────┤
                         │
                    ruta ←──────── ruta_marcador ──→ marcador

user_roles → auth.users (Supabase Auth)
audit_log  (registra todas las acciones)
gps_session_cache (caché de sesión Traccar, max 1 fila)
```

### Tablas detalladas

#### `tipo_consumidor`
Categorías de entidades que consumen combustible.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | UUID PK | Identificador |
| `nombre` | TEXT | Ej: "Vehículo", "Tanque de Reserva", "Equipo" |
| `icono` | TEXT | Nombre de icono Lucide: `truck`, `zap`, `container`, `settings` |
| `activo` | BOOLEAN | Si aparece en los formularios |
| `requiere_odometro` | BOOLEAN | Si el subtipo requiere lectura de odómetro en cada carga |
| `unidad_consumo` | TEXT | `km/L` para vehículos, `L/h` para equipos |

#### `tipo_combustible`
Catálogo de tipos de combustible (Diesel, Gasolina Regular, etc.).

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | UUID PK | — |
| `nombre` | TEXT | Nombre del combustible |
| `activa` | BOOLEAN | Si está disponible para nuevos movimientos |

#### `precio_combustible`
Historial de precios. Un precio vigente tiene `fecha_hasta = NULL`.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | UUID PK | — |
| `combustible_id` | UUID FK | → `tipo_combustible` |
| `combustible_nombre` | TEXT | Desnormalizado para robustez |
| `precio_por_litro` | NUMERIC(12,4) | Precio unitario |
| `fecha_desde` | DATE | Inicio de vigencia |
| `fecha_hasta` | DATE | Fin de vigencia; NULL = precio actual |

#### `tarjeta`
Tarjetas de crédito o combustible con saldo seguido.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | UUID PK | — |
| `id_tarjeta` | TEXT | Número o código de la tarjeta |
| `alias` | TEXT | Nombre descriptivo |
| `moneda` | TEXT | `CUP`, `USD`, `MLC`, `EUR` |
| `saldo_inicial` | NUMERIC(14,4) | Saldo al incorporar al sistema |
| `umbral_alerta` | NUMERIC(14,4) | Saldo mínimo antes de alertar |
| `activa` | BOOLEAN | — |

El saldo actual se calcula sumando `saldo_inicial + SUM(movimientos RECARGA/DEPOSITO) - SUM(movimientos COMPRA con esta tarjeta)`.

#### `vehiculo`
Catálogo técnico de vehículos (datos estáticos). No es la entidad transaccional — ver `consumidor`.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | UUID PK | — |
| `chapa` | TEXT | Matrícula / placa |
| `alias` | TEXT | — |
| `marca`, `modelo`, `ano` | TEXT/INT | Datos técnicos |
| `combustible_id` | UUID FK | → `tipo_combustible` |
| `capacidad_tanque` | NUMERIC(10,2) | Litros |
| `indice_consumo_fabricante` | NUMERIC(10,4) | km/L según fabricante |
| `indice_consumo_real` | NUMERIC(10,4) | km/L histórico real |
| `estado_vehiculo` | TEXT | `Operativo`, `En mantenimiento`, `Fuera de servicio`, `Baja` |

#### `conductor`
Catálogo de conductores y ayudantes.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | UUID PK | — |
| `nombre` | TEXT | Nombre completo |
| `ci` | TEXT | Cédula/documento |
| `licencia_numero`, `licencia_categoria`, `licencia_vencimiento` | — | Datos de licencia |
| `vehiculo_asignado_id` | UUID FK | → `consumidor` (vehículo habitual) |
| `activo` | BOOLEAN | — |

#### `consumidor` ⭐ (entidad central)
Agrupa **todas** las entidades que consumen o almacenan combustible: vehículos, tanques de reserva, equipos estacionarios. Es la entidad que aparece en todos los movimientos y asignaciones.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | UUID PK | — |
| `nombre` | TEXT | Nombre operativo |
| `codigo_interno` | TEXT | Chapa, matrícula o código |
| `tipo_consumidor_id` | UUID FK | → `tipo_consumidor` |
| `tipo_consumidor_nombre` | TEXT | Desnormalizado |
| `combustible_id` | UUID FK | → `tipo_combustible` |
| `combustible_nombre` | TEXT | Desnormalizado |
| `categoria` | TEXT | `consumidor` / `deposito` / `surtidor` — controla rol en la app |
| `litros_iniciales` | NUMERIC(14,4) | Stock al incorporar al sistema |
| `activo` | BOOLEAN | — |
| `datos_vehiculo` | JSONB | `{capacidad_tanque, indice_consumo_real, indice_consumo_fabricante, umbral_alerta_pct, umbral_critico_pct, estado_vehiculo}` |
| `datos_tanque` | JSONB | `{capacidad_litros}` |
| `datos_equipo` | JSONB | `{indice_consumo_referencia}` |
| `conductor_id` | UUID FK | → `conductor` |
| `ayudante_id` | UUID FK | → `conductor` |
| `gps_device_id` | INTEGER | ID de dispositivo en Traccar; NULL si no tiene GPS |
| `responsable`, `area_centro`, `funcion` | TEXT | Datos organizacionales |

**Cómo distinguir subtipos en código:**
```js
const esVehiculo = c.tipo_consumidor_nombre?.toLowerCase().includes('vehículo');
const esTanque   = c.categoria === 'deposito';
const esEquipo   = c.tipo_consumidor_nombre?.toLowerCase().includes('equipo');
const tieneGps   = c.gps_device_id != null;
```

#### `movimiento` ⭐ (tabla transaccional central)
Registra **cada transacción** de combustible. Es la tabla más consultada.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | UUID PK | — |
| `tipo` | TEXT | `COMPRA` / `DESPACHO` / `AJUSTE` / `DEPOSITO` / `RECARGA` / `TRANSFERENCIA` |
| `fecha` | TEXT | `YYYY-MM-DD` (texto por compatibilidad histórica) |
| `consumidor_id` | UUID FK | Destino del combustible |
| `consumidor_nombre` | TEXT | Desnormalizado |
| `consumidor_origen_id` | UUID FK | Solo DESPACHO: tanque de origen |
| `combustible_id` | UUID FK | → `tipo_combustible` |
| `tarjeta_id` | UUID FK | Solo COMPRA con tarjeta |
| `litros` | NUMERIC(14,4) | Volumen |
| `precio` | NUMERIC(12,4) | Precio por litro |
| `monto` | NUMERIC(14,4) | Total pagado |
| `odometro` | NUMERIC(12,2) | Km al momento de la carga |
| `odometro_anterior` | NUMERIC(12,2) | Km de la carga anterior (auto-calculado) |
| `km_recorridos` | NUMERIC(12,2) | `odometro - odometro_anterior` |
| `consumo_real` | NUMERIC(10,4) | `km_recorridos / litros_carga_anterior` (km/L) |
| `nivel_tanque` | NUMERIC(10,2) | Litros físicos en tanque ANTES de cargar (técnico) |
| `horas_uso` | NUMERIC(10,2) | Para equipos estacionarios |
| `remanente_estimado_antes` | NUMERIC(14,4) | Stock estimado antes de carga |
| `combustible_estimado_post` | NUMERIC(14,4) | Stock estimado después de carga |
| `auditoria_combustible_estado` | TEXT | Resultado de auditoría: `OK`, `ALERTA`, `CRITICO` |
| `referencia` | TEXT | Número de factura o remisión |

**Semántica por tipo:**
- `COMPRA`: combustible entra desde proveedor externo → `consumidor_id` recibe litros, `tarjeta_id` paga.
- `DESPACHO`: combustible se transfiere internamente → `consumidor_origen_id` da litros, `consumidor_id` recibe.
- `AJUSTE`: corrección de saldo sin movimiento físico.
- `DEPOSITO`/`RECARGA`: recarga monetaria de tarjeta.

#### `asignacion_ruta` ⭐
Registro diario de viajes: qué vehículo hizo qué ruta, con qué conductor, cuántos km reales recorrió. También almacena los **recorridos GPS automáticos** (tipo_viaje = 'recorrido_gps').

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | UUID PK | — |
| `fecha` | DATE | Fecha del viaje |
| `tipo_viaje` | TEXT | `regular`, `carga_mercancias`, `mensajeria`, `viaje_extra`, **`recorrido_gps`** |
| `ruta_id` | UUID FK | Ruta estándar (NULL si viaje especial o GPS) |
| `descripcion_emergencia` | TEXT | Descripción libre para viajes no estándar |
| `consumidor_id` | UUID FK | Vehículo que realizó el viaje |
| `consumidor_nombre` | TEXT | Desnormalizado |
| `conductor_id` | UUID FK | Conductor |
| `km_reales` | NUMERIC(12,2) | Km reales reportados (o medidos por GPS) |
| `estado` | TEXT | `pendiente`, `completada`, `cancelada` |
| `auto_generado` | BOOLEAN | TRUE si lo creó el cron automático |
| `fuente` | TEXT | `manual`, `gps`, `chat` |
| `litros_estimados` | NUMERIC(10,2) | Consumo estimado (usado en importación chat) |

**Registros tipo `recorrido_gps`**: creados automáticamente por la Edge Function `gps-daily-save` cada noche. Un índice único parcial garantiza un solo registro por vehículo/día: `uq_asignacion_ruta_gps_por_dia`.

#### `ruta`
Catálogo de rutas definidas con origen, destino, distancia y vehículo/conductor habitual.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | UUID PK | — |
| `nombre` | TEXT | Nombre de la ruta |
| `punto_inicio`, `punto_fin` | TEXT | Descripciones textuales |
| `lat_inicio`, `lng_inicio`, `lat_fin`, `lng_fin` | NUMERIC | Coordenadas para el mapa |
| `distancia_km` | NUMERIC(10,2) | Distancia de referencia |
| `frecuencia` | TEXT | `Diario`, `Semanal`, etc. |
| `consumidor_id` | UUID FK | Vehículo habitual |
| `conductor_id` | UUID FK | Conductor habitual |
| `grupo` | TEXT | Agrupación de rutas (para organización) |
| `activa` | BOOLEAN | — |

#### `marcador` y `ruta_marcador`
Waypoints geográficos del mapa y su relación ordenada con rutas.

- `marcador`: punto con `lat`, `lng`, `color`, `nombre`.
- `ruta_marcador`: join ordenado `(ruta_id, marcador_id, orden)` con restricción UNIQUE `(ruta_id, orden)`.

#### `config_alerta`
Umbrales de alerta de consumo por consumidor.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `consumidor_id` | UUID FK | Vehículo/equipo al que aplica |
| `umbral_alerta_pct` | NUMERIC(5,2) | % de consumo excedido para alerta (default 15%) |
| `umbral_critico_pct` | NUMERIC(5,2) | % para alerta crítica (default 30%) |
| `email_destino` | TEXT | Destinatario de alertas |
| `alerta_email` | BOOLEAN | Si enviar email |

#### `user_roles`
Vincula usuarios de Supabase Auth con roles de la aplicación.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `user_id` | UUID FK | → `auth.users` (Supabase Auth) |
| `email`, `full_name` | TEXT | Copiados de Auth para legibilidad |
| `role` | TEXT | `superadmin`, `operador`, `auditor`, `economico` |

Si un usuario existe en Auth pero no en `user_roles`, el sistema le asigna rol `auditor` automáticamente (ver `useUserRole.jsx`).

#### `audit_log`
Registro inmutable de todas las acciones de usuario.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `user_id`, `user_email`, `user_name` | — | Quién realizó la acción |
| `action` | TEXT | `CREATE`, `UPDATE`, `DELETE`, `ROLE_CHANGE` |
| `entity_type` | TEXT | `movimiento`, `consumidor`, `tarjeta`, etc. |
| `entity_id` | TEXT | ID del objeto afectado |
| `entity_label` | TEXT | Descripción legible del objeto |
| `payload` | JSONB | Estado completo del objeto (snapshot) |
| `metadata` | JSONB | Datos adicionales (cambios, rol anterior, etc.) |

Se escribe **automáticamente** en cada `create()`, `update()`, `delete()` de `base44Client.js`. Nunca se elimina.

#### `gps_session_cache`
Tabla especial con máximo 1 fila. Almacena la sesión activa de Traccar (JSESSIONID) para no re-autenticar en cada petición GPS. Se renueva automáticamente cuando vence (caché de 12 horas).

#### `reporte_chat_transporte`
Almacena registros extraídos de reportes de WhatsApp de conductores, vinculados opcionalmente a `asignacion_ruta` y `consumidor`. Incluye el texto crudo, km, litros, y confianza de extracción.

### Índices principales

Los índices más importantes para rendimiento:

```sql
-- movimiento (tabla más consultada)
idx_movimiento_fecha
idx_movimiento_tipo
idx_movimiento_consumidor_id
idx_movimiento_fecha_tipo          -- filtros por período y tipo
idx_movimiento_consumidor_fecha    -- historial de un vehículo en un período

-- asignacion_ruta
idx_asignacion_ruta_fecha
idx_asignacion_ruta_consumidor_id
uq_asignacion_ruta_gps_por_dia     -- UNIQUE parcial para recorrido_gps

-- consumidor
idx_consumidor_gps_device_id       -- WHERE gps_device_id IS NOT NULL
idx_consumidor_categoria
```

### Row Level Security (RLS)

Todas las tablas tienen RLS habilitado. La política actual permite **acceso total a usuarios autenticados** (la autorización se maneja en el frontend mediante roles). Las Edge Functions usan `SUPABASE_SERVICE_ROLE_KEY` que bypasea RLS.

Si en el futuro se necesita control por rol a nivel de base de datos, las políticas deben modificarse en `MIGRACION_GLOBAL.sql` creando una nueva migración incremental.

---

## 5. Sistema de roles y permisos

### Los 4 roles

| Rol | Descripción | Acceso típico |
|-----|-------------|---------------|
| `superadmin` | Administrador total | Todo, incluyendo AdminPanel y gestión de usuarios |
| `operador` | Encargado de flota | Registrar movimientos, rutas, conductores, catálogos |
| `auditor` | Solo lectura | Ver todo, no modificar ni exportar datos sensibles |
| `economico` | Finanzas | Gestionar tarjetas, precios, recargas; no puede modificar flota |

### Hook `useUserRole()`

El archivo [src/components/ui-helpers/useUserRole.jsx](../src/components/ui-helpers/useUserRole.jsx) es el punto único de control de acceso en el frontend.

```jsx
const {
  role,           // 'superadmin' | 'operador' | 'auditor' | 'economico'
  canWrite,           // superadmin | operador
  canManageFinanzas,  // superadmin | economico
  canDelete,          // superadmin | operador
  canRecargar,        // superadmin | economico
  canDespachar,       // superadmin | operador
  canComprar,         // superadmin | operador
  canImport,          // superadmin | operador
  canViewReportes,    // todos los roles
} = useUserRole();
```

El hook:
1. Consulta `supabase.auth.getUser()` para obtener el usuario.
2. Busca la fila en `user_roles` correspondiente.
3. Si no existe la fila (usuario nuevo), **la crea automáticamente** con rol `auditor`.
4. Suscribe a `onAuthStateChange` para actualizar en tiempo real.

### Acceso en Layout

El Layout principal ([src/Layout.jsx](../src/Layout.jsx)) controla qué ítems del sidebar son visibles para cada rol. Cada ítem del menú tiene opcionalmente una propiedad `requiredRole` o se oculta condicionalmente con `canWrite`, `isAdmin`, etc.

---

## 6. Clientes API y servicios externos

### `supabaseClient.js`
Singleton del cliente Supabase. Usa las variables de entorno:
- `VITE_SUPABASE_URL`: URL del proyecto Supabase.
- `VITE_SUPABASE_ANON_KEY`: clave pública (anon) para peticiones autenticadas.

```js
import { supabase } from '@/api/supabaseClient';
// Uso directo para queries complejas:
const { data } = await supabase
  .from('movimiento')
  .select('id, litros, fecha')
  .gte('fecha', '2026-01-01')
  .lt('fecha', '2026-02-01');
```

### `base44Client.js`
Capa CRUD genérica con auditoría automática. Expone entidades con métodos `list()`, `create()`, `update()`, `delete()`.

```js
import { base44 } from '@/api/base44Client';

// Listar (ordenado, con límite opcional):
const movimientos = await base44.entities.Movimiento.list('-fecha', 500);

// Crear (escribe en audit_log automáticamente):
const nuevo = await base44.entities.Movimiento.create({ tipo: 'COMPRA', ... });

// Actualizar:
await base44.entities.Movimiento.update(id, { litros: 50 });

// Eliminar (snapshot antes de borrar):
await base44.entities.Movimiento.delete(id);
```

**Limitación importante**: `list()` sin `limit` no impone un límite por defecto, pero al pasar un `limit` explícito (p.ej. `2000`) en algunas llamadas de la app se truncan los resultados. Para consultas de análisis mensual, hacer **queries directas a `supabase`** con filtros de fecha, no usar `base44.entities.X.list()`.

### `gpsClient.js`
Proxy al servidor Traccar vía la Edge Function `gps-proxy`. Requiere sesión activa de Supabase.

```js
import { gpsApi, metersToKm } from '@/api/gpsClient';

// Listar dispositivos GPS registrados en Traccar:
const devices = await gpsApi.devices();

// Posición actual de todos los vehículos:
const positions = await gpsApi.allPositions();

// Resumen de actividad en un período:
const summary = await gpsApi.summary(deviceId, new Date('2026-05-01'), new Date('2026-05-31'));
// summary[0].distance → metros recorridos
const km = metersToKm(summary[0].distance);

// Trayectoria completa (para dibujar en mapa):
const route = await gpsApi.route(deviceId, from, to);
// route → array de posiciones con lat, lng, speed, etc.

// Varios dispositivos a la vez:
const summaries = await gpsApi.summaryMultiple([101, 102, 103], from, to);
```

### `routingClient.js`
Calcula la geometría real por carretera usando OSRM (servicio público, sin API key).

```js
import { getRouteGeometry } from '@/api/routingClient';

const result = await getRouteGeometry([
  { lat: 23.1, lng: -82.3 },
  { lat: 23.5, lng: -82.0 },
]);
// result.points → [[lat, lng], ...] para React Leaflet Polyline
// result.distanceKm → distancia calculada por carretera
```

### `auditLog.js`
Se llama internamente desde `base44Client.js`. Puede también usarse directamente para registrar acciones de sistema:

```js
import { logAudit } from '@/api/auditLog';

await logAudit({
  action:      'ROLE_CHANGE',
  entityType:  'user_roles',
  entityId:    userId,
  entityLabel: userEmail,
  payload:     { role: newRole },
  metadata:    { prevRole: oldRole, newRole },
});
```

Nunca lanza excepción — los errores de auditoría se registran en consola pero no interrumpen el flujo principal.

---

## 7. Edge Functions (Supabase/Deno)

Las Edge Functions se despliegan en el servidor de Supabase y se ejecutan en Deno (TypeScript).

### `gps-proxy`
**Archivo**: `supabase/functions/gps-proxy/index.ts`  
**Propósito**: Proxy seguro a la API de Traccar. El servidor Traccar usa autenticación por cookie de sesión (JSESSIONID), que no puede exponerse en el frontend. La Edge Function:

1. Verifica que el request tenga un JWT de Supabase válido.
2. Recupera o crea la sesión Traccar (caché en `gps_session_cache`).
3. Proxea la petición a Traccar solo para paths permitidos: `/devices`, `/positions`, `/reports/route`, `/reports/summary`.
4. Si la sesión expiró (401), re-autentica y reintenta una vez.

**Variables de entorno requeridas** (configurar en Supabase → Functions → Secrets):
- `TRACCAR_EMAIL`: email de acceso al servidor Traccar.
- `TRACCAR_PASSWORD`: contraseña.
- `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`: provistos automáticamente por Supabase.

### `gps-daily-save`
**Archivo**: `supabase/functions/gps-daily-save/index.ts`  
**Propósito**: Guarda el recorrido GPS del día como registros en `asignacion_ruta` (tipo_viaje = 'recorrido_gps'). Se ejecuta automáticamente a las **23:55 hora Cuba (04:55 UTC del día siguiente)** vía pg_cron.

Flujo:
1. Obtiene todos los consumidores activos con `gps_device_id`.
2. Verifica cuáles ya tienen registro hoy (para no duplicar).
3. Para cada vehículo pendiente, consulta Traccar: resumen del día (km) y posición actual (odómetro).
4. Inserta en `asignacion_ruta` solo si `km > 0`.

**Invocación manual** (desde Configuración en la app o con curl):
```bash
curl -X POST https://SUPABASE_URL/functions/v1/gps-daily-save \
  -H "Authorization: Bearer SERVICE_ROLE_KEY"
```

**Deploy**:
```bash
supabase functions deploy gps-daily-save
supabase functions deploy gps-proxy
```

### Configurar el cron (pg_cron)

Requiere extensiones `pg_cron` y `pg_net` habilitadas en Supabase → Database → Extensions.

El cron se crea ejecutando el SQL al final de `MIGRACION_GLOBAL.sql` (sección 18). Verificar si ya está activo:
```sql
SELECT * FROM cron.job;
```

---

## 8. Módulos de la aplicación

### 8.1 Dashboard / Inicio (`Dashboard.jsx`)

Pantalla principal con KPIs y resúmenes. Soporta filtro por período (mes específico o "Todos").

**Secciones:**
- **Resumen de consumo por tipo** (`ConsumidoresPorTipo.jsx`): panel principal que muestra todos los vehículos/tanques/equipos con su stock, consumo del mes, alertas. Tiene lógica compleja de cálculo de saldo en litros.
- **Gráfico de gastos mensuales** (`GastosMensualesChart.jsx`): barras de gasto en $ + línea de litros, últimos 6 meses.
- **Flota GPS del mes**: grid de 4 KPIs (Km GPS, Km Reg., Días con GPS, Última actualización). Solo visible si hay datos GPS en el período. Enlaza a la tab GPS vs Mov. en Rutas.

**Queries principales:**
- `movimientos`: todos los movimientos (sin límite explícito en esta página).
- `consumidores`: lista completa de consumidores activos.
- `asigGpsMes`: asignaciones del mes seleccionado filtradas directamente en Supabase.

### 8.2 Movimientos (`Movimientos.jsx`)

Tabla transaccional con todas las operaciones. Soporta filtros por tipo, fecha, combustible, consumidor y tarjeta.

**Operaciones por rol:**
- `superadmin`/`operador`: COMPRA, DESPACHO, AJUSTE. El rol `economico` puede hacer DEPOSITO/RECARGA.
- Edición: disponible para `superadmin` y `operador`.
- Eliminación: solo `superadmin`/`operador`.

**Componentes de formulario:**
- `NuevoMovimientoForm.jsx`: formulario con lógica de odómetro automático, cálculo de consumo real, auditoría de combustible.
- `EditarMovimientoModal.jsx`: edición con invalidación de caché.

### 8.3 Rutas (`Rutas.jsx`)

El módulo más complejo del sistema. Contiene 4 tabs principales:

**Tab 1 — Programa diario**: tabla de asignaciones del día seleccionado. Permite agregar, editar y completar viajes. Muestra un resumen de km por vehículo.

**Tab 2 — Estadísticas**: comparativo mensual por vehículo con 6 columnas:
- Km GPS (suma de recorridos GPS del mes)
- Km Reg. (suma de novedades/viajes manuales)
- Km Odóm. (diferencia de odómetro: MAX(odo en mes) − MAX(odo antes del mes))
- Litros (consumo de combustible del mes)
- Cargas (número de movimientos COMPRA/DESPACHO)
- Rendimiento (km/L = Km Odóm / Litros)

**Trazabilidad**: hacer clic en cualquier fila del comparativo abre un modal con los registros fuente de cada columna (GPS, viajes, combustible, cálculo odómetro paso a paso).

**Tab 3 — Mapa**: visualización interactiva con:
- Filtros por ruta y vehículo.
- Tracks GPS del período seleccionado (color violeta/índigo).
- Rutas estándar con geometría por carretera (OSRM).
- Marcadores de waypoints.
- Popup por vehículo con botón de guardado manual del GPS del día.

**Tab 4 — GPS vs Movimientos**: tabla comparativa del mes seleccionado. Usa `asigComparativoMes` (query directa sin límite de registros) para evitar el truncamiento del query global.

**Queries importantes en Rutas.jsx:**
- `asigComparativoMes`: query directa a Supabase con filtro de mes (evita el límite de 2000 registros del query global).
- `movOdoAntesMes`: movimientos con odómetro antes del mes para el cálculo del Km Odóm.
- `movimientosMes`: movimientos del mes seleccionado.

### 8.4 Catálogos (`Catalogos.jsx`)

Gestión de:
- **Tipos de consumidor**: con propiedades `requiere_odometro` y `unidad_consumo`.
- **Tipos de combustible**.
- **Tarjetas**: con saldo calculado en tiempo real.
- **Conductores**: con vinculación a vehículo asignado.

### 8.5 Finanzas (`Finanzas.jsx`)

- Saldos actuales por tarjeta con historial de movimientos.
- Precios vigentes de combustible con historial.

### 8.6 Alertas (`Alertas.jsx`)

- Lista de alertas activas/disparadas por consumidor.
- Configuración de umbrales (umbral_alerta_pct, umbral_critico_pct).
- Las alertas se evalúan en el frontend comparando el consumo del mes contra el índice de consumo de referencia.

### 8.7 Reportes (`Reportes.jsx`)

Exportación de datos en distintos formatos:
- **Excel**: usando ExcelJS con formato y estilos.
- **PDF**: usando jsPDF + autotable.

### 8.8 Configuración (`Configuracion.jsx`)

- **Vinculación GPS**: asociar un `gps_device_id` de Traccar a cada consumidor vehículo.
- **Guardado manual GPS**: invocar `gps-daily-save` para el día actual.
- **Importación de datos**: carga masiva desde CSV/Excel.
- **Tipos de viaje**: configurar los tipos disponibles en asignación de rutas.

### 8.9 AdminPanel (`AdminPanel.jsx`)

Solo accesible para `superadmin`. Contiene:
- **Gestión de usuarios**: cambiar roles, ver usuarios registrados.
- **Audit log**: historial completo de todas las acciones con filtros.

### 8.10 Ayuda (`Ayuda.jsx`)

Documentación in-app interactiva organizada por módulo. Incluye pasos, tablas descriptivas, callouts de advertencia y glosario. Se actualiza con cada nueva funcionalidad implementada.

---

## 9. Cómo implementar un nuevo módulo

Este ejemplo asume que se necesita añadir un módulo "Mantenimiento" para registrar servicios realizados a vehículos.

### Paso 1: Crear la tabla en la base de datos

Agregar al final de `MIGRACION_GLOBAL.sql` Y crear un archivo `migrations/2026-06-01_mantenimiento.sql`:

```sql
CREATE TABLE IF NOT EXISTS mantenimiento (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consumidor_id    UUID REFERENCES consumidor(id) ON DELETE SET NULL,
  consumidor_nombre TEXT,
  fecha            TEXT NOT NULL,      -- YYYY-MM-DD
  tipo_servicio    TEXT NOT NULL,
  descripcion      TEXT,
  costo            NUMERIC(14,4),
  km_servicio      NUMERIC(12,2),
  created_date     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mantenimiento_consumidor ON mantenimiento(consumidor_id);
CREATE INDEX IF NOT EXISTS idx_mantenimiento_fecha      ON mantenimiento(fecha);

ALTER TABLE mantenimiento ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated full access" ON mantenimiento;
  CREATE POLICY "Authenticated full access" ON mantenimiento
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
END $$;
```

Ejecutar en Supabase → SQL Editor.

### Paso 2: Registrar la entidad en `base44Client.js`

```js
// En src/api/base44Client.js, agregar dentro de base44.entities:
Mantenimiento: createEntity('mantenimiento', 'Mantenimiento'),
```

Y agregar el label extractor en `ENTITY_LABEL`:
```js
mantenimiento: d => [d?.tipo_servicio, d?.consumidor_nombre].filter(Boolean).join(' — '),
```

### Paso 3: Crear la página

Crear `src/pages/Mantenimiento.jsx`:

```jsx
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { base44 } from '@/api/base44Client';
import { useUserRole } from '@/components/ui-helpers/useUserRole';
import { toast } from 'react-hot-toast';

const fmtL = n => (n % 1 === 0 ? String(Math.round(n)) : n.toFixed(1));

export default function Mantenimiento() {
  const { canWrite } = useUserRole();
  const queryClient  = useQueryClient();

  const { data: registros = [] } = useQuery({
    queryKey: ['mantenimiento'],
    queryFn: async () => {
      const { data } = await supabase
        .from('mantenimiento')
        .select('*')
        .order('fecha', { ascending: false });
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });

  const crearMut = useMutation({
    mutationFn: d => base44.entities.Mantenimiento.create(d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mantenimiento'] });
      toast.success('Servicio registrado');
    },
    onError: () => toast.error('Error al registrar'),
  });

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold mb-4">Mantenimiento</h1>
      {/* ... UI ... */}
    </div>
  );
}
```

### Paso 4: Registrar en el sistema de navegación

En `src/pages.config.js` (si existe mapeo manual) o en `src/Layout.jsx`, agregar el ítem al sidebar:

```jsx
// En Layout.jsx, dentro del array de navegación:
{
  name: 'Mantenimiento',
  page: 'Mantenimiento',
  icon: Wrench,        // de lucide-react
  // Opcional: restringir a roles
  // visible: canWrite
}
```

### Paso 5: Actualizar `Ayuda.jsx`

Añadir una sección nueva en `Ayuda.jsx` documentando el módulo con pasos y tabla descriptiva.

### Paso 6: Probar

```bash
npm run dev
# Verificar que la página carga
# Crear un registro de prueba
# Verificar que aparece en audit_log en AdminPanel
npm run release:verify
# lint + build completo antes de deploy
```

---

## 10. Guía de desarrollo y deploy

### Configurar entorno local

1. Clonar el repositorio.
2. Crear `.env.local` en la raíz:
   ```
   VITE_SUPABASE_URL=https://okcvyuemcxzxvvyfkjzp.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
3. Instalar dependencias: `npm install`
4. Iniciar dev server: `npm run dev` → http://localhost:5173

### Comandos disponibles

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Dev server con hot reload |
| `npm run build` | Build de producción en `dist/` |
| `npm run lint` | Verificar código con ESLint |
| `npm run lint:fix` | Corregir automáticamente |
| `npm run release:verify` | Verificar conflicts + lint + build completo |
| `npm run preview` | Preview del build de producción |
| `npm run typecheck` | Verificar tipos con TypeScript (jsconfig.json) |
| `npm run seed:import` | Vista previa de datos de seed |
| `npm run seed:import:apply` | Aplicar datos de seed |

### Deploy a producción (Apache)

1. Ejecutar `npm run release:verify` — debe pasar lint y build sin errores.
2. Copiar el contenido de `dist/` al servidor web Apache.
3. El archivo `public/.htaccess` se incluye automáticamente en `dist/`. **No editar** el `.htaccess` dentro de `dist/` — editar siempre el de `public/`.

El `.htaccess` configura:
- Rewrite de todas las rutas al `index.html` (SPA).
- Cabeceras de seguridad HTTP (X-Content-Type-Options, X-Frame-Options, CSP).
- Caché de assets estáticos.

### Desplegar Edge Functions

```bash
# Requiere Supabase CLI instalado y autenticado
supabase functions deploy gps-proxy
supabase functions deploy gps-daily-save

# Configurar secrets en Supabase (solo necesario la primera vez):
supabase secrets set TRACCAR_EMAIL=correo@dominio.com
supabase secrets set TRACCAR_PASSWORD=contraseña_segura
```

### Cambios de esquema

**Siempre** seguir este proceso:

1. Agregar los cambios al final de `MIGRACION_GLOBAL.sql` (usando `IF NOT EXISTS`).
2. Crear un archivo en `migrations/YYYY-MM-DD_descripcion.sql` con solo los cambios del día.
3. Ejecutar en Supabase → SQL Editor.
4. Verificar en Supabase Studio que la tabla/columna existe.
5. Actualizar el frontend si hay campos nuevos.

### Gestionar componentes shadcn/ui

Los componentes en `src/components/ui/` son de shadcn/ui y **no deben editarse manualmente**. Para agregar nuevos:

```bash
npx shadcn@latest add nombre-componente
# Ejemplos: button, dialog, select, badge, table, calendar
```

---

## 11. Convenciones de código

### Queries (TanStack Query)

```jsx
// Patrón estándar para todas las queries:
const { data: items = [], isLoading } = useQuery({
  queryKey: ['nombre-descriptivo', dependencia1, dependencia2],
  queryFn: async () => {
    const { data } = await supabase
      .from('tabla')
      .select('col1, col2, col3')
      .eq('campo', valor)
      .order('fecha', { ascending: false });
    return data ?? [];
  },
  staleTime: 5 * 60_000,  // 5 minutos — siempre usar este valor
});
```

**Regla crítica**: Para consultas de análisis mensual que pueden superar 2000 registros, usar siempre **query directa a `supabase`** con filtros de fecha. No usar `base44.entities.X.list()` para estos casos.

### Mutations

```jsx
const crearMut = useMutation({
  mutationFn: datos => base44.entities.Entidad.create(datos),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['nombre-descriptivo'] });
    toast.success('Registro creado');
  },
  onError: () => toast.error('Error al crear'),
});

// Usar:
crearMut.mutate(datos);
// O con async/await:
await crearMut.mutateAsync(datos);
```

### Formateo de litros (`fmtL`)

```js
// Definir localmente en cada archivo que lo necesite:
const fmtL = n => (n % 1 === 0 ? String(Math.round(n)) : n.toFixed(1));

// Uso:
`${fmtL(litros)} L`   // → "150 L" o "150.5 L"
```

**No** usar `.toFixed(1)` directamente para valores de litros — produce "150.0 L" en lugar de "150 L".

### Formateo de montos (`formatMonto`)

```jsx
import { formatMonto } from '@/components/ui-helpers/SaldoUtils';
formatMonto(1234.5)  // → "$1.234,50" o formato según configuración
```

### Acceso por rol

```jsx
const { canWrite, canManageFinanzas, isAdmin } = useUserRole();

// En JSX:
{canWrite && <Button onClick={handleCreate}>Crear</Button>}
```

### Estructura de página típica

```jsx
import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { base44 } from '@/api/base44Client';
import { useUserRole } from '@/components/ui-helpers/useUserRole';
import { toast } from 'react-hot-toast';

const fmtL = n => (n % 1 === 0 ? String(Math.round(n)) : n.toFixed(1));

export default function MiModulo() {
  const { canWrite } = useUserRole();
  const queryClient  = useQueryClient();

  // 1. Queries
  const { data: items = [] } = useQuery({ ... });

  // 2. Datos derivados (useMemo, sin side effects)
  const resumen = useMemo(() => { ... }, [items]);

  // 3. Mutations
  const crearMut = useMutation({ ... });

  // 4. Handlers
  const handleSubmit = (datos) => crearMut.mutate(datos);

  // 5. JSX
  return (
    <div className="p-6 space-y-6">
      ...
    </div>
  );
}
```

### Clases de CSS (Tailwind)

- Usar `space-y-*` y `gap-*` para espaciado, nunca `margin` manual.
- Glassmorphism: clase `glass` (definida en el CSS global) para tarjetas flotantes.
- Colores por tipo de combustible: `text-sky-*` (Diesel), `text-amber-*` (Gasolina), `text-violet-*` (GPS).
- Estados: `text-emerald-*` (positivo), `text-red-*` (negativo/crítico), `text-amber-*` (alerta).

### Comentarios en código

No añadir comentarios que expliquen **qué** hace el código — los nombres deben ser descriptivos. Solo comentar el **por qué** cuando hay una razón no obvia:

```js
// Query directa porque asignaciones globales están limitadas a 2000 registros
const { data } = await supabase.from('asignacion_ruta').select('...')...
```

### Importación de paths

Siempre usar el alias `@/` en lugar de rutas relativas:

```js
// Correcto:
import { supabase } from '@/api/supabaseClient';
import { useUserRole } from '@/components/ui-helpers/useUserRole';

// Incorrecto:
import { supabase } from '../../api/supabaseClient';
```

---

*Documento generado en Mayo 2026. Actualizar esta documentación cada vez que se añada un módulo nuevo, se modifique el esquema de la base de datos o cambien las convenciones de código.*
