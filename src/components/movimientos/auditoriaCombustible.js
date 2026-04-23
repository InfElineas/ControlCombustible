export const AUDITORIA_ESTADO = {
  OK: 'ok',
  EXCESO: 'exceso',
  SIN_CAPACIDAD: 'sin_capacidad',
  SIN_ESTIMACION: 'sin_estimacion',
};

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const normalizeDate = (value) => {
  if (!value) return null;
  const s = String(value);
  return s.slice(0, 10);
};

const isOnOrBefore = (candidate, limit) => {
  const a = normalizeDate(candidate);
  const b = normalizeDate(limit);
  if (!a || !b) return false;
  return a <= b;
};

export const obtenerCapacidadTanque = (consumidor) => {
  const capacidad = toNumber(consumidor?.datos_vehiculo?.capacidad_tanque);
  return capacidad && capacidad > 0 ? capacidad : null;
};

export const calcularAuditoriaCompra = ({
  movimientos = [],
  consumidorId,
  combustibleId,
  fecha,
  litrosAbastecidos,
  capacidadTanque,
  excludeMovimientoId,
}) => {
  const litros = toNumber(litrosAbastecidos);
  if (!consumidorId || !combustibleId || !fecha || !litros || litros <= 0) {
    return { estado: AUDITORIA_ESTADO.SIN_ESTIMACION };
  }

  const historico = movimientos.filter((m) => {
    if (!m?.id || m.id === excludeMovimientoId) return false;
    if (!isOnOrBefore(m.fecha, fecha)) return false;
    return m.combustible_id === combustibleId;
  });

  const comprasPrevias = historico
    .filter((m) => m.tipo === 'COMPRA' && m.consumidor_id === consumidorId)
    .reduce((sum, m) => sum + (toNumber(m.litros) || 0), 0);

  const despachosPrevios = historico
    .filter((m) => m.tipo === 'DESPACHO' && m.consumidor_id === consumidorId)
    .reduce((sum, m) => sum + (toNumber(m.litros) || 0), 0);

  if (comprasPrevias <= 0 && despachosPrevios <= 0) {
    const estimadoPostInicial = litros;
    if (!capacidadTanque) {
      return {
        estado: AUDITORIA_ESTADO.SIN_CAPACIDAD,
        remanenteAntes: 0,
        combustibleEstimadoPost: estimadoPostInicial,
      };
    }
    return {
      estado: estimadoPostInicial > capacidadTanque ? AUDITORIA_ESTADO.EXCESO : AUDITORIA_ESTADO.OK,
      remanenteAntes: 0,
      combustibleEstimadoPost: estimadoPostInicial,
    };
  }

  const remanenteAntes = Math.max(comprasPrevias - despachosPrevios, 0);
  const combustibleEstimadoPost = remanenteAntes + litros;

  if (!capacidadTanque) {
    return {
      estado: AUDITORIA_ESTADO.SIN_CAPACIDAD,
      remanenteAntes,
      combustibleEstimadoPost,
    };
  }

  return {
    estado: combustibleEstimadoPost > capacidadTanque ? AUDITORIA_ESTADO.EXCESO : AUDITORIA_ESTADO.OK,
    remanenteAntes,
    combustibleEstimadoPost,
  };
};
