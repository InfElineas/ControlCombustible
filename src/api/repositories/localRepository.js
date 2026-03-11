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

export function createLocalRepository(tableName) {
  return {
    async list(orderBy, limit) {
      const sortedRows = sortRows(readRows(tableName), orderBy);
      return typeof limit === 'number' ? sortedRows.slice(0, limit) : sortedRows;
    },
    async create(data) {
      const rows = readRows(tableName);
      const row = {
        ...data,
        id: data.id || crypto.randomUUID(),
        created_date: data.created_date || new Date().toISOString(),
      };
      rows.push(row);
      writeRows(tableName, rows);
      return row;
    },
    async update(id, data) {
      const rows = readRows(tableName);
      const updated = rows.map((row) => (row.id === id ? { ...row, ...data } : row));
      writeRows(tableName, updated);
      return updated.find((row) => row.id === id) || null;
    },
    async delete(id) {
      const rows = readRows(tableName).filter((row) => row.id !== id);
      writeRows(tableName, rows);
      return true;
    },
  };
}
