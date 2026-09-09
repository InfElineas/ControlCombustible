import { supabase } from '@/api/supabaseClient';
import { logAudit } from '@/api/auditLog';

// Cambio de estado de una bonificación, en un solo sitio.
//
// Vive aquí y no dentro de la página porque la ejecutan dos caminos: el botón,
// cuando hay conexión, y la cola de escritura, cuando el cobro se registró sin
// ella. Duplicar esta lógica garantizaba que las dos versiones se separaran.
//
// A diferencia de una inserción, esto MODIFICA una fila que ya existe, y ahí está
// el riesgo propio del cobro: entre que el usuario pulsa y el servidor recibe,
// otro pudo cobrar, cancelar o entregar la misma bonificación. Por eso el cambio
// va condicionado al estado que el usuario tenía delante: si ya no es ese, no se
// aplica y se avisa, en lugar de pisar el trabajo del otro en silencio.

export class ConflictoDeEstado extends Error {
  constructor(estadoEsperado) {
    super(`Otra persona ya cambió esta bonificación (estaba en ${estadoEsperado}). Revísala antes de volver a intentarlo.`);
    this.name = 'ConflictoDeEstado';
    this.conflicto = true;
  }
}

/**
 * Prepara todo lo que la transición necesita, resolviéndolo AHORA.
 *
 * Las fechas y el consumidor de destino se congelan en el momento en que el
 * usuario actúa, no cuando el registro llega al servidor: si se cobra el lunes
 * sin cobertura y se envía el jueves, la fecha de pago es la del lunes.
 */
export function prepararTransicion({ venta, nuevoEstado, precio_venta_unitario, usuarioId, consumidores = [] }) {
  const hoy = new Date().toISOString().slice(0, 10);
  // Entregar crea el despacho; cobrar directamente desde PENDIENTE también,
  // porque es entrega y cobro a la vez.
  const creaDespacho = nuevoEstado === 'ENTREGADO'
    || (nuevoEstado === 'PAGADO_FINALIZADO' && venta.estado === 'PENDIENTE');

  const logistico = creaDespacho
    ? (consumidores.find(c => (c.nombre || '').toLowerCase().includes('logist') && c.combustible_id === venta.combustible_id)
      ?? consumidores.find(c => (c.nombre || '').toLowerCase().includes('logist')
        && (c.combustible_nombre || '').toLowerCase() === (venta.combustible_nombre || '').toLowerCase())
      ?? consumidores.find(c => (c.nombre || '').toLowerCase().includes('logist'))
      ?? null)
    : null;

  return {
    venta,
    nuevoEstado,
    precio_venta_unitario: precio_venta_unitario ?? null,
    usuarioId: usuarioId ?? null,
    creaDespacho,
    // Identificador de cliente: si el envío llega y su respuesta se pierde, el
    // reintento choca contra la clave primaria en vez de crear otro despacho.
    movimientoNuevoId: creaDespacho ? crypto.randomUUID() : null,
    logistico: logistico ? { nombre: logistico.nombre, codigo_interno: logistico.codigo_interno ?? null } : null,
    fechaRetiro: creaDespacho ? hoy : null,
    fechaPago: nuevoEstado === 'PAGADO_FINALIZADO' ? hoy : null,
  };
}

/** Resumen legible para la bandeja de pendientes. */
export function resumirTransicion(p) {
  const etiqueta = {
    PAGADO_FINALIZADO: 'Cobro',
    ENTREGADO: 'Entrega',
    CANCELADO: 'Cancelación',
    PENDIENTE: 'Vuelta a pendiente',
  }[p.nuevoEstado] ?? p.nuevoEstado;
  return `${etiqueta} · ${p.venta.beneficiario_nombre} · ${p.venta.litros} L`;
}

/** Ejecuta la transición contra el servidor. Lanza ConflictoDeEstado si ya cambió. */
export async function aplicarTransicion(p) {
  const { venta, nuevoEstado, precio_venta_unitario, usuarioId } = p;
  const updates = { estado: nuevoEstado };

  if (p.creaDespacho) {
    updates.fecha_retiro = p.fechaRetiro;
    const { error: movErr } = await supabase.from('movimiento').insert({
      id: p.movimientoNuevoId,
      tipo: 'DESPACHO',
      fecha: p.fechaRetiro,
      consumidor_origen_id: venta.tanque_origen_id,
      consumidor_origen_nombre: venta.tanque_origen_nombre,
      vehiculo_origen_chapa: venta.tanque_origen_nombre,
      vehiculo_origen_alias: venta.tanque_origen_nombre,
      consumidor_id: null,
      consumidor_nombre: p.logistico?.nombre ?? 'Uso Logístico',
      vehiculo_chapa: p.logistico?.codigo_interno ?? null,
      vehiculo_alias: p.logistico?.nombre ?? null,
      combustible_id: venta.combustible_id,
      combustible_nombre: venta.combustible_nombre,
      litros: venta.litros,
      precio: venta.precio_por_litro,
      monto: venta.monto,
      referencia: `Bonificación combustible: ${venta.beneficiario_nombre}${venta.beneficiario_ci ? ' CI:' + venta.beneficiario_ci : ''}`,
    });
    // Un choque con su propia clave primaria significa que este despacho ya
    // llegó en un intento anterior: se sigue adelante con el resto.
    const yaEstaba = movErr?.code === '23505' && (movErr.message || '').includes('pkey');
    if (movErr && !yaEstaba) throw movErr;
    updates.movimiento_id = p.movimientoNuevoId;
    if (!yaEstaba) {
      await logAudit({
        action: 'DESPACHO_BON_CREADO', entityType: 'Movimiento', entityId: p.movimientoNuevoId,
        entityLabel: `Bonificación: ${venta.beneficiario_nombre} — ${venta.litros}L ${venta.combustible_nombre}`,
        metadata: { venta_id: venta.id, tanque_origen_id: venta.tanque_origen_id, litros: venta.litros },
      });
    }
  }

  if (nuevoEstado === 'PAGADO_FINALIZADO') {
    updates.fecha_pago = p.fechaPago;
    updates.cobrado_por = usuarioId;
    if (precio_venta_unitario) {
      updates.precio_venta_unitario = precio_venta_unitario;
      updates.monto = +(precio_venta_unitario * venta.litros).toFixed(4);
    }
  }

  // Al cancelar hay que soltar la referencia antes de borrar el despacho.
  const movABorrar = (nuevoEstado === 'CANCELADO' && venta.movimiento_id) ? venta.movimiento_id : null;
  if (movABorrar) updates.movimiento_id = null;

  // El filtro por estado es la guarda contra el trabajo de otro. Si nadie lo
  // tocó, cambia una fila; si ya lo cambiaron, ninguna.
  const { data: filas, error } = await supabase
    .from('venta_trabajador')
    .update(updates)
    .eq('id', venta.id)
    .eq('estado', venta.estado)
    .select('id');

  if (error || (filas ?? []).length === 0) {
    // El despacho ya se insertó: se revierte para no dejar stock descontado sin
    // bonificación que lo justifique.
    if (updates.movimiento_id) {
      await supabase.from('movimiento').delete().eq('id', updates.movimiento_id);
      await logAudit({
        action: 'DESPACHO_BON_REVERTIDO', entityType: 'Movimiento', entityId: updates.movimiento_id,
        entityLabel: `Rollback bonificación: ${venta.beneficiario_nombre}`,
        metadata: { venta_id: venta.id, motivo: error?.message ?? 'estado cambiado por otra persona' },
      });
    }
    if (error) throw error;
    throw new ConflictoDeEstado(venta.estado);
  }

  if (movABorrar) {
    const { error: delErr } = await supabase.from('movimiento').delete().eq('id', movABorrar);
    if (delErr) throw delErr;
    await logAudit({
      action: 'DESPACHO_BON_ELIMINADO', entityType: 'Movimiento', entityId: movABorrar,
      entityLabel: `Cancelación bonificación: ${venta.beneficiario_nombre}`,
      metadata: { venta_id: venta.id, motivo: 'cancelacion_bonificacion' },
    });
  }

  const auditMeta = { estado_anterior: venta.estado, estado_nuevo: nuevoEstado };
  if (nuevoEstado === 'PAGADO_FINALIZADO' && precio_venta_unitario) {
    auditMeta.precio_venta_unitario_nuevo = precio_venta_unitario;
    auditMeta.precio_venta_unitario_anterior = venta.precio_venta_unitario ?? null;
    auditMeta.monto_nuevo = +(precio_venta_unitario * venta.litros).toFixed(4);
    auditMeta.monto_anterior = venta.monto;
  }
  await logAudit({
    action: 'ESTADO_VENTA', entityType: 'VentaTrabajador', entityId: venta.id,
    entityLabel: `${venta.beneficiario_nombre} — ${venta.litros}L ${venta.combustible_nombre}`,
    metadata: auditMeta,
  });
}
