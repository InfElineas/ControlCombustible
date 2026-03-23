import { appEnv } from '@/config/env';

const supabaseUrl = String(appEnv.supabaseUrl || '').trim().replace(/\/+$/, '');

function parseOrder(orderBy) {
  if (!orderBy) return null;
  const desc = orderBy.startsWith('-');
  return {
    field: desc ? orderBy.slice(1) : orderBy,
    direction: desc ? 'desc' : 'asc',
  };
}

function buildHeaders(getAccessToken) {
  const token = typeof getAccessToken === 'function' ? getAccessToken() : null;
  return {
    apikey: appEnv.supabaseAnonKey,
    Authorization: `Bearer ${token || appEnv.supabaseAnonKey}`,
    'Content-Type': 'application/json',
  };
}

async function request(path, getAccessToken, authTokenKey, options = {}) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    ...options,
    headers: {
      ...buildHeaders(getAccessToken),
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    if (response.status === 401 && authTokenKey && typeof window !== 'undefined') {
      try {
        localStorage.removeItem(authTokenKey);
      } catch {
        // Ignorar errores de almacenamiento; la sesión ya es inválida.
      }
    }
    const errorBody = await response.text();
    throw new Error(`Supabase error (${response.status}): ${errorBody}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

export function createSupabaseRepository(tableName, getAccessToken, authTokenKey) {
  return {
    async list(orderBy, limit) {
      const params = new URLSearchParams({ select: '*' });
      const order = parseOrder(orderBy);
      if (order) params.set('order', `${order.field}.${order.direction}`);
      if (typeof limit === 'number') params.set('limit', String(limit));
      return request(`/rest/v1/${tableName}?${params.toString()}`, getAccessToken, authTokenKey);
    },
    async create(data) {
      const rows = await request(`/rest/v1/${tableName}`, getAccessToken, authTokenKey, {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(data),
      });
      return rows?.[0] || null;
    },
    async update(id, data) {
      const rows = await request(`/rest/v1/${tableName}?id=eq.${encodeURIComponent(id)}`, getAccessToken, authTokenKey, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(data),
      });
      return rows?.[0] || null;
    },
    async delete(id) {
      await request(`/rest/v1/${tableName}?id=eq.${encodeURIComponent(id)}`, getAccessToken, authTokenKey, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
      });
      return true;
    },
  };
}
