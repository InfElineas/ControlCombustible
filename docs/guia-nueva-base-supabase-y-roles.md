# Guía: vincular el proyecto a una nueva base de datos Supabase + roles (superadmin, gestor, auditor)

Fecha: 2026-03-20

## 1) Vincular el repo a tu nuevo proyecto Supabase

> Requisitos: `supabase` CLI instalada y sesión iniciada (`supabase login`).

1. Verifica estado actual:

```bash
supabase status
```

2. Vincula el proyecto local al nuevo proyecto remoto:

```bash
supabase link --project-ref <NUEVO_PROJECT_REF>
```

3. Configura variables de entorno del frontend en `.env.local`:

```bash
VITE_DATA_MODE=supabase
VITE_SUPABASE_URL=https://<NUEVO_PROJECT_REF>.supabase.co
VITE_SUPABASE_ANON_KEY=<NUEVA_ANON_KEY>
```

4. Reinicia frontend:

```bash
npm run dev
```

## 2) Crear el esquema en la nueva base

Si la base está vacía, aplica migraciones:

```bash
supabase db push
```

Si prefieres SQL manual, ejecuta `supabase/schema.sql` desde el SQL Editor de Supabase.

## 3) Modelo de roles implementado

Roles válidos:

- `superadmin`: acceso total, incluida gestión de usuarios/roles.
- `gestor`: puede crear/editar/eliminar datos operativos (movimientos, catálogos).
- `auditor`: solo lectura.

### Reglas principales

- Lectura: usuarios autenticados.
- Escritura: solo `gestor` y `superadmin`.
- Gestión de perfiles/roles: solo `superadmin`.

## 4) Asignar roles a usuarios

1. Promover primer superadmin:

```sql
select public.promote_superadmin_by_email('tu_correo@dominio.com');
```

2. Asignar rol por correo (función nueva):

```sql
select public.set_user_role_by_email('gestor@dominio.com', 'gestor');
select public.set_user_role_by_email('auditor@dominio.com', 'auditor');
```

3. Verificar:

```sql
select p.role, u.email
from public.perfiles p
join auth.users u on u.id = p.user_id
order by p.created_date desc;
```

## 5) Migrar roles antiguos (si vienes de admin/operador)

La migración `20260320110000_roles_gestor_auditor.sql` hace este mapeo automáticamente:

- `admin` -> `gestor`
- `operador` -> `auditor`

## 6) Validación rápida en la app

1. Inicia sesión con un usuario `auditor`:
   - Debe poder ver dashboard, movimientos y reportes.
   - No debe poder entrar/editar páginas de catálogos (`Tarjetas`, `Vehiculos`, `Combustibles`, `Precios`).

2. Inicia sesión con un usuario `gestor`:
   - Debe poder visualizar y modificar datos operativos.

3. Inicia sesión con `superadmin`:
   - Debe tener acceso completo y poder gestionar roles vía SQL/funciones.
