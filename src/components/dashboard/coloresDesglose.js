// Colores de los desgloses del panel de inicio.
//
// Vive aparte porque lo usan el gráfico de gastos y el resumen de consumo: si
// cada uno tuviera su tabla, el mismo concepto saldría de un color en un sitio
// y de otro justo debajo.

export const SIN_COMBUSTIBLE = 'Sin combustible';
export const SIN_CONCEPTO    = 'Sin concepto';

// Los mismos que CombustibleBadge, para que un combustible se reconozca por su
// color en todo el sistema.
const COLOR_COMBUSTIBLE = {
  diesel:   '#f59e0b',
  especial: '#3b82f6',
  regular:  '#22c55e',
};

const claveCombustible = (nombre) => {
  const n = (nombre || '').toLowerCase();
  if (n.includes('diesel'))   return 'diesel';
  if (n.includes('especial')) return 'especial';
  if (n.includes('regular'))  return 'regular';
  return null;
};

// Para los conceptos no hay convención previa. El color sale de la posición en
// la lista, y la lista se ordena alfabéticamente, no por orden de llegada de
// los datos: así un concepto no cambia de color según qué mes traiga registros.
export const PALETA = ['#0ea5e9', '#8b5cf6', '#f43f5e', '#14b8a6', '#f59e0b', '#64748b', '#84cc16', '#ec4899'];

export const GRIS_SIN_DATO = '#cbd5e1';

export function colorDeSerie(serie, dimension, indice) {
  if (serie === SIN_COMBUSTIBLE || serie === SIN_CONCEPTO) return GRIS_SIN_DATO;
  if (dimension === 'combustible') {
    const clave = claveCombustible(serie);
    if (clave) return COLOR_COMBUSTIBLE[clave];
  }
  return PALETA[indice % PALETA.length];
}

/** Ordena las series alfabéticamente y deja «sin dato» al final. */
export function ordenarSeries(nombres) {
  const conDato = [...nombres]
    .filter(s => s !== SIN_COMBUSTIBLE && s !== SIN_CONCEPTO)
    .sort((a, b) => a.localeCompare(b, 'es'));
  if (nombres.has ? nombres.has(SIN_COMBUSTIBLE) : nombres.includes(SIN_COMBUSTIBLE)) conDato.push(SIN_COMBUSTIBLE);
  if (nombres.has ? nombres.has(SIN_CONCEPTO)    : nombres.includes(SIN_CONCEPTO))    conDato.push(SIN_CONCEPTO);
  return conDato;
}

/**
 * Consumidor → nombre de su concepto, en dos saltos: el consumidor dice su tipo
 * y el tipo dice bajo qué concepto se cuenta lo que gasta.
 */
export function mapaConceptoPorConsumidor(consumidores, tiposConsumidor, conceptos) {
  const nombrePorId    = new Map(conceptos.map(c => [c.id, c.nombre]));
  const conceptoDeTipo = new Map(tiposConsumidor.map(t => [t.id, nombrePorId.get(t.concepto_id)]));
  return new Map(consumidores.map(c => [c.id, conceptoDeTipo.get(c.tipo_consumidor_id) || null]));
}
