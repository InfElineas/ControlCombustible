# WebCombustible — Contexto para Claude Code

## Qué es este proyecto
Sistema web de gestión y auditoría de combustible para una flota de vehículos y equipos. Registra cada carga, despacho, ruta GPS y alerta de consumo. Stack: React 18 + Vite + Supabase (PostgreSQL) + TanStack Query. Deploy en Apache (htaccess rewrite al index.html).

**Autenticación y autorización: elineas-auth (identity server), NO Supabase Auth.** El frontend nunca habla con Supabase: todo pasa por `gateway/` (Bun + Hono), que valida el JWT, pide los permisos al IS y reenvía con la `service_role`. Estado y plan de corte en `docs/migracion-is/ESTADO-Y-CORTE.md`.

## Stack y herramientas
- **Framework**: React 18 (JSX, no TSX)
- **Build**: Vite 6 — alias `@/` → `./src`
- **Backend**: Supabase — PostgreSQL + Realtime + Storage + Edge Functions (Deno/TypeScript). Sin Supabase Auth.
- **Pasarela**: `gateway/` (Bun + Hono) — `cd gateway && bun test` (165 pruebas + 14 de integración contra un IS real); despliegue con `docker-compose.prod.yml` (raíz)
- **Identidad**: elineas-auth — `src/api/authClient.js`; JWT de 5 min en memoria, token de sesión en el dispositivo
- **State**: TanStack Query v5 — QueryClient en `src/lib/query-client.js`
- **UI**: Tailwind CSS + Radix UI + shadcn/ui (`src/components/ui/`)
- **Iconos**: Lucide React
- **Mapas**: React Leaflet v4 + OSRM routing
- **GPS**: Traccar vía Edge Function proxy (`supabase/functions/gps-proxy/`)
- **Formularios**: React Hook Form + Zod
- **Exportación**: ExcelJS, jsPDF, html2canvas

## Estructura de archivos críticos
```
src/
  api/
    supabaseClient.js    ← supabase-js apuntando a la PASARELA (no a Supabase)
    authClient.js        ← sesión con elineas-auth: login, renovar JWT, Google PKCE
    base44Client.js      ← CRUD genérico + auditoría automática
    gpsClient.js         ← proxy a Traccar GPS
    routingClient.js     ← OSRM para geometría de rutas
    auditLog.js          ← logAudit() usado en base44Client
  lib/
    AuthContext.jsx      ← AuthProvider + useAuth()
    query-client.js      ← QueryClient singleton
    fuel-analytics.js    ← cálculos de rendimiento km/L
  pages/
    Dashboard.jsx        ← Inicio, KPIs, Flota GPS
    Movimientos.jsx      ← tabla COMPRA/DESPACHO/AJUSTE/DEPÓSITO
    Rutas.jsx            ← programa diario + stats + GPS vs Mov + mapa
    Catalogos.jsx        ← tipos combustible, tipos consumidor, tarjetas
    Finanzas.jsx         ← saldos por tarjeta, precios
    Alertas.jsx          ← alertas de consumo
    Reportes.jsx         ← exportación Excel/PDF
    Configuracion.jsx    ← GPS vinculación, importación, tipos
    AdminPanel.jsx       ← solo superadmin: usuarios y audit log
    Ayuda.jsx            ← documentación in-app interactiva
    Login.jsx            ← autenticación Supabase
  components/
    dashboard/           ← ConsumidoresPorTipo.jsx, GastosMensualesChart.jsx
    rutas/               ← MapaRutas.jsx, MarcadoresPanel.jsx, ReporteChatPanel.jsx
    movimientos/         ← NuevoMovimientoForm.jsx, EditarMovimientoModal.jsx
    ui/                  ← shadcn/ui (NO editar directamente)
    ui-helpers/          ← useUserRole, useTheme, ExportButton, CombustibleBadge, fmtL...
  Layout.jsx             ← sidebar + navbar + roles de acceso
  pages.config.js        ← mapa página→componente (auto-generado)
```

## Patrones de código establecidos

### Queries Supabase (TanStack Query)
```jsx
const { data: items = [] } = useQuery({
  queryKey: ['nombre-query', dependencia],
  queryFn: async () => {
    const { data } = await supabase
      .from('tabla')
      .select('col1, col2')
      .eq('campo', valor);
    return data ?? [];
  },
  staleTime: 5 * 60_000,
});
```

### Mutations con invalidación
```jsx
const mut = useMutation({
  mutationFn: d => base44.entities.Entidad.create(d),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['nombre-query'] });
    toast.success('Creado');
  },
  onError: () => toast.error('Error'),
});
```

### Formateo de litros (fmtL)
```js
// Definido localmente en cada archivo que lo usa:
const fmtL = n => (n % 1 === 0 ? String(Math.round(n)) : n.toFixed(1));
// Produce "150 L" en lugar de "150.0 L"
```

### Acceso por rol
```jsx
const { role, canWrite, canManageFinanzas } = useUserRole();
// Roles: superadmin | operador | auditor | economico | cajero (vienen del IS; `admin` del IS = superadmin)
```

## Variables de entorno requeridas
```
VITE_API_URL=...            (pasarela)
VITE_AUTH_URL=...           (elineas-auth)
VITE_SUPABASE_URL=...       (solo URL públicas de archivos)
SUPABASE_SERVICE_ROLE_KEY=eyJ...  (solo pasarela y Edge Functions; nunca al navegador)
# Ver .env.example y gateway/.env.example
```

## Tablas principales (Supabase)
- `consumidor` — vehículos, tanques, equipos (campo `gps_device_id` para GPS)
- `movimiento` — COMPRA | DESPACHO | AJUSTE | DEPÓSITO
- `asignacion_ruta` — viajes diarios + recorridos GPS automáticos (`tipo_viaje`)
- `tarjeta`, `conductor`, `ruta`, `marcador`, `ruta_marcador`
- `tipo_consumidor`, `tipo_combustible`, `precio_combustible`
- `config_alerta`, `audit_log`, `gps_session_cache` (`user_roles` queda obsoleta: los roles viven en el IS)

## Reglas de desarrollo
- El archivo `.htaccess` en `public/` se copia a `dist/` en cada build — no editarlo en `dist/`
- Todos los cambios de esquema van en `MIGRACION_GLOBAL.sql` Y en `migrations/YYYY-MM-DD_descripcion.sql`
- La autorización la decide la pasarela (`gateway/src/rules.ts`) con los permisos del IS; las políticas RLS dejan de ser la barrera. Un cambio de permisos = `rules.ts` + `catalogo.ts` + sus pruebas
- Los componentes de `src/components/ui/` son shadcn/ui — agregar con `npx shadcn@latest add nombre`, no editar manualmente
- El GPS proxy `gps-proxy` necesita secrets `TRACCAR_EMAIL` y `TRACCAR_PASSWORD` en Supabase → Functions → Secrets
- El cron `gps-daily-save` se ejecuta a las 23:55 hora Cuba — si no está activo, los recorridos deben guardarse manualmente desde el popup del mapa

## Comandos útiles
```bash
# Docker (copiar .env.example a .env y rellenar SUPABASE_*)
docker compose up -d --build                                  # desarrollo: web :5173 + pasarela :3010
docker compose -f docker-compose.prod.yml up -d --build        # producción: nginx :8080 + pasarela :3010

npm run dev          # Dev server en http://localhost:5173
npm run build        # Build en dist/
npm run lint         # Verificar código
npm run release:verify  # lint + build completo antes de deploy
```
