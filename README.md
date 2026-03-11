# Control Combustible

Aplicación React para control de tarjetas, combustible, movimientos y reportes.

## Mejoras de composición aplicadas

- Se separó la capa de datos en repositorios (`local` y `supabase`) para desacoplar UI de infraestructura.
- Se agregó configuración centralizada de entorno en `src/config/env.js`.
- Se mantuvo compatibilidad con el contrato existente (`base44.entities.*`) para no romper páginas ni hooks.
- Se adaptó `vite.config.js` para funcionar aun cuando el plugin de Base44 no esté instalado en local.

## Modos de datos

### 1) Local (por defecto)
Usa `localStorage` y no requiere backend.

```bash
VITE_DATA_MODE=local
```

### 2) Supabase (preparado)
Usa REST API de Supabase.

```bash
VITE_DATA_MODE=supabase
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

> Copia `.env.example` a `.env.local` y ajusta valores.

## Preparación de base de datos real en Supabase

1. Crear proyecto en Supabase.
2. Ejecutar `supabase/schema.sql` en SQL Editor.
3. Revisar y endurecer políticas RLS por organización/rol antes de producción.
4. Configurar providers de Auth (ej. Google) y URL de redirección.
5. Pasar a `VITE_DATA_MODE=supabase`.

## Desarrollo

```bash
npm install
npm run dev
```

## Verificación

```bash
npm run lint
npm run typecheck
npm run build
```

## Troubleshooting Supabase

Si el navegador muestra `DNS_PROBE_FINISHED_NXDOMAIN` al iniciar sesión, revisa:

1. Que `VITE_SUPABASE_URL` sea el dominio real de tu proyecto (`https://<project-ref>.supabase.co`).
2. Que estés editando `.env.local` o `.env` (no solo `.env.example`).
3. Reiniciar `npm run dev` después de cambiar variables de entorno.
4. En Supabase Auth > URL Configuration, agregar `http://localhost:5173` como redirect permitido.
5. Si `npm run dev` parece "congelado", revisa `http://localhost:5173` igualmente: Vite permanece en ejecución a la espera de conexiones.

La app guarda automáticamente el `access_token` devuelto por Supabase en el hash de la URL al volver del login social.


## Nota plugin Base44

Por defecto el plugin de Base44 queda desactivado en local para evitar warnings/bloqueos.

```bash
VITE_ENABLE_BASE44_PLUGIN=false
```

Si necesitas activarlo explícitamente:

```bash
VITE_ENABLE_BASE44_PLUGIN=true
```

## Fallback local automático

Si `VITE_DATA_MODE=supabase` pero no hay sesión activa en localhost, la app entra en fallback local para que puedas abrirla y seguir trabajando sin bloqueo de login.


## Roles de usuarios en Supabase

El sistema ahora usa la tabla `public.perfiles` para roles (`operador`, `admin`, `superadmin`).

1. Ejecuta de nuevo `supabase/schema.sql` para crear `public.perfiles`, trigger y backfill.
2. Si aún no tienes superadmin, promueve el primer usuario por email:

```sql
select public.promote_superadmin_by_email('tu_email@dominio.com');
```

3. Verifica roles:

```sql
select p.role, u.email
from public.perfiles p
join auth.users u on u.id = p.user_id
order by p.created_date desc;
```

4. Cambia roles manualmente cuando ya exista superadmin:

```sql
update public.perfiles
set role = 'admin'
where user_id = '<UUID_DEL_USUARIO>';
```

> Nota: `base44.auth.me()` prioriza el rol en `public.perfiles`; si no existe perfil, usa `user_metadata` como fallback.
