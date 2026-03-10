const ENTITY_MAP = {
  Tarjeta: 'tarjetas',
  Vehiculo: 'vehiculos',
  TipoCombustible: 'combustibles',
  PrecioCombustible: 'precios',
  Movimiento: 'movimientos',
};

function readRows(key) {
  try {
    return JSON.parse(localStorage.getItem(`cc_${key}`) || '[]');
  } catch {
    return [];
  }
}

function writeRows(key, rows) {
  localStorage.setItem(`cc_${key}`, JSON.stringify(rows));
}

function sortRows(rows, orderBy) {
  if (!orderBy) return rows;
  const descending = orderBy.startsWith('-');
  const field = descending ? orderBy.slice(1) : orderBy;
  return [...rows].sort((a, b) => {
    const av = a?.[field] ?? '';
    const bv = b?.[field] ?? '';
    return descending ? String(bv).localeCompare(String(av)) : String(av).localeCompare(String(bv));
  });
}

function createEntity(key) {
  return {
    async list(orderBy) {
      return sortRows(readRows(key), orderBy);
    },
    async create(data) {
      const rows = readRows(key);
      const row = { ...data, id: data.id || crypto.randomUUID(), created_date: new Date().toISOString() };
      rows.push(row);
      writeRows(key, rows);
      return row;
    },
    async update(id, data) {
      const rows = readRows(key);
      const updated = rows.map((row) => (row.id === id ? { ...row, ...data } : row));
      writeRows(key, updated);
      return updated.find((row) => row.id === id) || null;
    },
    async delete(id) {
      const rows = readRows(key).filter((row) => row.id !== id);
      writeRows(key, rows);
      return true;
    },
  };
}

export const base44 = {
  entities: Object.fromEntries(Object.entries(ENTITY_MAP).map(([name, key]) => [name, createEntity(key)])),
  auth: {
    async me() {
      return { id: 'local-user', role: 'admin', full_name: 'Administrador' };
    },
    logout() {},
    redirectToLogin() {},
  },
};
