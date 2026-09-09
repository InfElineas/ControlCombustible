import { get, set } from 'idb-keyval';
import { supabase } from '@/api/supabaseClient';
import { base44 } from '@/api/base44Client';

// Cola de operaciones que se guardaron sin conexión y quedan a la espera de
// llegar al servidor.
//
// Solo entra aquí lo que no toca stock ni dinero. Una bonificación en PENDIENTE
// no descuenta combustible —eso pasa al entregarla—, así que puede esperar sin
// descuadrar nada. Los despachos, las compras y los cobros quedan fuera a
// propósito: dos personas registrando el mismo despacho sin verse acabarían en
// stock negativo, y eso no lo arregla ninguna cola.
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
};

export const TIPOS = Object.keys(MANEJADORES);

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
        const cola = await leerCola();
        await escribirCola(cola.map(i => (i.id === item.id ? {
          ...i,
          intentos: i.intentos + 1,
          estado: reintentable ? 'pendiente' : 'rechazado',
          error: e?.message ?? 'Error desconocido',
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
