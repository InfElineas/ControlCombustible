# Reporte de Desarrollo — Sistema de Control de Combustible

**Fecha de emisión:** 07 de mayo de 2026 (actualización continua)  
**Versión:** `main` · commit `1cbf9a6` + sesión en curso  
**Plataforma:** React 18 + Vite 6 + Supabase  

---

## 1. Estado de los requerimientos solicitados

### ✅ 1.1 Identificar importes monetarios con símbolo de pesos ($)

**Estado: Implementado**

Todos los valores monetarios del sistema utilizan la función centralizada `formatMonto()` (ubicada en `src/components/ui-helpers/SaldoUtils.jsx`), que aplica el formato `$ 0,00` con separador de miles y dos decimales. Los litros se muestran siempre con el sufijo ` L` (ej. `1 440,0 L`). La diferenciación es consistente en:

- Tabla de movimientos
- Tarjetas de resumen del dashboard
- Módulo de reportes (tarjetas, consumidores, consumo)
- Formularios de registro
- Panel de administración (auditoría de movimientos)

---

### ✅ 1.2 Tipificar los nombres de las tarjetas

**Estado: Implementado**

La entidad `tarjeta` tiene dos campos diferenciados:

| Campo | Uso |
|---|---|
| `alias` | Nombre descriptivo (ej. "Tarjeta Flota Principal") |
| `id_tarjeta` | Código/número físico de la tarjeta |

En todos los selectores, tablas y reportes se muestra el `alias` como nombre principal con `id_tarjeta` como referencia secundaria. Los movimientos almacenan `tarjeta_alias` para trazabilidad histórica independiente del catálogo.

---

### ✅ 1.3 Campos obligatorios: código interno, tipo de combustible y responsable

**Estado: Implementado**

El formulario de consumidores (`ConsumidorForm.jsx`) marca con `*` y valida los siguientes campos según el tipo de consumidor:

| Campo | Obligatorio para |
|---|---|
| Tipo de consumidor | Todos |
| Nombre / Descripción | Todos |
| Combustible principal | Todos |
| Chapa / Código interno | Vehículos |
| Responsable | Vehículos |

La validación se ejecuta en `Consumidores.jsx` antes de enviar a la base de datos, mostrando `toast.error()` descriptivo cuando falta algún campo requerido.

---

### ✅ 1.4 Visualización diferenciada de tipos de combustible (diesel / gasolina)

**Estado: Implementado**

Se creó el componente `CombustibleBadge` (`src/components/ui-helpers/CombustibleBadge.jsx`) con identidad visual por tipo:

| Tipo | Color del badge |
|---|---|
| Diesel | Ámbar / naranja |
| Especial / Premium | Azul |
| Regular / Gasolina | Verde |

El componente detecta el tipo por coincidencia de texto en el nombre (`diesel`, `especial`) y aplica el estilo correspondiente. Se utiliza en:

- Tarjetas del módulo Almacén/Autorizo
- Tabs de combustible en ConsumidoresPorTipo (Dashboard)
- Modal de historial de autorizaciones

---

### ✅ 1.5 Módulo de recargas de tarjetas con rol Económico

**Estado: Implementado**

Se diseñó un sistema de permisos granular para separar las operaciones financieras de las operaciones de transporte:

**Nuevos flags en `useUserRole.jsx`:**

| Flag | Roles habilitados | Operaciones |
|---|---|---|
| `canRecargar` | superadmin, económico | RECARGA de tarjetas |
| `canComprarDespachar` | superadmin, operador | COMPRA y DESPACHO |
| `canManageFinanzas` | superadmin, económico | Gestión de precios y saldos |

**Comportamiento en el formulario de movimientos (`NuevoMovimientoForm.jsx`):**

- El usuario con rol **económico** solo ve el tab "Recarga" → no puede registrar compras ni despachos
- El usuario con rol **operador** solo ve los tabs "Compra" y "Despacho" → no puede recargar tarjetas
- El usuario con rol **superadmin** tiene acceso completo a los tres tipos

**Refuerzo a nivel de base de datos (RLS):**  
La política `movimiento_insert` en Supabase valida la combinación rol + tipo directamente en la base de datos, como segunda capa de seguridad independiente del frontend.

---

### ✅ 1.6 Restringir acceso a edición de saldos y precios según rol

**Estado: Implementado**

- El flag `canManageFinanzas` controla la visibilidad de las secciones de precios de combustible, recargas y gestión de saldos de tarjetas.
- A nivel de base de datos, las políticas RLS de Supabase (`user_roles_update_superadmin`) restringen la modificación de roles de usuario exclusivamente al superadmin.
- El panel de administración completo (`AdminPanel.jsx`) es visible únicamente para superadmin.

---

### ✅ 1.7 Opción "Mixto / Varios" en el campo responsable de vehículo

**Estado: Implementado**

El campo "Responsable" en `ConsumidorForm.jsx` utiliza un `<input>` con lista de sugerencias (`<datalist>`), que propone automáticamente las opciones más comunes al escribir:

- **Mixto / Varios** — para vehículos compartidos entre conductores
- **Por asignar** — para vehículos sin conductor definido

El campo acepta cualquier texto libre, por lo que no restringe el ingreso de nombres específicos.

---

### ✅ 1.8 Mejorar el selector de año del vehículo

**Estado: Implementado**

El selector de año en `ConsumidorForm.jsx` genera dinámicamente los años desde el **año actual hacia atrás hasta 1990**, en orden descendente. El usuario selecciona directamente el año de la lista sin tener que navegar desde valores arbitrarios. La lógica es:

```js
Array.from(
  { length: new Date().getFullYear() - 1989 },
  (_, i) => new Date().getFullYear() - i
)
// Resultado: [2026, 2025, 2024, ..., 1990]
```

---

### 🔮 1.9 Evaluación futura: choferes con ingreso directo de datos (app móvil)

**Estado: Planificado — Sin bloqueos técnicos**

El sistema de roles ya está arquitectado para soportar esta expansión. La propuesta cuando se migre a app móvil o PWA es:

- **Nuevo rol `conductor`**: acceso solo a DESPACHO del vehículo asignado (`consumidor_id` propio)
- El hook `useUserRole` se extiende con un nuevo flag `canDespacharPropio`
- El formulario filtra el selector de consumidor para mostrar únicamente el vehículo del conductor autenticado
- Las políticas RLS de Supabase se extienden con `movimiento_insert_conductor` que valida `consumidor_id = get_my_consumidor_id()`

**Prerequisito:** asociar `user_id` → `consumidor_id` en la tabla `user_roles` o en una tabla intermedia.

---

### 🔮 1.10 Consumo planificado mensual basado en rutas fijas (GPS)

**Estado: Diseñado — Pendiente de implementación**

Se analizaron tres enfoques según el contexto operativo (rutas fijas a centros de distribución conocidos):

#### Opción A — Rutas predefinidas (recomendada, sin GPS)
Dado que los destinos son fijos y poco variables, se propone registrar las rutas una vez:

```
Ruta: Depósito → Centro Sur → 47 km
Ruta: Depósito → Centro Norte → 62 km
```

Al registrar un DESPACHO, el operador selecciona la ruta y los km se autocompletan. Esto elimina el error humano en la carga de odómetro.

**Implementación estimada:** tabla `ruta` + campo `ruta_id` en `movimiento` + autocomplete en el formulario.

#### Opción B — Integración con plataforma GPS existente
Si la plataforma GPS actual tiene API REST (Wialon, GPS-Pro, SkyOne y similares), se puede consultar el km recorrido real del día por chapa de vehículo y traerlo automáticamente al formulario de movimiento.

**Prerequisito:** identificar la plataforma y credenciales de API.

#### Opción C — Consumo planificado mensual
Con las rutas definidas y los despachos registrados, se puede calcular:
- **Litros planificados** = suma de `km_ruta × consumo_referencia / 100` para todos los despachos del mes
- **Litros reales** = suma de litros en movimientos COMPRA del mes
- **Desviación** = diferencia porcentual entre planificado y real

La tabla `movimiento` ya tiene los campos `km_recorridos`, `consumo_real` y `odometro` listos para este análisis.

**Nota:** Los datos de los GPS de los vehículos serán insumo clave para validar las distancias reales y refinar los índices de consumo de referencia por ruta.

---

## 2. Mejoras adicionales — Plus de desarrollo

### 2.1 Seguridad y vulnerabilidades

| Acción | Impacto |
|---|---|
| Eliminación de `@base44/sdk` y `@base44/vite-plugin` | Resuelve 4 vulnerabilidades moderadas (uuid < 14.0.0) |
| RLS granular con función `get_my_role()` en Supabase | `user_roles` UPDATE/DELETE solo superadmin; `movimiento` INSERT validado en BD |
| Validación de límites numéricos en formularios | Previene NaN, Infinity y valores extremos (máx. 50 000 L / 10 000 000 USD) |
| Manejadores `onError` en todas las mutaciones | Mensajes de error amigables sin exponer detalles técnicos al usuario |

### 2.2 Dashboard — Alertas

- El tab **"Con alertas"** ahora agrupa los consumidores en secciones: **Crítico** (rojo) / **En alerta** (ámbar) / **Sin datos** (gris), con encabezados coloreados y conteo por sección.
- Los consumidores sin registros de combustible (`sinDatos`) se incluyen en el conteo de alertas para que no pasen desapercibidos.
- Icono diferenciado para el estado "Sin datos" (`HelpCircle`).

### 2.3 Dashboard — ConsumidoresPorTipo

- El header de cada grupo muestra el **desglose de litros por tipo de combustible** (ej. `Diesel: 980 L · Regular: 460 L`), visible sin necesidad de expandir el acordeón.
- Dentro del acordeón, se agregaron **tabs por tipo de combustible** que filtran la lista de consumidores del grupo.

### 2.4 Dashboard — Módulo Almacén / Autorizo

- Cada tarjeta de consumidor del tipo "almacén" muestra el **tipo de combustible de la última autorización** mediante `CombustibleBadge`.
- Botón **"Ver autorizaciones"** que abre un modal con el historial completo de despachos recibidos, incluyendo fecha, combustible, litros y origen.

### 2.5 Panel de administración

- Corregido error crítico: la columna era `created_at` en el código pero `created_date` en el schema de Supabase → la lista de usuarios ahora carga correctamente.
- Mensaje de error visible si la consulta falla.
- `retry: 1` y `staleTime: 60 000 ms` en la consulta de usuarios para mejor resiliencia.

### 2.6 Exportación de reportes

- Instaladas dependencias `jspdf-autotable` y `exceljs`.
- Componente `ExportButton` (`src/components/ui-helpers/ExportButton.jsx`) disponible para adjuntar a cualquier tabla del sistema y exportar en CSV, Excel o PDF con formato profesional.

---

## 3. Nuevas funcionalidades — Sesión 07/05/2026

### 3.1 Sistema de auditoría completo (`audit_log`)

**Commits:** `dda1e52`  
**Archivos:** `src/api/auditLog.js`, `src/api/base44Client.js`, `src/pages/AdminPanel.jsx`

Se sustituyó la pestaña "Auditoría de Movimientos" (que solo replicaba el listado de movimientos) por un **registro de auditoría real** que captura automáticamente toda acción realizada en el sistema.

#### Cómo funciona

El módulo `auditLog.js` expone la función `logAudit()`, que se llama de forma fire-and-forget tras cada operación. La identidad del usuario se obtiene de Supabase Auth con caché de 5 minutos para no impactar el rendimiento.

El factory `createEntity()` en `base44Client.js` fue extendido para auto-llamar `logAudit()` en cada `create`, `update` y `delete`. Para las eliminaciones, el sistema toma un **snapshot completo del registro antes de borrarlo** y lo persiste en el payload del log, permitiendo reconstruir cualquier dato eliminado.

#### Campos registrados en `audit_log`

| Campo | Descripción |
|---|---|
| `user_id` / `user_email` / `user_name` | Identidad del usuario que realizó la acción |
| `action` | `CREATE`, `UPDATE`, `DELETE`, `ROLE_CHANGE` |
| `entity_type` | Entidad afectada (`Movimiento`, `Consumidor`, `Tarjeta`, `UserRole`, etc.) |
| `entity_id` | ID del registro afectado |
| `entity_label` | Etiqueta legible del registro (nombre, matrícula, etc.) |
| `payload` | Estado completo del registro en formato JSON |
| `metadata` | Para `UPDATE`: campos y valores modificados; para `ROLE_CHANGE`: rol anterior y nuevo |
| `created_at` | Timestamp UTC de la operación |

#### Vista en AdminPanel

El tab de Auditoría muestra un feed de eventos con:
- KPIs: total de eventos, creaciones, actualizaciones y eliminaciones del período
- Filtros por acción y entidad
- Búsqueda de texto libre
- Filas expandibles con el payload JSON completo
- Refresco automático cada 60 segundos

#### Migración SQL requerida

```sql
CREATE TABLE IF NOT EXISTS audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ DEFAULT now(),
  user_id      UUID,
  user_email   TEXT,
  user_name    TEXT,
  action       TEXT NOT NULL,
  entity_type  TEXT,
  entity_id    TEXT,
  entity_label TEXT,
  payload      JSONB,
  metadata     JSONB
);

-- RLS: solo lectura para usuarios autenticados; inserción desde cualquier rol
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_log_select" ON audit_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "audit_log_insert" ON audit_log FOR INSERT TO authenticated WITH CHECK (true);
```

---

### 3.2 Corrección del filtro COMPRA/DESPACHO en análisis de consumo

**Commit:** `dda1e52`  
**Archivos afectados:** 10 archivos en `src/`

#### Problema detectado

Todos los cálculos de consumo (km/L, historial de odómetro, alertas, reportes) filtraban únicamente `tipo === 'COMPRA'`. Los vehículos abastecidos exclusivamente mediante DESPACHO desde reservas internas quedaban excluidos de todos los análisis, mostrando "Sin datos de odómetro" aunque tuviesen múltiples registros.

#### Regla aplicada

| Cálculo | Tipos incluidos |
|---|---|
| Litros consumidos / km/L / odómetro / alertas | `COMPRA` + `DESPACHO` (ambos) |
| Monto gastado / gasto financiero | Solo `COMPRA` (DESPACHO no tiene precio directo) |

#### Archivos corregidos

| Archivo | Corrección |
|---|---|
| `src/pages/Alertas.jsx` | `AlertaRow` y `consumidoresConEstado` useMemo (dos puntos independientes) |
| `src/pages/Dashboard.jsx` | `alertasConsumo` filter |
| `src/pages/Catalogos.jsx` | `historialConductor` odómetro filter |
| `src/lib/fuel-analytics.js` | `consumoMovs` y `odometrosMes` derivados |
| `src/components/alertas/GraficoConsumoHistorico.jsx` | Filter de movimientos con consumo |
| `src/components/reportes/ReporteConsumo.jsx` | `movsConOdo` derivation |
| `src/components/reportes/LogConsumidorMovimientosModal.jsx` | `totalLitros` |
| `src/components/movimientos/LogConsumidorModal.jsx` | `totalLitros` |
| `src/components/movimientos/ConsumidorDetalleModal.jsx` | Stats completos reescritos |

---

### 3.3 Filtro URL por `movimientoId` en Movimientos

**Commit:** `dda1e52`  
**Archivo:** `src/pages/Movimientos.jsx`

Al hacer clic en "Ver →" en el modal de alertas críticas del Dashboard, el sistema navega a `/Movimientos?movimientoId=<id>` y:

1. Resalta únicamente ese movimiento en la tabla (oculta el resto)
2. Abre automáticamente el panel de detalle de ese movimiento
3. Muestra una barra de aviso azul con el nombre del consumidor
4. El botón "✕ Quitar filtro" limpia el parámetro y restaura la vista completa

Implementación con `useSearchParams` de react-router-dom y estado `pinMovId`.

---

### 3.4 Módulo de Rutas

**Commits:** `dda1e52` (implementación inicial), `1cbf9a6` (tipos de viaje y refinamientos)  
**Archivos:** `src/pages/Rutas.jsx`, `src/api/base44Client.js` (entidades `Ruta` y `AsignacionRuta`)

#### Descripción general

Módulo operativo independiente del combustible. Registra qué vehículo hizo qué trayecto cada día, complementando los registros de carga sin reemplazarlos.

#### Tablas en Supabase

| Tabla | Propósito |
|---|---|
| `ruta` | Catálogo de rutas predefinidas (nombre, puntos, distancia, frecuencia) |
| `asignacion_ruta` | Registro diario: vehículo + ruta + conductor + km reales + estado |

#### Migración SQL requerida

```sql
-- Tabla ruta
CREATE TABLE IF NOT EXISTS ruta (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre          TEXT NOT NULL,
  punto_inicio    TEXT,
  punto_fin       TEXT,
  municipio       TEXT,
  distancia_km    NUMERIC,
  tiempo_estimado TEXT,
  frecuencia      TEXT DEFAULT 'Diario',
  activa          BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Tabla asignacion_ruta
CREATE TABLE IF NOT EXISTS asignacion_ruta (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha                   DATE NOT NULL,
  tipo_viaje              TEXT DEFAULT 'regular',
  ruta_id                 UUID REFERENCES ruta(id),
  descripcion_emergencia  TEXT,
  consumidor_id           UUID,
  consumidor_nombre       TEXT,
  conductor_id            UUID,
  conductor_nombre        TEXT,
  km_reales               NUMERIC,
  observaciones           TEXT,
  estado                  TEXT DEFAULT 'completada',
  created_at              TIMESTAMPTZ DEFAULT now()
);

-- Columna tipo_viaje (si la tabla ya existe)
ALTER TABLE asignacion_ruta
  ADD COLUMN IF NOT EXISTS tipo_viaje TEXT DEFAULT 'regular';

UPDATE asignacion_ruta
SET tipo_viaje = CASE
  WHEN ruta_id IS NOT NULL THEN 'regular'
  ELSE 'viaje_extra'
END
WHERE tipo_viaje IS NULL;
```

#### Tipos de viaje

| Tipo | Descripción | Requiere ruta del catálogo |
|---|---|:---:|
| `regular` | Ruta planificada del catálogo | Sí |
| `carga_mercancias` | Viajes de los comerciales con mercancía | No |
| `mensajeria` | Entregas de documentos u objetos | No |
| `viaje_extra` | Salidas imprevistas o de contingencia | No |

#### Pestañas del módulo

- **Viajes del día:** selector de fecha + lista de asignaciones con badge de tipo y estado
- **Catálogo de rutas:** CRUD de rutas predefinidas, filtro Activas/Inactivas
- **Estadísticas:** rutas más frecuentes, actividad por vehículo, desglose porcentual por tipo de viaje

#### Restricciones operativas

- Solo los consumidores de tipo **vehículo** aparecen en el selector (se excluyen tanques, reservas, equipos y generadores por nombre de tipo).
- La relación con movimientos de combustible es **actualmente manual** (correlación por fecha + vehículo). Un enlace directo `asignacion_ruta_id` en `movimiento` es el siguiente paso recomendado para reportes cruzados precisos.

#### Roles con acceso

`superadmin`, `operador`, `auditor` (lectura)

---

### 3.5 Corrección de odómetro en vehículos abastecidos por DESPACHO

**Commit:** sesión en curso  
**Archivo:** `src/components/dashboard/ConsumidoresPorTipo.jsx`

#### Problema detectado

Las tarjetas del Dashboard para ciertos vehículos (ej. Mitsubishi Fuso) mostraban "—" en los campos de odómetro, km recorridos y consumo real pese a tener registros de DESPACHO con odómetro.

#### Causa raíz

La variable `comprasConOdo` se derivaba únicamente de `compras` (movimientos `tipo === 'COMPRA'`), ignorando completamente los `despachosRecibidos`, que también pueden llevar odómetro.

#### Corrección aplicada

```javascript
// Antes:
const comprasConOdo = compras.filter(m => m.odometro != null).sort(…);

// Después:
const abastecimientosConOdo = [...compras, ...despachosRecibidos]
  .filter(m => m.odometro != null)
  .sort((a, b) => (b.odometro || 0) - (a.odometro || 0));
```

Se aplicó la misma corrección a `indiceConsumoRealMes`, que ahora incluye `despachosRecibidosMes` en el cálculo del promedio de km/L.

---

### 3.6 Corrección de reportes: incluir DESPACHO en métricas de consumo

**Commit:** sesión en curso  
**Archivos:** `src/components/reportes/ReporteVehiculos.jsx`, `src/components/reportes/ReporteConsumo.jsx`

#### Regla de negocio consolidada

| Métrica | Tipos incluidos | Justificación |
|---|---|---|
| Litros consumidos, cargas, odómetro, km/L | `COMPRA` + `DESPACHO` | El combustible llega al vehículo por ambas vías |
| Monto / gasto financiero | Solo `COMPRA` | El DESPACHO es transferencia interna sin precio externo directo |

Esta regla ya se aplicaba en `ConsumidoresPorTipo.jsx` y `Alertas.jsx`. Los reportes estaban pendientes.

#### ReporteVehiculos.jsx — corrección

```javascript
// Antes: solo COMPRA → vehículos abastecidos solo por DESPACHO no aparecían
const movs = movimientos.filter(m => m.tipo === 'COMPRA' && m.consumidor_id === c.id);

// Después:
const movsAbast  = movimientos.filter(m => (m.tipo === 'COMPRA' || m.tipo === 'DESPACHO') && m.consumidor_id === c.id);
const movsCompra = movimientos.filter(m => m.tipo === 'COMPRA' && m.consumidor_id === c.id);
const litros = movsAbast.reduce((s, m) => s + (m.litros || 0), 0);
const monto  = movsCompra.reduce((s, m) => s + (m.monto  || 0), 0);
```

El desglose por combustible (`porComb`) también fue dividido: litros acumulados desde `movsAbast`, monto acumulado desde `movsCompra`.

#### ReporteConsumo.jsx — corrección

```javascript
// Antes: solo COMPRA → litrosTotal excluía DESPACHO
const movsCompra  = movimientos.filter(m => m.tipo === 'COMPRA' && m.consumidor_id === c.id);
const litrosTotal = movsCompra.reduce((s, m) => s + (m.litros || 0), 0);

// Después:
const movsAbast   = movimientos.filter(m => (m.tipo === 'COMPRA' || m.tipo === 'DESPACHO') && m.consumidor_id === c.id);
const movsCompra  = movimientos.filter(m => m.tipo === 'COMPRA' && m.consumidor_id === c.id);
const litrosTotal = movsAbast.reduce((s, m)  => s + (m.litros || 0), 0);
const montoTotal  = movsCompra.reduce((s, m) => s + (m.monto  || 0), 0);
const cargas      = movsAbast.length;
```

El cálculo de `consumoUltimo`, `consumoPromedio` y `historial` ya usaban COMPRA + DESPACHO correctamente (línea 39 de la versión anterior) — esos no necesitaron corrección.

---

### 3.7 Desglose mensual de consumo por vehículo

**Commit:** sesión en curso  
**Archivo:** `src/components/dashboard/ConsumidoresPorTipo.jsx`

#### Descripción

Cada tarjeta de vehículo o equipo en el Dashboard ahora incluye el botón **«Ver detalles por mes»**, que abre un modal con el historial de consumo desglosado mes a mes. Aparece cuando el consumidor tiene movimientos en 2 o más meses distintos.

#### Datos mostrados en el modal

| Columna | Cálculo | Fuente |
|---|---|---|
| Mes | Nombre localizado | — |
| Cargas | Número de movimientos del mes | COMPRA + DESPACHO |
| Litros | Total abastecido | COMPRA + DESPACHO |
| Monto | Gasto financiero | Solo COMPRA |
| Odo. inicio | Max odómetro antes del inicio del mes | COMPRA + DESPACHO |
| Odo. fin | Max odómetro dentro del mes | COMPRA + DESPACHO |
| Km rec. | Odo. fin − Odo. inicio | Calculado |
| km/L | Promedio de consumos_real del mes | COMPRA + DESPACHO |

El pie del modal muestra totales acumulados de todos los meses y el km/L promedio global.

#### Lógica de odómetro inicio

Para calcular correctamente el odómetro de inicio de cada mes, el sistema busca el odómetro máximo registrado en cualquier movimiento **anterior** al mes en cuestión. Esto garantiza que el "inicio" refleje la posición real del vehículo al arrancar ese mes, no el primero del mes con datos.

---

### 3.8 Centro de ayuda (`/Ayuda`) — actualizado

**Commits:** `1cbf9a6` (implementación), sesión en curso (actualización de contenido)  
**Archivo:** `src/pages/Ayuda.jsx`

Página de documentación completa del sistema, accesible para **todos los roles**.

#### Acceso

- **Botón flotante `?`** (azul, esquina inferior derecha) visible en todas las pantallas excepto la propia página de ayuda
- **Enlace "Centro de ayuda"** en el pie del sidebar desktop (junto al botón de cerrar sesión)

#### Secciones documentadas

| Sección | Contenido |
|---|---|
| Introducción | Flujo general, tipos de movimiento, roles de usuario |
| Movimientos | COMPRA vs DESPACHO, campos, fórmula km/L, filtros, acceso directo desde alertas |
| Dashboard | KPIs (Gasto, Litros comprados, Consumidores, Consumo crítico), fórmula de desviación, filtro de período, botón «Ver por mes» |
| Consumidores | Tipos, cálculo de stock de reservas, tabla de indicadores con fuentes de datos, desglose mensual por vehículo |
| Finanzas | Tarjetas corporativas, fórmula de saldo, explicación de compras directas vs. DESPACHO |
| Alertas | Fórmula de desviación, umbrales, historial gráfico, notificación por email |
| Reportes | Reporte de Consumidores (COMPRA+DESPACHO), Reporte de Consumo con km/L, regla de negocio consolidada |
| Rutas | Tipos de viaje, catálogo, estadísticas, relación con combustible |
| Conductores | Campos, conductor del mes |
| Catálogos | Parámetros técnicos, precios vigentes, fórmula de precio vigente |
| Configuración | Gestión de precios, importación masiva |
| Administración | Roles, audit log, trazabilidad de eliminaciones |
| Glosario | Términos técnicos definidos (COMPRA, DESPACHO, km/L, saldo, umbral, etc.) |

#### Características de la UI

- Sidebar navegable (desktop) / pills horizontales (mobile)
- Buscador de secciones
- Callout boxes de 4 tipos: `info`, `tip`, `warning`, `formula`
- Tablas de referencia rápida
- Fórmulas en bloque de código monoespacio
- Scroll al inicio al cambiar de sección

### 3.9 Bug: discrepancia entre «Stock en reserva» (Dashboard) y «Stock actual» (sección RESERVA)

**Archivo:** `src/pages/Dashboard.jsx`  
**Síntoma:** Para Gasolina Regular, el Dashboard mostraba 326 L (Stock en reserva) mientras la tarjeta de reserva mostraba 138 L (Stock actual). Diesel coincidía correctamente (130 L = 130 L).

#### Causa raíz

Ambos cálculos usan lógica distinta para los despachos:

| | Dashboard `litrosEnTanqueEstimado` | ConsumidoresPorTipo `stockActual` |
|---|---|---|
| Despachos (salidas) | `tipo=DESPACHO AND combustible_nombre='...' AND consumidor_origen_id EN reservas` | `tipo=DESPACHO AND consumidor_origen_id = este_tanque` |

Si algún DESPACHO desde la reserva tiene `combustible_nombre` nulo o con nombre distinto al exacto del catálogo, el Dashboard **no lo contabiliza como salida**, inflando el stock estimado. ConsumidoresPorTipo no filtra por nombre de combustible, por lo que siempre es correcto.

#### Fix aplicado

`litrosEnTanqueEstimado` se calcula ahora **tanque por tanque**, contando ALL despachos por `consumidor_origen_id` sin requerir `combustible_nombre`:

```javascript
const reservaTankIdsParaCombustible = new Set([
  ...comprasReservaHistoricas.map(m => m.consumidor_id).filter(Boolean),
  ...consumidores.filter(c => consumidoresReservaIds.has(c.id) && obtenerLitrosInicialesConsumidor(...) > 0).map(c => c.id),
]);
const litrosEnTanqueEstimado = Math.max(0,
  [...reservaTankIdsParaCombustible].reduce((total, tankId) => {
    const ini      = obtenerLitrosInicialesConsumidor(tank, combustibleIdRef, nombreCombustible);
    const entradas = comprasReservaHistoricas.filter(m => m.consumidor_id === tankId).reduce(...);
    const salidas  = movimientos.filter(m => m.tipo === 'DESPACHO' && m.consumidor_origen_id === tankId).reduce(...);
    return total + ini + entradas - salidas;
  }, 0)
);
```

Esto es idéntico a `stockActual` en ConsumidoresPorTipo: la fuente de verdad es el ID del tanque, no el nombre del combustible en el movimiento.

---

### 3.10 Descomposición del saldo final en Dashboard

**Archivos:** `src/pages/Dashboard.jsx`

Cuando en el período existen compras a reserva interna **y** compras directas a vehículos (sin pasar por reserva), el card de «Resumen por combustible» ahora muestra dos niveles de detalle adicional:

#### Sub-desglose bajo «+ Compras»

Aparece únicamente cuando `litrosComprasReservaMes > 0` **y** `litrosCompras − litrosComprasReservaMes > 0`:

```
↳ A reserva interna        XX.X L
↳ Compra directa vehículos YY.Y L
```

#### Descomposición bajo «Saldo final»

Aparece cuando hay stock estimado en reserva o compras directas en el período:

```
🛢 Stock en reserva               ZZ.Z L  ≈ $ 0,00
🚗 Compra directa (ya en vehículos) YY.Y L
```

Las dos sub-líneas bajo «Saldo final» **siempre suman exactamente el saldo final**:

- **🛢 En reserva (tanques)** = `litrosEnTanqueEstimado` — stock físico actual en tanques de la empresa
- **🚗 Ya en vehículos** = `litrosSaldoFinal − litrosEnTanqueEstimado` — porción del saldo ya distribuida a vehículos

El sub-desglose bajo «+ Compras» (separado) muestra cómo ingresó el combustible: `litrosComprasReservaMes` y `litrosCompras − litrosComprasReservaMes`. Esas dos líneas suman el total de compras del período, no el saldo.

Solo se renderiza cuando `litrosSaldoFinal > 0 && litrosEnTanqueEstimado > 0`.

---

### 3.10 Advertencia de odómetro inconsistente en desglose mensual

**Archivo:** `src/components/dashboard/ConsumidoresPorTipo.jsx`

El `monthlyStats` ahora calcula y expone el flag `odoInconsistente`:

```javascript
const odoInconsistente = odoInicioMes != null && odoFinMes != null && odoFinMes < odoInicioMes;
return { ..., odoInconsistente };
```

#### Comportamiento en la tabla «Ver detalles por mes»

| Condición | Visualización |
|---|---|
| `odoInconsistente = false` | Fila blanca normal |
| `odoInconsistente = true` | Fila con fondo **ámbar** |
| Odo. inicio / Odo. fin (inconsistente) | Texto **ámbar negrita** |
| Km rec. (inconsistente) | `⚠ —` (icono AlertTriangle + guion, en ámbar) |
| Nota al pie de la tabla | Banner ámbar con explicación cuando algún mes tiene la bandera activa |

#### Causa raíz (inconsistencia)

Ocurre cuando el odómetro ingresado en una carga del mes es **inferior** al máximo histórico anterior. El sistema usa el máximo odómetro antes del mes como `odoInicioMes`; si el `odoFinMes` del mes resulta menor, los km serían negativos, lo que físicamente es imposible. La solución correcta es revisar y corregir el movimiento con el odómetro erróneo en el módulo de Movimientos.

#### Segundo caso: km/L «pend.» — tramo aún no cerrado

Flag `sinCierre`: `conConsumo.length === 0 && conOdo.length > 0 && !odoInconsistente`

```javascript
const sinCierre = conConsumo.length === 0 && conOdo.length > 0 && !odoInconsistente;
```

| Estado km/L | Condición | Visualización |
|---|---|---|
| Valor numérico | `consumoReal != null` | Verde `XX.XX` |
| Tramo pendiente | `sinCierre = true` | `🕐 pend.` (slate-400, con tooltip) |
| Sin datos | `consumoReal == null && !sinCierre` | `—` (slate-300) |

El `consumo_real` se calcula **al registrar la siguiente carga** (usa el delta de odómetros). Por eso el mes más reciente suele mostrar «pend.»: las cargas tienen odómetro registrado, pero el tramo no se cierra hasta la próxima carga. Es comportamiento esperado; no requiere intervención. El banner de nota aparece bajo la tabla cuando algún mes tiene `sinCierre = true`.

---

## 4. Regla de negocio consolidada — COMPRA vs DESPACHO

Esta regla aplica de forma **uniforme** en todo el sistema desde la sesión 07/05/2026:

| Métrica / Cálculo | Tipos de movimiento incluidos |
|---|---|
| Litros abastecidos / consumidos | `COMPRA` + `DESPACHO` |
| Número de cargas (#Cargas, Eventos) | `COMPRA` + `DESPACHO` |
| Odómetro / Km recorridos / km/L | `COMPRA` + `DESPACHO` (ambos pueden registrar odómetro) |
| Alertas de consumo (desviación de rendimiento) | `COMPRA` + `DESPACHO` |
| Stock de reserva / tanque | `COMPRA` entrada, `DESPACHO` salida |
| Monto / Gasto financiero | Solo `COMPRA` (DESPACHO = transferencia interna, sin precio directo) |
| Saldo de tarjeta corporativa | Solo `COMPRA` |

**Archivos donde la regla está aplicada:**

| Archivo | Estado |
|---|---|
| `src/components/dashboard/ConsumidoresPorTipo.jsx` | ✅ Correcto |
| `src/components/reportes/ReporteVehiculos.jsx` | ✅ Correcto (fix sesión 07/05) |
| `src/components/reportes/ReporteConsumo.jsx` | ✅ Correcto (fix sesión 07/05) |
| `src/pages/Alertas.jsx` | ✅ Correcto (fix commit dda1e52) |
| `src/pages/Dashboard.jsx` | ✅ Correcto |
| `src/lib/fuel-analytics.js` | ✅ Correcto |
| `src/components/alertas/GraficoConsumoHistorico.jsx` | ✅ Correcto |
| `src/components/reportes/LogConsumidorMovimientosModal.jsx` | ✅ Correcto |
| `src/components/movimientos/ConsumidorDetalleModal.jsx` | ✅ Correcto |

---

## 4c. Arquitectura de roles — Resumen actualizado

| Rol | Movimientos | Finanzas | Catálogos | Alertas | Rutas | Reportes | Admin | Ayuda |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **superadmin** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **operador** | ✓ | — | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| **económico** | ✓ (lectura) | ✓ | — | — | — | ✓ | — | ✓ |
| **auditor** | ✓ (lectura) | — | — | — | ✓ (lectura) | ✓ | — | ✓ |

---

## 5. Historial de commits relevantes

| Commit | Fecha | Descripción |
|---|---|---|
| sesión en curso | 07/05/2026 | Fix ReporteVehiculos+ReporteConsumo DESPACHO, desglose mensual Dashboard, actualización Ayuda |
| `1cbf9a6` | 07/05/2026 | Centro de ayuda + tipos de viaje en Rutas |
| `dda1e52` | 07/05/2026 | Audit log, módulo Rutas, fix COMPRA/DESPACHO en Dashboard+Alertas, URL filtering |
| `323313d` | 26/04/2026 | UI improvements, role fixes, dashboard overhaul |
| `7c04f4c` | 26/04/2026 | Módulo Finanzas, fix acceso rol económico |
| `95b1ca9` | 26/04/2026 | Security hardening, feature completions |

---

## 6. Migraciones SQL pendientes de ejecutar en Supabase

Las siguientes sentencias deben ejecutarse en el **SQL Editor de Supabase** si aún no se han aplicado:

```sql
-- 1. Tabla de auditoría
CREATE TABLE IF NOT EXISTS audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ DEFAULT now(),
  user_id      UUID,
  user_email   TEXT,
  user_name    TEXT,
  action       TEXT NOT NULL,
  entity_type  TEXT,
  entity_id    TEXT,
  entity_label TEXT,
  payload      JSONB,
  metadata     JSONB
);
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_log_select" ON audit_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "audit_log_insert" ON audit_log FOR INSERT TO authenticated WITH CHECK (true);

-- 2. Tablas del módulo Rutas
CREATE TABLE IF NOT EXISTS ruta (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre          TEXT NOT NULL,
  punto_inicio    TEXT,
  punto_fin       TEXT,
  municipio       TEXT,
  distancia_km    NUMERIC,
  tiempo_estimado TEXT,
  frecuencia      TEXT DEFAULT 'Diario',
  activa          BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS asignacion_ruta (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha                   DATE NOT NULL,
  tipo_viaje              TEXT DEFAULT 'regular',
  ruta_id                 UUID REFERENCES ruta(id),
  descripcion_emergencia  TEXT,
  consumidor_id           UUID,
  consumidor_nombre       TEXT,
  conductor_id            UUID,
  conductor_nombre        TEXT,
  km_reales               NUMERIC,
  observaciones           TEXT,
  estado                  TEXT DEFAULT 'completada',
  created_at              TIMESTAMPTZ DEFAULT now()
);

-- 3. Columna tipo_viaje (si asignacion_ruta ya existía sin esa columna)
ALTER TABLE asignacion_ruta
  ADD COLUMN IF NOT EXISTS tipo_viaje TEXT DEFAULT 'regular';

UPDATE asignacion_ruta
SET tipo_viaje = CASE
  WHEN ruta_id IS NOT NULL THEN 'regular'
  ELSE 'viaje_extra'
END
WHERE tipo_viaje IS NULL;
```

---

## 7. Tareas pendientes

| Tarea | Prioridad | Notas |
|---|---|---|
| Ejecutar migraciones SQL de `audit_log` y tablas de Rutas en Supabase | **Alta** | Requerido para que auditoría y rutas funcionen en producción |
| Enlace directo `asignacion_ruta_id` en tabla `movimiento` | Media | Permitiría reportes cruzados ruta↔combustible precisos |
| Rol `conductor` para acceso móvil limitado al vehículo propio | Media | Arquitectura ya preparada (ver punto 1.9) |
| Integración con plataforma GPS para km automáticos | Baja | Requiere identificar API de la plataforma en uso (ver punto 1.10 Opción B) |

### ✅ Completadas en sesión 07/05/2026

| Tarea | Resultado |
|---|---|
| Fix odómetro en vehículos abastecidos solo por DESPACHO | Implementado en `ConsumidoresPorTipo.jsx` |
| Fix `ReporteVehiculos.jsx`: incluir DESPACHO en litros/cargas | Implementado |
| Fix `ReporteConsumo.jsx`: `litrosTotal` y `cargas` incluyen DESPACHO | Implementado |
| Desglose mensual «Ver detalles por mes» en tarjetas Dashboard | Implementado en `ConsumidoresPorTipo.jsx` |
| Actualizar `/Ayuda` con nomenclatura y fórmulas correctas | Implementado: KPIs, regla COMPRA+DESPACHO, desglose mensual documentados |
| Bug: `litrosEnTanqueEstimado` discrepaba con `stockActual` por filtro combustible_nombre en DESPACHO | Corregido en `Dashboard.jsx` — cálculo por tanque sin filtro combustible en salidas (sección 3.9) |
| Descomposición saldo final Dashboard (🛢 reserva / 🚗 directa) | Implementado en `Dashboard.jsx` (sección 3.10) |
| Advertencia ⚠ odómetro inconsistente en desglose mensual | Implementado en `ConsumidoresPorTipo.jsx` (sección 3.10) |
| Documentar ambas mejoras en `/Ayuda` y `REPORTE_DESARROLLO.md` | Implementado |
| Actualizar `REPORTE_DESARROLLO.md` | Este documento |

---

*Documento actualizado el 07/05/2026 (sesión en curso) · Sistema de Control de Combustible · InfElineas*
