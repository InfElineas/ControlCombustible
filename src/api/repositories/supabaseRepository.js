import { appEnv } from '@/config/env';

const supabaseUrl = String(appEnv.supabaseUrl || '').trim().replace(/\/+$/, '');

function buildHeaders() {
  return {
    apikey: appEnv.supabaseAnonKey,
    Authorization: `Bearer ${appEnv.supabaseAnonKey}`,
    'Content-Type': 'application/json',
  };
}

function parseOrder(orderBy) {
  if (!orderBy) return null;
  const desc = orderBy.startsWith('-');
  return {
    field: desc ? orderBy.slice(1) : orderBy,
    direction: desc ? 'desc' : 'asc',
  };
}

async function request(path, options = {}) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    ...options,
    headers: {
      ...buildHeaders(),
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase error (${response.status}): ${errorBody}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

export function createSupabaseRepository(tableName) {
  return {
    async list(orderBy, limit) {
      const params = new URLSearchParams({ select: '*' });
      const order = parseOrder(orderBy);
      if (order) params.set('order', `${order.field}.${order.direction}`);
      if (typeof limit === 'number') params.set('limit', String(limit));
      return request(`/rest/v1/${tableName}?${params.toString()}`);
    },
    async create(data) {
      const rows = await request(`/rest/v1/${tableName}`, {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(data),
      });
      return rows?.[0] || null;
    },
    async update(id, data) {
      const rows = await request(`/rest/v1/${tableName}?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(data),
      });
      return rows?.[0] || null;
    },
    async delete(id) {
      await request(`/rest/v1/${tableName}?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
      });
      return true;
    },
  };
}
