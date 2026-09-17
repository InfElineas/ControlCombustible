import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';

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
  asignacion_ruta:     [['asignaciones_ruta'], ['asig-comparativo']],
  ruta:                [['rutas']],
  marcador:            [['marcadores']],
  ruta_marcador:       [['ruta_marcadores']],
  user_roles:          [['pending_users_count'], ['usuarios']],
  apk_version:         [['apk-versiones'], ['apk-version-vigente']],
};

const TABLAS = Object.keys(MAPA);

// Una importación o un saneamiento disparan decenas de cambios seguidos. Sin
// agrupar, cada uno lanzaría su tanda de peticiones.
const ESPERA_AGRUPADO_MS = 400;

/**
 * Mantiene la aplicación al día con lo que pasa en la base.
 *
 * Se monta una sola vez, en el armazón. No usa el contenido de los avisos, solo
 * el nombre de la tabla que cambió: lo que se relea después pasa por las
 * políticas de siempre, así que esto no puede enseñar nada que el usuario no
 * pudiera consultar por su cuenta.
 */
export function useTiempoReal({ enabled = true } = {}) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

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

    const canal = supabase.channel('cambios-app');
    TABLAS.forEach(tabla => {
      canal.on('postgres_changes', { event: '*', schema: 'public', table: tabla },
        () => anotar(tabla));
    });
    canal.subscribe();

    return () => {
      clearTimeout(temporizador);
      supabase.removeChannel(canal);
    };
  }, [enabled, qc]);
}
