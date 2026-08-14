import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { base44 } from '@/api/base44Client';

// Fuente única del panel de integridad y del contador del menú. Vivía dentro de
// Alertas, pero el badge de la navegación necesita el mismo número: teniendo dos
// cálculos acabarían diciendo cosas distintas, que es justo lo que costó
// desenredar con el stock.
//
// Las queryKeys se comparten con el resto de la app, así que montar este hook en
// la navegación no multiplica las peticiones: TanStack sirve lo ya cacheado.
export function useIntegridadAlertas({ enabled = true } = {}) {
  const opts = { staleTime: 60_000, enabled };

  const { data: descartadas = [] } = useQuery({
    queryKey: ['anomalias-descartadas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('anomalia_descartada')
        .select('id, tipo, clave, user_email, created_date')
        .order('created_date', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    ...opts,
  });

  const clavesDescartadas = React.useMemo(
    () => new Set(descartadas.map(d => d.clave)),
    [descartadas],
  );
  const visible = React.useCallback(
    (clave) => !clavesDescartadas.has(clave),
    [clavesDescartadas],
  );

  const { data: huerfanos = [], isFetching: fetchingH } = useQuery({
    queryKey: ['integridad-despachos-huerfanos'],
    queryFn: async () => {
      const { data: rows } = await supabase
        .from('movimiento')
        .select('id, fecha, litros, referencia, consumidor_origen_id, consumidor_origen_nombre')
        .eq('tipo', 'DESPACHO')
        .ilike('referencia', 'Bonificación combustible:%');
      if (!rows) return [];
      const { data: ventas } = await supabase
        .from('venta_trabajador').select('movimiento_id').not('movimiento_id', 'is', null);
      const ventaMovIds = new Set((ventas ?? []).map(v => v.movimiento_id));
      return rows.filter(m => !ventaMovIds.has(m.id));
    },
    ...opts,
  });

  const { data: canceladasConMov = [], isFetching: fetchingC } = useQuery({
    queryKey: ['integridad-ventas-canceladas-con-mov'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('venta_trabajador')
        .select('id, beneficiario_nombre, litros, combustible_nombre, estado, movimiento_id')
        .in('estado', ['CANCELADO', 'ANULADO'])
        .not('movimiento_id', 'is', null);
      if (error) throw error;
      return data ?? [];
    },
    ...opts,
  });

  const { data: descuadres = [], isFetching: fetchingD } = useQuery({
    queryKey: ['integridad-stock-descuadre'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_stock_tanques')
        .select('consumidor_id, nombre, combustible_nombre, balance_real, litros_descuadre, total_entradas, total_salidas')
        .eq('descuadre', true)
        .order('litros_descuadre', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    ...opts,
  });

  const hoyStr    = new Date().toISOString().slice(0, 10);
  const hace90Str = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);

  const { data: movRecientes = [], isFetching: fetchingM } = useQuery({
    queryKey: ['integridad-movimientos-recientes', hace90Str],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('movimiento')
        .select('id, fecha, tipo, litros, consumidor_id, consumidor_nombre, combustible_id, combustible_nombre, referencia')
        .gte('fecha', hace90Str)
        .order('fecha', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    ...opts,
  });

  const { data: consumidoresInt = [] } = useQuery({
    queryKey: ['consumidores'],
    queryFn: () => base44.entities.Consumidor.list(),
    staleTime: 5 * 60_000,
    enabled,
  });

  const { data: entregadasSinMov = [], isFetching: fetchingE } = useQuery({
    queryKey: ['integridad-entregadas-sin-mov'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('venta_trabajador')
        .select('id, beneficiario_nombre, litros, combustible_nombre, estado, fecha_venta')
        .in('estado', ['ENTREGADO', 'PAGADO_FINALIZADO'])
        .is('movimiento_id', null);
      if (error) throw error;
      return data ?? [];
    },
    ...opts,
  });

  const anomalias = React.useMemo(() => {
    const porId = Object.fromEntries(consumidoresInt.map(c => [c.id, c]));

    // Fecha posterior a hoy: error de tecleo que descoloca los cierres del mes
    const fechaFutura = movRecientes.filter(m => m.fecha > hoyStr);

    // Mismo destino, combustible, litros y día registrados más de una vez.
    // La referencia entra en la clave porque varias entregas iguales el mismo
    // día son lo normal en bonificaciones —cada trabajador genera su despacho—
    // y solo se distinguen por ella.
    const grupos = {};
    movRecientes.forEach(m => {
      const k = [m.fecha, m.tipo, m.consumidor_id, m.combustible_id, m.litros,
        (m.referencia || '').trim().toLowerCase()].join('|');
      (grupos[k] ||= []).push(m);
    });
    // La clave lleva el número de repeticiones: si más adelante aparece otro
    // registro en el grupo, el caso cambia y vuelve a avisarse.
    const duplicados = Object.entries(grupos)
      .filter(([, g]) => g.length > 1)
      .map(([k, g]) => ({ items: g, clave: `dup|${k}|${g.length}` }))
      .filter(d => visible(d.clave));

    const ajusteSinMotivo = movRecientes
      .filter(m => m.tipo === 'AJUSTE' && !(m.referencia || '').trim())
      .filter(m => visible(`ajuste|${m.id}`));

    const sobrellenado = movRecientes.filter(m => {
      if (!m.consumidor_id || !['COMPRA', 'DEPOSITO', 'DESPACHO'].includes(m.tipo)) return false;
      const cap = Number(porId[m.consumidor_id]?.datos_tanque?.capacidad_litros) || 0;
      return cap > 0 && Number(m.litros || 0) > cap;
    })
      .map(m => ({ ...m, capacidad: Number(porId[m.consumidor_id]?.datos_tanque?.capacidad_litros) }))
      .filter(m => visible(`sobre|${m.id}`));

    return {
      fechaFutura: fechaFutura.filter(m => visible(`futura|${m.id}`)),
      duplicados,
      ajusteSinMotivo,
      sobrellenado,
    };
  }, [movRecientes, consumidoresInt, hoyStr, visible]);

  const descuadresVis = descuadres.filter(d => visible(`descuadre|${d.consumidor_id}|${d.litros_descuadre}`));
  const entregadasVis = entregadasSinMov.filter(v => visible(`entrega|${v.id}`));

  // Saneables = los que el botón puede resolver solo. Los demás exigen decisión
  // humana pero cuentan igual como problema pendiente.
  const saneables = huerfanos.length + canceladasConMov.length;
  const total = saneables + descuadresVis.length + entregadasVis.length +
    anomalias.fechaFutura.length + anomalias.duplicados.length +
    anomalias.ajusteSinMotivo.length + anomalias.sobrellenado.length;

  return {
    descartadas, clavesDescartadas,
    huerfanos, canceladasConMov,
    descuadresVis, entregadasVis, anomalias,
    saneables, total,
    isFetching: fetchingH || fetchingC || fetchingD || fetchingM || fetchingE,
  };
}

export const QUERY_KEYS_INTEGRIDAD = [
  ['anomalias-descartadas'],
  ['integridad-despachos-huerfanos'],
  ['integridad-ventas-canceladas-con-mov'],
  ['integridad-stock-descuadre'],
  ['integridad-movimientos-recientes'],
  ['integridad-entregadas-sin-mov'],
];
