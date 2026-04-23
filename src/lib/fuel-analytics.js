export function getMonthOptionsFromMovimientos(movimientos = []) {
  const keys = [...new Set(movimientos.map((m) => m.fecha?.slice(0, 7)).filter(Boolean))]
    .sort((a, b) => b.localeCompare(a));
  return [{ key: 'ALL', label: 'Todo' }, ...keys.map((k) => {
    const [y, m] = k.split('-').map(Number);
    const d = new Date(y, (m || 1) - 1, 1);
    return { key: k, label: d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }) };
  })];
}

export function filterMovimientosByMonth(movimientos = [], month = 'ALL') {
  if (!month || month === 'ALL') return movimientos;
  return movimientos.filter((m) => m.fecha?.startsWith(month));
}

export function computeChoferDelMes({ month = 'ALL', movimientos = [], conductores = [] }) {
  const movs = filterMovimientosByMonth(movimientos, month)
    .filter((m) => m.tipo === 'COMPRA' || m.tipo === 'DESPACHO');

  const byVehiculo = Object.fromEntries(
    conductores
      .filter((c) => c.vehiculo_asignado_chapa)
      .map((c) => [String(c.vehiculo_asignado_chapa).toLowerCase(), c]),
  );

  const score = {};
  movs.forEach((m) => {
    const chapa = String(m.vehiculo_chapa || '').toLowerCase();
    const conductor = byVehiculo[chapa];
    if (!conductor) return;
    if (!score[conductor.id]) score[conductor.id] = { conductor, litros: 0, movimientos: 0, monto: 0 };
    score[conductor.id].litros += m.litros || 0;
    score[conductor.id].monto += m.monto || 0;
    score[conductor.id].movimientos += 1;
  });

  const ranking = Object.values(score).sort((a, b) => {
    if (b.litros !== a.litros) return b.litros - a.litros;
    return b.movimientos - a.movimientos;
  });

  return ranking[0] || null;
}

export function computeVehiculoMonthlyStats(vehiculo, movimientos = [], month = 'ALL', today = new Date()) {
  const chapa = vehiculo?.chapa;
  const movsVeh = movimientos
    .filter((m) => m.vehiculo_chapa === chapa)
    .sort((a, b) => String(a.fecha || '').localeCompare(String(b.fecha || '')));

  const movsMes = filterMovimientosByMonth(movsVeh, month);
  const comprasMes = movsMes.filter((m) => m.tipo === 'COMPRA');

  const litrosMes = comprasMes.reduce((s, m) => s + (m.litros || 0), 0);
  const consumoMes = comprasMes
    .filter((m) => m.consumo_real != null)
    .reduce((s, m) => s + (m.consumo_real || 0), 0);

  const odometrosMes = comprasMes.filter((m) => m.odometro != null).map((m) => Number(m.odometro));
  const odometroInicio = odometrosMes.length > 0 ? Math.min(...odometrosMes) : null;

  const ultimaCarga = [...movsVeh].reverse().find((m) => m.tipo === 'COMPRA');
  const fechaUltimoAbastecimiento = ultimaCarga?.fecha || null;

  let diasDesdeUltimoAbast = null;
  if (fechaUltimoAbastecimiento) {
    const f = new Date(fechaUltimoAbastecimiento);
    if (!Number.isNaN(f.getTime())) {
      diasDesdeUltimoAbast = Math.floor((today - f) / (1000 * 60 * 60 * 24));
    }
  }

  return {
    litrosMes,
    consumoMes,
    odometroInicio,
    ultimaCarga,
    fechaUltimoAbastecimiento,
    diasDesdeUltimoAbast,
  };
}
