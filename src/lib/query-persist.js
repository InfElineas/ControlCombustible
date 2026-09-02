import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { get, set, del } from 'idb-keyval';

// Guarda la caché de consultas en IndexedDB para que la aplicación abra con los
// últimos datos descargados en lugar de una pantalla vacía cuando no hay red.
//
// Se usa IndexedDB y no localStorage porque el histórico de movimientos por sí
// solo se acerca al límite de 5 MB de localStorage.
const almacen = {
  getItem:    (clave) => get(clave),
  setItem:    (clave, valor) => set(clave, valor),
  removeItem: (clave) => del(clave),
};

export const persister = createAsyncStoragePersister({
  storage: almacen,
  // La versión va en la clave: al cambiarla se descarta la caché vieja en lugar
  // de intentar rehidratar una forma de datos que ya no coincide.
  key: 'webcombustible-cache-v1',
  throttleTime: 2000,
});

// Borra lo guardado en el dispositivo. Se llama al cerrar sesión para que quien
// entre después no encuentre los datos del usuario anterior.
export async function limpiarCachePersistida() {
  await persister.removeClient();
}

// Lista blanca: solo se guarda en el dispositivo lo que sirve para consultar sin
// conexión. Todo lo demás se vuelve a pedir al servidor.
//
// Deliberadamente fuera:
//   · audit_log y audit-venta      — quién hizo qué; no debe quedar en el móvil
//   · anomalias-descartadas        — se recalculan y no aportan sin conexión
//   · integridad-*                 — diagnósticos, siempre deben ser frescos
//   · cpp-* y finanzas-*           — costos y márgenes, información sensible
const PERSISTIBLES = new Set([
  // Catálogos: cambian poco y hacen falta para que las pantallas se dibujen
  'consumidores', 'conductores', 'combustibles', 'tarjetas',
  'tipos-consumidor', 'tiposConsumidor', 'precios-despacho',
  // Operación: es lo que da sentido a consultar sin conexión
  'movimientos', 'ventas', 'ventas-pendientes', 'v-stock-tanques',
  'beneficiarios',
  // Rutas del día y su programa
  'rutas', 'asignaciones_ruta', 'marcadores', 'ruta_marcadores',
  'configAlertas',
]);

export const persistOptions = {
  persister,
  // Pasados tres días sin abrir la aplicación, los datos guardados se descartan:
  // un inventario de la semana pasada induce a más error que una pantalla vacía.
  maxAge: 1000 * 60 * 60 * 24 * 3,
  dehydrateOptions: {
    shouldDehydrateQuery: (query) => {
      if (query.state.status !== 'success') return false;
      const raiz = Array.isArray(query.queryKey) ? query.queryKey[0] : query.queryKey;
      return PERSISTIBLES.has(raiz);
    },
  },
};
