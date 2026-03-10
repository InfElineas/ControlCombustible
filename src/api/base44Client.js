const ENTITY_KEYS = {
  Tarjeta: 'tarjetas',
  Vehiculo: 'vehiculos',
  TipoCombustible: 'combustibles',
  PrecioCombustible: 'precios',
  Movimiento: 'movimientos',
};

function readStore(key) {
  try {
    return JSON.parse(localStorage.getItem(`cc_${key}`) || '[]');
  } catch {
    return [];
  }
}

function writeStore(key, data) {
  localStorage.setItem(`cc_${key}`, JSON.stringify(data));
}

function sortBy(rows, orderBy) {
  if (!orderBy) return rows;
  const desc = orderBy.startsWith('-');
  const field = desc ? orderBy.slice(1) : orderBy;
  return [...rows].sort((a, b) => {
    const av = a?.[field];
    const bv = b?.[field];
    if (av === bv) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return desc ? String(bv).localeCompare(String(av)) : String(av).localeCompare(String(bv));
  });
}

function createEntityApi(key) {
  return {
    async list(orderBy) {
      return sortBy(readStore(key), orderBy);
    },
    async create(payload) {
      const rows = readStore(key);
      const item = { ...payload, id: payload.id || crypto.randomUUID(), created_date: new Date().toISOString() };
      rows.push(item);
      writeStore(key, rows);
      return item;
    },
    async update(id, payload) {
      const rows = readStore(key);
      const next = rows.map((r) => (r.id === id ? { ...r, ...payload } : r));
      writeStore(key, next);
      return next.find((r) => r.id === id);
    },
    async delete(id) {
      const rows = readStore(key).filter((r) => r.id !== id);
      writeStore(key, rows);
      return true;
    },
  };
}

export const base44 = {
  entities: Object.fromEntries(Object.entries(ENTITY_KEYS).map(([name, key]) => [name, createEntityApi(key)])),
  auth: {
    async me() {
      return { id: 'local-user', role: 'admin', full_name: 'Administrador' };
    },
    logout() {},
    redirectToLogin() {},
  },
};
