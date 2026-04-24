// Calcula el saldo actual de una tarjeta desde el ledger
export function calcularSaldo(tarjeta, movimientos) {
  const movsTarjeta = movimientos.filter(m => m.tarjeta_id === tarjeta.id);
  const totalRecargas = movsTarjeta
    .filter(m => m.tipo === 'RECARGA')
    .reduce((sum, m) => sum + (m.monto || 0), 0);
  const totalCompras = movsTarjeta
    .filter(m => m.tipo === 'COMPRA')
    .reduce((sum, m) => sum + (m.monto || 0), 0);
  return (tarjeta.saldo_inicial || 0) + totalRecargas - totalCompras;
}

// Obtiene el precio vigente para un combustible en una fecha
export function obtenerPrecioVigente(precios, combustibleId, fecha) {
  const preciosComb = precios
    .filter(p => p.combustible_id === combustibleId && p.fecha_desde <= fecha)
    .sort((a, b) => b.fecha_desde.localeCompare(a.fecha_desde));
  return preciosComb.length > 0 ? preciosComb[0].precio_por_litro : null;
}

// Formatea número como moneda con símbolo
export function formatMonto(amount, moneda = 'USD') {
  if (amount == null) return '—';
  const formatted = new Intl.NumberFormat('es-CU', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  }).format(amount);
  const symbolMap = { USD: '$', EUR: '€', CUP: '$', MLC: '$' };
  const symbol = symbolMap[moneda] || '$';
  return `${symbol} ${formatted}`;
}
