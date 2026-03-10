const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabaseRestUrl = supabaseUrl ? `${supabaseUrl}/rest/v1` : '';

if (!supabaseUrl || !supabaseAnonKey) {
   
  console.warn('Supabase env vars missing: configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
}

async function supabaseRequest(tableName, { method = 'GET', query = '', body } = {}) {
  const url = `${supabaseRestUrl}/${tableName}${query ? `?${query}` : ''}`;
  const response = await fetch(url, {
    method,
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${errorBody}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

const ENTITY_TABLES = {
  Tarjeta: 'tarjetas',
  Vehiculo: 'vehiculos',
  TipoCombustible: 'tipos_combustible',
  PrecioCombustible: 'precios_combustible',
  Movimiento: 'movimientos',
};

const PAGE_SIZE = 1000;

async function listAll(tableName, orderBy) {
  const descending = orderBy?.startsWith('-');
  const orderColumn = orderBy ? orderBy.replace('-', '') : 'created_at';

  let from = 0;
  let rows = [];

  while (true) {
    const query = new URLSearchParams({
      select: '*',
      order: `${orderColumn}.${!descending ? 'asc' : 'desc'}`,
      offset: String(from),
      limit: String(PAGE_SIZE),
    });

    const data = await supabaseRequest(tableName, { query: query.toString() });

    rows = rows.concat(data ?? []);
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

function createEntityApi(tableName) {
  return {
    async list(orderBy) {
      return listAll(tableName, orderBy);
    },
    async create(payload) {
      const data = await supabaseRequest(tableName, { method: 'POST', body: payload });
      return data?.[0] ?? data;
    },
    async update(id, payload) {
      const query = new URLSearchParams({ id: `eq.${id}` });
      const data = await supabaseRequest(tableName, { method: 'PATCH', query: query.toString(), body: payload });
      return data?.[0] ?? data;
    },
    async delete(id) {
      const query = new URLSearchParams({ id: `eq.${id}` });
      await supabaseRequest(tableName, { method: 'DELETE', query: query.toString() });
      return true;
    },
  };
}

export const base44 = {
  entities: Object.fromEntries(Object.entries(ENTITY_TABLES).map(([entity, table]) => [entity, createEntityApi(table)])),
  auth: {
    async me() {
      const role = localStorage.getItem('user_role') || 'admin';
      return { id: 'local-user', role };
    },
    logout() {
      localStorage.removeItem('user_role');
    },
    redirectToLogin() {
      window.location.assign('/');
    },
  },
};
