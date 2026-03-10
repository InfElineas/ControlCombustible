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

function seedDemoData() {
  const SEED_VERSION = '2';
  if (localStorage.getItem('cc_seed_version') === SEED_VERSION) return;

  const combustibles = [
    { id: 'comb-esp', nombre: 'Gasolina Especial', activa: true },
    { id: 'comb-dsl', nombre: 'Diesel', activa: true },
    { id: 'comb-reg', nombre: 'Gasolina Regular', activa: true },
  ];

  const tarjetas = [
    { id: 't1', id_tarjeta: '9240069992279149', alias: '', moneda: 'USD', saldo_inicial: 0, umbral_alerta: 500, activa: true },
    { id: 't2', id_tarjeta: '9240069992278321', alias: '', moneda: 'USD', saldo_inicial: 0, umbral_alerta: 500, activa: true },
    { id: 't3', id_tarjeta: '9240069994759765', alias: '', moneda: 'USD', saldo_inicial: 0, umbral_alerta: 500, activa: true },
  ];

  const vehiculos = [
    'Planta Electrica', 'P268177', 'W012193', 'W007500', 'W009449', 'Reserva', 'W007964', 'W004399',
    'W009531', 'W012023', 'W004393', 'W009534', 'W007893', 'W007892', 'W009428',
  ].map((chapa, idx) => ({ id: `v${idx + 1}`, chapa, alias: '', area_centro: '', activa: true }));

  const precios = [
    { id: 'p1', combustible_id: 'comb-dsl', combustible_nombre: 'Diesel', precio_por_litro: 1.3, fecha_desde: '2026-01-01' },
    { id: 'p2', combustible_id: 'comb-dsl', combustible_nombre: 'Diesel', precio_por_litro: 1.1, fecha_desde: '2026-01-20' },
    { id: 'p3', combustible_id: 'comb-esp', combustible_nombre: 'Gasolina Especial', precio_por_litro: 1.3, fecha_desde: '2026-01-01' },
    { id: 'p4', combustible_id: 'comb-reg', combustible_nombre: 'Gasolina Regular', precio_por_litro: 1.3, fecha_desde: '2026-01-01' },
  ];

  const recargas = [
    { id: 'm-r1', fecha: '2026-01-04', tipo: 'RECARGA', tarjeta_id: 't2', tarjeta_alias: '9240069992278321', monto: 1500 },
    { id: 'm-r2', fecha: '2026-01-20', tipo: 'RECARGA', tarjeta_id: 't1', tarjeta_alias: '9240069992279149', monto: 260 },
    { id: 'm-r3', fecha: '2026-01-20', tipo: 'RECARGA', tarjeta_id: 't2', tarjeta_alias: '9240069992278321', monto: 1820 },
    { id: 'm-r4', fecha: '2026-01-20', tipo: 'RECARGA', tarjeta_id: 't3', tarjeta_alias: '9240069994759765', monto: 1820 },
    { id: 'm-r5', fecha: '2026-02-02', tipo: 'RECARGA', tarjeta_id: 't2', tarjeta_alias: '9240069992278321', monto: 5000 },
    { id: 'm-r6', fecha: '2026-02-03', tipo: 'RECARGA', tarjeta_id: 't3', tarjeta_alias: '9240069994759765', monto: 4000 },
    { id: 'm-r7', fecha: '2026-02-03', tipo: 'RECARGA', tarjeta_id: 't3', tarjeta_alias: '9240069994759765', monto: 1000 },
  ];

  const compraBase = [
    ['2026-01-04', 'W012023', 'comb-dsl', 'Diesel', 28.6],
    ['2026-01-04', 'W009531', 'comb-dsl', 'Diesel', 107.25],
    ['2026-01-10', 'W009534', 'comb-esp', 'Gasolina Especial', 76.05],
    ['2026-01-13', 'W004393', 'comb-dsl', 'Diesel', 85.8],
    ['2026-01-14', 'P268177', 'comb-esp', 'Gasolina Especial', 84.5],
    ['2026-01-17', 'W009531', 'comb-dsl', 'Diesel', 100.1],
    ['2026-01-19', 'Reserva', 'comb-dsl', 'Diesel', 143],
    ['2026-01-22', 'W007964', 'comb-esp', 'Gasolina Especial', 76.05],
    ['2026-01-23', 'W009534', 'comb-reg', 'Gasolina Regular', 281.71],
    ['2026-01-24', 'W009534', 'comb-reg', 'Gasolina Regular', 54.34],
    ['2026-01-31', 'W007892', 'comb-dsl', 'Diesel', 200.2],
    ['2026-02-05', 'W009534', 'comb-esp', 'Gasolina Especial', 67.6],
    ['2026-02-10', 'W007892', 'comb-dsl', 'Diesel', 171.6],
    ['2026-02-11', 'W009428', 'comb-dsl', 'Diesel', 214.5],
    ['2026-02-15', 'W009534', 'comb-esp', 'Gasolina Especial', 76.05],
    ['2026-02-18', 'W004393', 'comb-dsl', 'Diesel', 85.8],
    ['2026-02-19', 'W009531', 'comb-dsl', 'Diesel', 71.5],
    ['2026-02-20', 'Reserva', 'comb-dsl', 'Diesel', 143],
    ['2026-02-21', 'W007964', 'comb-esp', 'Gasolina Especial', 76.05],
    ['2026-02-23', 'W012193', 'comb-dsl', 'Diesel', 114.4],
    ['2026-02-24', 'Reserva', 'comb-dsl', 'Diesel', 572],
    ['2026-02-25', 'Reserva', 'comb-esp', 'Gasolina Especial', 346.45],
    ['2026-02-26', 'W012193', 'comb-dsl', 'Diesel', 78.65],
    ['2026-02-27', 'Reserva', 'comb-dsl', 'Diesel', 519.09],
    ['2026-02-28', 'W007500', 'comb-dsl', 'Diesel', 146.41],
    ['2026-02-28', 'W009534', 'comb-esp', 'Gasolina Especial', 67.6],
    ['2026-02-28', 'W007964', 'comb-esp', 'Gasolina Especial', 84.5],
    ['2026-02-28', 'W009534', 'comb-esp', 'Gasolina Especial', 59.15],
    ['2026-02-28', 'W009534', 'comb-esp', 'Gasolina Especial', 59.15],
    ['2026-02-28', 'W012193', 'comb-dsl', 'Diesel', 121],
    ['2026-02-28', 'Reserva', 'comb-dsl', 'Diesel', 359.37],
    ['2026-02-28', 'W009428', 'comb-dsl', 'Diesel', 197.23],
    ['2026-02-28', 'W009449', 'comb-dsl', 'Diesel', 145.2],
    ['2026-02-28', 'W009534', 'comb-esp', 'Gasolina Especial', 67.6],
    ['2026-02-28', 'Reserva', 'comb-dsl', 'Diesel', 72.6],
    ['2026-02-28', 'W007893', 'comb-dsl', 'Diesel', 169.4],
    ['2026-02-28', 'Reserva', 'comb-dsl', 'Diesel', 72.6],
    ['2026-02-28', 'W009534', 'comb-esp', 'Gasolina Especial', 67.6],
    ['2026-02-28', 'Reserva', 'comb-esp', 'Gasolina Especial', 33.8],
  ];

  const compras = compraBase.map((r, idx) => {
    const [fecha, vehiculo, combustible_id, combustible_nombre, monto] = r;
    const card = idx % 3 === 0 ? tarjetas[0] : idx % 3 === 1 ? tarjetas[1] : tarjetas[2];
    const precio = combustible_id === 'comb-dsl' && fecha >= '2026-01-20' ? 1.1 : 1.3;
    return {
      id: `m-c${idx + 1}`,
      fecha,
      tipo: 'COMPRA',
      tarjeta_id: card.id,
      tarjeta_alias: card.id_tarjeta,
      monto,
      vehiculo_chapa: vehiculo,
      vehiculo_alias: vehiculo,
      combustible_id,
      combustible_nombre,
      precio,
      litros: Number((monto / precio).toFixed(1)),
      referencia: '',
    };
  });

  const movimientos = [...recargas, ...compras].map((m) => ({
    ...m,
    created_date: `${m.fecha}T08:00:00.000Z`,
  }));

  writeStore('combustibles', combustibles);
  writeStore('tarjetas', tarjetas);
  writeStore('vehiculos', vehiculos);
  writeStore('precios', precios);
  writeStore('movimientos', movimientos);
  localStorage.setItem('cc_seeded', '1');
  localStorage.setItem('cc_seed_version', SEED_VERSION);
}

seedDemoData();

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
