import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authClient } from '@/api/authClient';
import { crearLectorSSE } from '@/lib/sse';

// Propaga a todas las vistas —y a todos los usuarios— lo que cambia en la base.
//
// Antes, cada pantalla invalidaba a mano las consultas que creía afectadas por
// su propia acción. Eso dejaba dos agujeros: nadie refrescaba lo que no había
// tocado él mismo —el panel de integridad y su contador se quedaban con el
// número viejo hasta recargar—, y lo que hacía otra persona no llegaba nunca.
//
// Aquí el mapa es al revés: de la tabla que cambia a todo lo que depende de
// ella. Así no hay que acordarse en cada mutación nueva, que es de donde venían
// los olvidos.

// Consultas de diagnóstico. Dependen de casi todo, así que se refrescan en
// bloque en cuanto se mueve cualquiera de sus fuentes.
const INTEGRIDAD = [
  ['anomalias-descartadas'],
  ['integridad-despachos-huerfanos'],
  ['integridad-ventas-canceladas-con-mov'],
  ['integridad-stock-descuadre'],
  ['integridad-movimientos-recientes'],
  ['integridad-entregadas-sin-mov'],
];

const MAPA = {
  movimiento: [
    ['movimientos'], ['v-stock-tanques'], ['movimientos-stats'],
    ['movimientos-odo-antes'], ['cpp-por-tanque'], ['finanzas-movimientos'],
    ...INTEGRIDAD,
  ],
  venta_trabajador: [
    ['ventas'], ['ventas-pendientes'], ['v-stock-tanques'], ...INTEGRIDAD,
  ],
  anomalia_descartada: INTEGRIDAD,
  consumidor:          [['consumidores'], ['v-stock-tanques'], ...INTEGRIDAD],
  conductor:           [['conductores']],
  beneficiario:        [['beneficiarios']],
  tarjeta:             [['tarjetas'], ['finanzas-tarjetas']],
  tipo_combustible:    [['combustibles']],
  // Tres nombres para la misma tabla, repartidos por la aplicación. Faltaba
  // tipos_consumidor, que es justo el que usa el panel donde se editan.
  tipo_consumidor:     [['tipos-consumidor'], ['tiposConsumidor'], ['tipos_consumidor']],
  concepto_precio:     [['conceptos-precio']],
  precio_combustible:  [['precios'], ['precios-despacho']],
  precio_despacho_tipo:[['precios-despacho']],
  clase_vehiculo:      [['clases-vehiculo']],
  tarifa_transporte:   [['tarifas-transporte']],
  asignacion_ruta:     [['asignaciones_ruta'], ['asig-comparativo']],
  ruta:                [['rutas']],
  marcador:            [['marcadores']],
  ruta_marcador:       [['ruta_marcadores']],
  apk_version:         [['apk-versiones'], ['apk-version-vigente']],
};

const TABLAS = Object.keys(MAPA);

// Una importación o un saneamiento disparan decenas de cambios seguidos. Sin
// agrupar, cada uno lanzaría su tanda de peticiones.
const ESPERA_AGRUPADO_MS = 400;

const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

const dormir = (ms, senal) => new Promise((resolver) => {
  const t = setTimeout(resolver, ms);
  senal.addEventListener('abort', () => { clearTimeout(t); resolver(); }, { once: true });
});

/**
 * Mantiene la aplicación al día con lo que pasa en la base.
 *
 * Se monta una sola vez, en el armazón. Los avisos llegan de la pasarela por SSE
 * y solo traen el nombre de la tabla que cambió: lo que se relee después pasa por
 * la autorización de siempre, así que esto no puede enseñar nada que el usuario
 * no pudiera consultar por su cuenta.
 *
 * La pasarela cierra la conexión cuando caduca el token con el que se abrió (5
 * minutos); aquí se reconecta enseguida con uno renovado. Si falla, se reintenta
 * con espera creciente.
 */
export function useTiempoReal({ enabled = true } = {}) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!enabled || !API_URL) return;

    const control = new AbortController();
    const { signal } = control;
    const pendientes = new Set();
    let temporizador;

    const vaciar = () => {
      const tablas = [...pendientes];
      pendientes.clear();
      const claves = new Map();
      tablas.forEach(tabla => {
        (MAPA[tabla] ?? []).forEach(k => claves.set(JSON.stringify(k), k));
      });
      claves.forEach(k => qc.invalidateQueries({ queryKey: k }));
    };

    const anotar = (tabla) => {
      pendientes.add(tabla);
      clearTimeout(temporizador);
      temporizador = setTimeout(vaciar, ESPERA_AGRUPADO_MS);
    };

    async function escuchar() {
      let espera = 1000;
      while (!signal.aborted) {
        try {
          const token = await authClient.obtenerToken();
          if (!token) { await dormir(5000, signal); continue; }

          const res = await fetch(`${API_URL}/events`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
            signal,
          });
          if (res.status === 401) { await authClient.obtenerToken({ forzar: true }); continue; }
          if (res.status === 403) return; // sin acceso a este sistema: reintentar no cambia nada
          if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

          let lleno = false;
          const lector = crearLectorSSE(({ evento, datos }) => {
            if (evento === 'ready') { espera = 1000; return; }
            if (evento === 'busy') { lleno = true; return; }
            try {
              const { tabla } = JSON.parse(datos);
              if (tabla) anotar(tabla);
            } catch { /* aviso mal formado: se ignora */ }
          });
          const decoder = new TextDecoder();
          const flujo = res.body.getReader();
          for (;;) {
            const { value, done } = await flujo.read();
            if (done) break;
            lector.alimentar(decoder.decode(value, { stream: true }));
          }
          if (lleno) { await dormir(30_000, signal); continue; }
          // Cierre normal (caducó el token): reconecta ya.
        } catch (e) {
          if (signal.aborted || e?.name === 'AbortError') return;
          // Sin red o error del servidor: espera creciente, sin pasarse de 30 s.
          await dormir(espera, signal);
          espera = Math.min(espera * 2, 30_000);
        }
      }
    }

    escuchar();

    return () => {
      control.abort();
      clearTimeout(temporizador);
    };
  }, [enabled, qc]);
}
