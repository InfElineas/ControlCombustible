import { get, set } from 'idb-keyval';
import { supabase } from '@/api/supabaseClient';
import { base44 } from '@/api/base44Client';
import { aplicarTransicion } from '@/lib/transicionVenta';

// Cola de operaciones que se guardaron sin conexión y quedan a la espera de
// llegar al servidor.
//
// Una bonificación en PENDIENTE y una novedad de ruta no mueven combustible ni
// dinero: pueden esperar sin descuadrar nada.
//
// Los movimientos sí mueven existencias, y se admiten por decisión expresa
// —registrar en el campo sin cobertura era el motivo de todo esto—, pero no son
// gratis: un DESPACHO encolado puede llegar al servidor cuando otro ya consumió
// ese combustible, y entonces el trigger que impide el stock negativo lo rechaza
// con el combustible ya entregado. Por eso:
//
//   · La entrada de existencias (COMPRA, DEPÓSITO) no puede fallar por stock.
//   · La salida (DESPACHO) puede, así que el formulario avisa antes de guardar y
//     el stock que se muestra descuenta lo que está en la cola: si no, el
//     operador sigue despachando sobre existencias que ya comprometió.
//   · Un rechazo por stock queda en la bandeja con su motivo, para resolverlo
//     con una COMPRA o un AJUSTE en vez de perderse en silencio.
//
// Los cobros y las entregas también entran, por la misma decisión, y traen su
// propio riesgo: son modificaciones, no inserciones. Dos personas cobrando la
// misma bonificación sin verse no dan un duplicado sino una sobrescritura, así
// que el cambio va condicionado al estado que el usuario tenía delante y un
// choque llega a la bandeja como conflicto, sin reintentos: reintentar pisaría
// el trabajo del otro.
const CLAVE = 'webcombustible-cola-escritura-v1';

// Cada operación lleva su identificador definitivo desde que se crea, y ese es
// el que se manda al servidor. Si un envío llega pero su respuesta se pierde, el
// reintento choca contra la clave primaria: eso significa "ya estaba guardado",
// no un error. Sin esto, una respuesta perdida duplicaría el registro.
const ERROR_CLAVE_DUPLICADA = '23505';

// El número de factura se calcula en el cliente. Estando sin conexión se calcula
// sobre una lista que puede estar vieja, así que al enviar puede chocar con otro
// que se creó mientras tanto. Cuando pasa se pide el siguiente al servidor, que
// es quien tiene la verdad, en vez de rechazar el registro.
async function siguienteNumeroFactura() {
  const { data } = await supabase
    .from('venta_trabajador')
    .select('numero_factura')
    .not('numero_factura', 'is', null);
  const usados = (data ?? [])
    .map(v => parseInt((v.numero_factura || '').slice(1), 10))
    .filter(n => !isNaN(n) && n > 0);
  return `C${usados.length ? Math.max(...usados) + 1 : 1}`;
}

const MANEJADORES = {
  async bonificacion(datos) {
    let fila = datos;
    for (let intento = 0; intento < 5; intento++) {
      const { error } = await supabase.from('venta_trabajador').insert(fila);
      if (!error) return;
      const duplicada = error.code === ERROR_CLAVE_DUPLICADA;
      // Choca contra su propia clave primaria: el envío anterior sí llegó.
      if (duplicada && (error.message || '').includes('pkey')) return;
      if (duplicada && (error.message || '').includes('numero_factura')) {
        fila = { ...fila, numero_factura: await siguienteNumeroFactura() };
        continue;
      }
      throw error;
    }
    throw new Error('No se pudo asignar un número de factura libre.');
  },

  // Una novedad de ruta es kilometraje y observaciones: no mueve combustible ni
  // dinero, así que puede esperar.
  //
  // Se manda por la entidad y no por un insert directo para que quede el
  // registro de auditoría: quién la creó y cuándo. Ese apunte no rompe el envío
  // si falla, porque logAudit nunca lanza.
  async novedad_ruta(datos) {
    try {
      await base44.entities.AsignacionRuta.create(datos);
    } catch (e) {
      if (e?.code === ERROR_CLAVE_DUPLICADA && (e.message || '').includes('pkey')) return;
      throw e;
    }
  },

  // Cobrar, entregar o cancelar una bonificación. A diferencia del resto, esto
  // modifica una fila existente, así que la protección no puede ser la clave
  // primaria: va condicionado al estado que el usuario tenía delante. Si otro lo
  // cambió mientras no había red, no se aplica y el conflicto llega a la bandeja
  // en lugar de pisar su trabajo.
  async transicion_venta(plan) {
    await aplicarTransicion(plan);
  },

  // Un movimiento se manda por la entidad para conservar su auditoría, igual
  // que las novedades.
  async movimiento(datos) {
    try {
      await base44.entities.Movimiento.create(datos);
    } catch (e) {
      if (e?.code === ERROR_CLAVE_DUPLICADA && (e.message || '').includes('pkey')) return;
      throw e;
    }
  },
};

export const TIPOS = Object.keys(MANEJADORES);

// Litros que la cola ya comprometió de un origen y todavía no están en el
// servidor. El stock que ve el usuario tiene que restarlos: si no, sigue
// despachando sobre existencias que ya gastó estando sin conexión.
export function litrosComprometidos(cola, consumidorOrigenId, combustibleId) {
  if (!consumidorOrigenId) return 0;
  return cola
    .filter(i => i.tipo === 'movimiento' && i.estado === 'pendiente')
    .filter(i => i.datos?.consumidor_origen_id === consumidorOrigenId)
    .filter(i => !combustibleId || i.datos?.combustible_id === combustibleId)
    .reduce((s, i) => s + (Number(i.datos?.litros) || 0), 0);
}

// ── Estado y avisos ──────────────────────────────────────────────────────────

const oyentes = new Set();
export function alCambiarCola(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}
const avisar = () => oyentes.forEach(fn => { try { fn(); } catch { /* un oyente roto no debe parar al resto */ } });

export async function leerCola() {
  try {
    return (await get(CLAVE)) ?? [];
  } catch {
    return []; // almacenamiento bloqueado: se trabaja como si no hubiera cola
  }
}

async function escribirCola(items) {
  await set(CLAVE, items);
  avisar();
}

/** Guarda una operación para enviarla cuando haya conexión. */
export async function encolar(tipo, datos, resumen) {
  if (!MANEJADORES[tipo]) throw new Error(`Tipo de operación desconocido: ${tipo}`);
  const cola = await leerCola();
  const item = {
    id: datos.id ?? crypto.randomUUID(),
    tipo, datos, resumen,
    creadoEn: new Date().toISOString(),
    intentos: 0,
    estado: 'pendiente',
    error: null,
  };
  await escribirCola([...cola, item]);
  return item;
}

export async function descartar(id) {
  await escribirCola((await leerCola()).filter(i => i.id !== id));
}

export async function volverAIntentar(id) {
  const cola = await leerCola();
  await escribirCola(cola.map(i => (i.id === id ? { ...i, estado: 'pendiente', error: null } : i)));
}

// Un fallo de red o de sesión se reintenta; uno de validación o de permiso, no:
// reintentarlo mil veces da el mismo resultado y esconde el problema al usuario.
//
// La sesión cuenta como transitoria porque un token caducado se renueva solo en
// cuanto hay conexión. Tratarlo como rechazo definitivo descartaba registros
// buenos por un problema que se arregla en segundos.
export function esFalloDeRed(e) {
  // Un conflicto de estado no se arregla reintentando: alguien ya cambió el
  // registro y hace falta que una persona lo mire.
  if (e?.conflicto) return false;
  if (!navigator.onLine) return true;
  const texto = `${e?.message ?? ''} ${e?.name ?? ''}`.toLowerCase();
  if (/jwt|token|not authenticated|unauthorized|refresh/.test(texto)) return true;
  if (e?.code === 'PGRST301' || e?.status === 401) return true;
  return !e?.code && /fetch|network|failed to fetch|timeout|aborted/.test(texto);
}

let procesando = false;

/** Envía lo pendiente. Devuelve cuántas salieron y cuántas quedaron rechazadas. */
export async function procesarCola() {
  if (procesando) return { enviadas: 0, rechazadas: 0, pendientes: null };
  procesando = true;
  let enviadas = 0, rechazadas = 0;
  try {
    const pendientes = (await leerCola()).filter(i => i.estado === 'pendiente');
    for (const item of pendientes) {
      try {
        await MANEJADORES[item.tipo](item.datos);
        await descartar(item.id);
        enviadas++;
      } catch (e) {
        const reintentable = esFalloDeRed(e);
        const porStock = /stock|insuficiente|negativo/i.test(e?.message ?? '');
        const cola = await leerCola();
        await escribirCola(cola.map(i => (i.id === item.id ? {
          ...i,
          intentos: i.intentos + 1,
          estado: reintentable ? 'pendiente' : 'rechazado',
          error: porStock
            ? `${e.message} — el combustible ya salió: regístralo con una COMPRA en el origen o corrígelo con un AJUSTE.`
            : (e?.message ?? 'Error desconocido'),
        } : i)));
        if (!reintentable) rechazadas++;
        // Si se cayó la red, el resto tampoco va a salir: se deja para luego.
        if (reintentable) break;
      }
    }
  } finally {
    procesando = false;
  }
  const cola = await leerCola();
  return { enviadas, rechazadas, pendientes: cola.filter(i => i.estado === 'pendiente').length };
}

/** Vacía la cola. Se llama al cerrar sesión, junto con la caché. */
export async function limpiarCola() {
  await escribirCola([]);
}
