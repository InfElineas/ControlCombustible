/**
 * gps-daily-save — Edge Function
 *
 * Guarda el recorrido diario de cada vehículo GPS como AsignacionRuta
 * (tipo_viaje = 'recorrido_gps').  Omite vehículos con 0 km.
 * Evita duplicados: no inserta si ya existe registro hoy para ese vehículo.
 *
 * Invocación:
 *   - Automática: pg_cron a las 23:55 hora Cuba (ver MIGRACION_GLOBAL.sql §18)
 *   - Manual: desde el panel de Configuración o con curl + Bearer service_role_key
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TRACCAR_BASE = 'https://astrackcuba.alascloud.com/api';

function metersToKm(m: number): number {
  return Math.round(m / 100) / 10;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

// ── Sesión Traccar (reutiliza caché de gps-proxy) ─────────────────────────────

async function getSession(sb: ReturnType<typeof createClient>): Promise<string> {
  const { data } = await sb
    .from('gps_session_cache')
    .select('jsessionid, expires_at')
    .eq('id', 1)
    .maybeSingle();

  if (data?.jsessionid && new Date(data.expires_at) > new Date()) {
    return data.jsessionid;
  }

  const email    = Deno.env.get('TRACCAR_EMAIL');
  const password = Deno.env.get('TRACCAR_PASSWORD');
  if (!email || !password) throw new Error('TRACCAR_EMAIL / TRACCAR_PASSWORD no configurados');

  const resp = await fetch(`${TRACCAR_BASE}/session`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({ email, password }).toString(),
  });
  if (!resp.ok) throw new Error(`Traccar auth error: ${resp.status}`);

  const setCookie  = resp.headers.get('set-cookie') ?? '';
  const jsessionid = setCookie.match(/JSESSIONID=([^;]+)/)?.[1];
  if (!jsessionid) throw new Error('No JSESSIONID en respuesta Traccar');

  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  await sb.from('gps_session_cache')
    .upsert({ id: 1, jsessionid, expires_at: expiresAt, updated_at: new Date().toISOString() });

  return jsessionid;
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Verificar autorización: acepta service_role_key O JWT de usuario autenticado
    const authHeader = req.headers.get('Authorization') ?? '';
    const token      = authHeader.replace('Bearer ', '');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (token !== serviceKey) {
      const { data: { user } } = await sb.auth.getUser(token);
      if (!user) return json({ error: 'Unauthorized' }, 401);
    }

    const today = new Date().toISOString().slice(0, 10);
    const from  = encodeURIComponent(`${today}T00:00:00.000Z`);
    const to    = encodeURIComponent(`${today}T23:59:59.000Z`);

    // 1. Vehículos con GPS activos
    const { data: vehiculos, error: vehErr } = await sb
      .from('consumidor')
      .select('id, nombre, gps_device_id')
      .not('gps_device_id', 'is', null)
      .eq('activo', true);

    if (vehErr) return json({ error: vehErr.message }, 500);
    if (!vehiculos?.length) return json({ ok: true, saved: 0, msg: 'Sin vehículos GPS' });

    // 2. Registros ya guardados hoy (evitar duplicados)
    const { data: yaGuardados } = await sb
      .from('asignacion_ruta')
      .select('consumidor_id')
      .eq('fecha', today)
      .eq('tipo_viaje', 'recorrido_gps');

    const guardadosIds = new Set((yaGuardados ?? []).map((r: { consumidor_id: string }) => r.consumidor_id));
    const pendientes   = vehiculos.filter(v => !guardadosIds.has(v.id));

    if (!pendientes.length) return json({ ok: true, saved: 0, msg: 'Ya guardados hoy' });

    // 3. Sesión Traccar
    const jsessionid = await getSession(sb);
    const hdr = { Cookie: `JSESSIONID=${jsessionid}`, Accept: 'application/json' };

    // 4. Obtener resúmenes y posiciones actuales para cada vehículo pendiente
    const registros: object[] = [];

    for (const v of pendientes) {
      try {
        const [sumResp, posResp] = await Promise.all([
          fetch(`${TRACCAR_BASE}/reports/summary?deviceId=${v.gps_device_id}&from=${from}&to=${to}`, { headers: hdr }),
          fetch(`${TRACCAR_BASE}/positions?deviceId=${v.gps_device_id}`, { headers: hdr }),
        ]);

        const summary   = sumResp.ok ? await sumResp.json() : [];
        const positions = posResp.ok ? await posResp.json() : [];

        const distMetros = summary?.[0]?.distance ?? 0;
        if (distMetros === 0) continue;  // Sin recorrido — no guardar

        const km       = metersToKm(distMetros);
        const maxSpeed = summary?.[0]?.maxSpeed ?? null;
        const odo      = positions?.[0]?.attributes?.totalDistance != null
          ? metersToKm(positions[0].attributes.totalDistance)
          : null;

        const obs = [
          odo != null ? `Odómetro: ${odo.toLocaleString()} km` : null,
          maxSpeed   ? `Vel. máx: ${Math.round(maxSpeed)} km/h` : null,
        ].filter(Boolean).join(' | ');

        registros.push({
          fecha:                  today,
          consumidor_id:          v.id,
          consumidor_nombre:      v.nombre,
          km_reales:              km,
          descripcion_emergencia: `Recorrido GPS — ${v.nombre}`,
          observaciones:          obs || null,
          tipo_viaje:             'recorrido_gps',
          estado:                 'completada',
          fuente:                 'gps',
          ruta_id:                null,
        });
      } catch (err) {
        console.error(`[gps-daily-save] Error vehículo ${v.nombre}:`, err);
      }
    }

    if (registros.length) {
      const { error: insErr } = await sb.from('asignacion_ruta').insert(registros);
      if (insErr) return json({ error: insErr.message }, 500);
    }

    return json({ ok: true, saved: registros.length, skipped: pendientes.length - registros.length });

  } catch (err) {
    console.error('[gps-daily-save]', err);
    return json({ error: 'Error interno', detail: String(err) }, 500);
  }
});
