// ¿Un error se arregla esperando (red, sesión, servidor caído) o hay que mirarlo?
//
// Lo usa la cola de escritura para decidir entre reintentar y mandar el registro
// a la bandeja de rechazados, y los formularios para decidir entre dejar un
// registro en espera o mostrar el error. Equivocarse en un sentido pierde
// registros buenos; en el otro, reintenta eternamente algo que nunca va a salir.

// Códigos de la pasarela que se resuelven solos:
//   · de token: se renueva en cuanto hay conexión con el servidor de identidad;
//   · de infraestructura: el IS o la base de datos no responden ahora mismo.
// FORBIDDEN, NO_ACCESS, BAD_BODY… NO están: son decisiones, no averías.
const CODIGOS_TRANSITORIOS = new Set([
  'UNAUTHORIZED', 'TOKEN_EXPIRED', 'TOKEN_INVALID', 'SESSION_REJECTED',
  'IS_UNAVAILABLE', 'DB_UNAVAILABLE', 'GPS_UNAVAILABLE', 'UPSTREAM_ERROR', 'RATE_LIMITED',
]);

/** @param {any} e */
export function esFalloDeRed(e) {
  // Un conflicto de estado no se arregla reintentando: alguien ya cambió el
  // registro y hace falta que una persona lo mire.
  if (e?.conflicto) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (CODIGOS_TRANSITORIOS.has(e?.code)) return true;
  const texto = `${e?.message ?? ''} ${e?.name ?? ''}`.toLowerCase();
  if (/jwt|token|not authenticated|unauthorized|refresh/.test(texto)) return true;
  if (e?.code === 'PGRST301' || e?.status === 401) return true;
  return !e?.code && /fetch|network|failed to fetch|timeout|aborted|conexi[oó]n|sin red/.test(texto);
}
