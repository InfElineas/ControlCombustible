// Cómo se reconoce una bonificación de combustible.
//
// Su despacho guarda en el destino lo que hubiera a mano el día que se escribió
// —la bolsa de logística, o el nombre del propio trabajador—, y ese nombre
// cambia entre instalaciones y con el tiempo. Comparar contra un nombre exacto
// deja fuera todo lo que no se llame así, que es justo lo que pasaba: la
// tarjeta de litros consumidos solo apartaba lo llamado «Uso Logístico» y
// contaba el resto como consumo de flota.
//
// La referencia, en cambio, la escribe siempre el mismo código y está en todas
// desde el principio. Vive aquí porque de esta regla dependen tanto el resumen
// del panel como el desglose de litros por concepto, y si cada uno tuviera la
// suya acabarían discrepando.
export const MARCA_BONIFICACION = 'bonificación combustible:';

export const esBonificacion = m =>
  (m?.referencia || '').toLowerCase().startsWith(MARCA_BONIFICACION);

/** «Bonificación combustible: Juan Pérez CI:123» → «Juan Pérez» */
export function beneficiarioDe(referencia) {
  const resto = (referencia || '').slice(MARCA_BONIFICACION.length).trim();
  const nombre = resto.split(/\s+CI:/i)[0].trim();
  return nombre || 'Sin beneficiario';
}
