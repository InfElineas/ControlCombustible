**Welcome to your Base44 project** 

**About**

View and Edit  your app on [Base44.com](http://Base44.com) 

This project contains everything you need to run your app locally.

**Edit the code in your local development environment**

Any change pushed to the repo will also be reflected in the Base44 Builder.

**Prerequisites:** 

1. Clone the repository using the project's Git URL 
2. Navigate to the project directory
3. Install dependencies: `npm install`
4. Create an `.env.local` file and set the right environment variables

```
VITE_BASE44_APP_ID=your_app_id
VITE_BASE44_APP_BASE_URL=your_backend_url

e.g.
VITE_BASE44_APP_ID=cbef744a8545c389ef439ea6
VITE_BASE44_APP_BASE_URL=https://my-to-do-list-81bfaad7.base44.app
```

Run the app: `npm run dev`

Run conflict-marker check: `npm run check:conflicts`

**Publish your changes**

Open [Base44.com](http://Base44.com) and click on Publish.

**Docs & Support**

Documentation: [https://docs.base44.com/Integrations/Using-GitHub](https://docs.base44.com/Integrations/Using-GitHub)

Support: [https://app.base44.com/support](https://app.base44.com/support)


**Import seed data (Supabase)**

1. Place exported datasets under `seed-data/` (see `seed-data/manifest.json`).
2. Configure credentials in `.env.local` (recommended):

```
VITE_SUPABASE_URL=https://<tu-proyecto>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<tu-service-role-key>
```

3. Dry run (no DB writes): `npm run seed:import`
4. Apply import: `npm run seed:import:apply`

The importer respects relational order: `tipo_combustible` → `tipo_consumidor` → `vehiculo` → `tarjeta` → `consumidor` → `precio_combustible` → `config_alerta` → `movimiento`.

**Apply DB schema changes (Supabase)**

If the UI sends new fields (for example `consumidor.litros_iniciales`) and Supabase returns `400 Bad Request`, run the SQL migration in `migrations/` from Supabase SQL Editor.

Example migration for `litros_iniciales`:

- File: `migrations/2026-04-23_add_litros_iniciales_to_consumidor.sql`
- SQL:
  - `ALTER TABLE consumidor ADD COLUMN IF NOT EXISTS litros_iniciales numeric DEFAULT 0 NOT NULL;`
  - `UPDATE consumidor SET litros_iniciales = 0 WHERE litros_iniciales IS NULL;`
