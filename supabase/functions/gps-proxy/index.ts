import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TRACCAR_BASE = 'https://astrackcuba.alascloud.com/api';

// Rutas permitidas — seguridad explícita, no se proxean rutas arbitrarias
const ALLOWED_PATHS = [
  '/devices',
  '/positions',
  '/reports/route',
  '/reports/summary',
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

// ── Sesión Traccar ────────────────────────────────────────────────────────────

async function getOrCreateSession(supabase: ReturnType<typeof createClient>): Promise<string> {
  const { data } = await supabase
    .from('gps_session_cache')
    .select('jsessionid, expires_at')
    .eq('id', 1)
    .maybeSingle();

  if (data?.jsessionid && new Date(data.expires_at) > new Date()) {
    return data.jsessionid;
  }

  return createTraccarSession(supabase);
}

async function createTraccarSession(supabase: ReturnType<typeof createClient>): Promise<string> {
  const email    = Deno.env.get('TRACCAR_EMAIL');
  const password = Deno.env.get('TRACCAR_PASSWORD');

  if (!email || !password) throw new Error('TRACCAR_EMAIL / TRACCAR_PASSWORD no configurados');

  const resp = await fetch(`${TRACCAR_BASE}/session`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({ email, password }).toString(),
  });

  if (!resp.ok) throw new Error(`Traccar auth error: ${resp.status}`);

  const setCookie = resp.headers.get('set-cookie') ?? '';
  const match     = setCookie.match(/JSESSIONID=([^;]+)/);
  if (!match) throw new Error('No JSESSIONID en la respuesta de Traccar');

  const jsessionid = match[1];
  // Expira en 12 horas para forzar re-auth preventivo antes del vencimiento real
  const expiresAt  = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();

  await supabase
    .from('gps_session_cache')
    .upsert({ id: 1, jsessionid, expires_at: expiresAt, updated_at: new Date().toISOString() });

  return jsessionid;
}

async function traccarFetch(path: string, jsessionid: string): Promise<Response> {
  return fetch(`${TRACCAR_BASE}${path}`, {
    headers: {
      'Cookie': `JSESSIONID=${jsessionid}`,
      'Accept': 'application/json',
    },
  });
}

// ── Handler principal ─────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    // Verificar autenticación Supabase
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: { user } } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (!user) return json({ error: 'Unauthorized' }, 401);

    // Leer y validar el path a proxear
    const url  = new URL(req.url);
    const path = url.searchParams.get('path') ?? '/devices';

    const isAllowed = ALLOWED_PATHS.some(p => path.startsWith(p));
    if (!isAllowed) return json({ error: `Path no permitido: ${path}` }, 403);

    // Obtener sesión Traccar (cacheada o nueva)
    let jsessionid = await getOrCreateSession(supabase);

    // Hacer la petición a Traccar
    let traccarResp = await traccarFetch(path, jsessionid);

    // Si la sesión expiró (401), re-autenticar y reintentar una vez
    if (traccarResp.status === 401) {
      jsessionid  = await createTraccarSession(supabase);
      traccarResp = await traccarFetch(path, jsessionid);
    }

    if (!traccarResp.ok) {
      return json({ error: `Traccar error: ${traccarResp.status}` }, traccarResp.status);
    }

    const data = await traccarResp.json();
    return json(data);

  } catch (err) {
    console.error('[gps-proxy]', err);
    return json({ error: 'Error interno', detail: String(err) }, 500);
  }
});
