import React, { useMemo, useState } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { formatMonto } from '@/components/ui-helpers/SaldoUtils';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const fmtL = n => (n % 1 === 0 ? String(Math.round(n)) : n.toFixed(1));

const SIN_COMBUSTIBLE = 'Sin combustible';
const SIN_CONCEPTO    = 'Sin concepto';

// Los mismos colores que CombustibleBadge, para que un combustible se reconozca
// por su color en todo el sistema y no signifique una cosa aquí y otra allí.
const COLOR_COMBUSTIBLE = {
  diesel:   '#f59e0b',
  especial: '#3b82f6',
  regular:  '#22c55e',
};
const claveCombustible = (nombre) => {
  const n = (nombre || '').toLowerCase();
  if (n.includes('diesel'))   return 'diesel';
  if (n.includes('especial')) return 'especial';
  if (n.includes('regular'))  return 'regular';
  return null;
};

// Para los conceptos no hay convención previa, así que se reparte una paleta
// estable: el mismo concepto sale siempre del mismo color porque el orden de la
// lista es alfabético, no el de llegada de los datos.
const PALETA = ['#0ea5e9', '#8b5cf6', '#f43f5e', '#14b8a6', '#f59e0b', '#64748b', '#84cc16', '#ec4899'];
const GRIS_SIN_DATO = '#cbd5e1';

function colorDeSerie(serie, dimension, indice) {
  if (serie === SIN_COMBUSTIBLE || serie === SIN_CONCEPTO) return GRIS_SIN_DATO;
  if (dimension === 'combustible') {
    const clave = claveCombustible(serie);
    if (clave) return COLOR_COMBUSTIBLE[clave];
  }
  return PALETA[indice % PALETA.length];
}

function Tendencia({ pct }) {
  if (pct === null) return <span className="text-sm font-bold text-slate-400">—</span>;
  if (pct > 5) return (
    <span className="flex items-center gap-1 text-sm font-bold text-red-600">
      <TrendingUp className="w-3.5 h-3.5" />+{pct.toFixed(0)}%
    </span>
  );
  if (pct < -5) return (
    <span className="flex items-center gap-1 text-sm font-bold text-emerald-600">
      <TrendingDown className="w-3.5 h-3.5" />{pct.toFixed(0)}%
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-sm font-bold text-slate-500">
      <Minus className="w-3.5 h-3.5" />{pct > 0 ? '+' : ''}{pct.toFixed(0)}%
    </span>
  );
}

function CustomTooltip({ active, payload, label, series, colores }) {
  if (!active || !payload?.length) return null;
  const fila = payload[0]?.payload;
  if (!fila) return null;

  const litros = Number(fila.litros || 0);
  const total  = Number(fila.gasto  || 0);
  // Solo las series con importe: enseñar seis filas a cero por cada mes vacío
  // convierte el recuadro en una pared que tapa las barras de al lado.
  const partes = series
    .map(s => ({ nombre: s, valor: Number(fila[s] || 0) }))
    .filter(p => p.valor > 0)
    .sort((a, b) => b.valor - a.valor);
  const precioMed = litros > 0 && total > 0 ? total / litros : null;

  return (
    <div className="glass rounded-xl px-3 py-2.5 text-xs space-y-1 max-w-[230px]">
      <p className="font-semibold text-slate-700 border-b border-slate-100 pb-1 mb-1">{label}</p>

      {partes.map(p => (
        <div key={p.nombre} className="flex justify-between gap-3 items-center">
          <span className="flex items-center gap-1.5 min-w-0 text-slate-500">
            <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: colores[p.nombre] }} />
            <span className="truncate">{p.nombre}</span>
          </span>
          <span className="font-semibold text-slate-700 shrink-0">
            {formatMonto(p.valor)}
            <span className="text-slate-400 font-normal ml-1">
              {total > 0 ? `${Math.round((p.valor / total) * 100)}%` : ''}
            </span>
          </span>
        </div>
      ))}

      <div className="flex justify-between gap-3 border-t border-slate-100 pt-1 mt-1">
        <span className="text-slate-400">Total</span>
        <span className="font-bold text-slate-800">{formatMonto(total)}</span>
      </div>
      <div className="flex justify-between gap-3">
        <span className="text-slate-400">Litros</span>
        <span className="font-semibold text-orange-600">{fmtL(litros)} L</span>
      </div>
      {precioMed !== null && (
        <div className="flex justify-between gap-3">
          <span className="text-slate-400">Precio med.</span>
          <span className="text-slate-600">{formatMonto(precioMed)}/L</span>
        </div>
      )}
    </div>
  );
}

export default function GastosMensualesChart({ movimientos, consumidores = [], tiposConsumidor = [] }) {
  const [dimension, setDimension] = useState('combustible');

  const { data: conceptos = [] } = useQuery({
    queryKey: ['conceptos-precio'],
    queryFn: () => base44.entities.ConceptoPrecio.list(),
    staleTime: 10 * 60_000,
  });

  // Consumidor → concepto, en dos saltos: el consumidor dice su tipo y el tipo
  // dice bajo qué concepto se cuenta lo que gasta.
  const conceptoPorConsumidor = useMemo(() => {
    const nombreConcepto = new Map(conceptos.map(c => [c.id, c.nombre]));
    const conceptoDeTipo  = new Map(tiposConsumidor.map(t => [t.id, nombreConcepto.get(t.concepto_id)]));
    const mapa = new Map();
    consumidores.forEach(c => {
      mapa.set(c.id, conceptoDeTipo.get(c.tipo_consumidor_id) || null);
    });
    return mapa;
  }, [consumidores, tiposConsumidor, conceptos]);

  const { data, series } = useMemo(() => {
    const hoy = new Date();
    const meses = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      meses.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: MESES[d.getMonth()],
        gasto: 0,
        litros: 0,
      });
    }
    const porKey = new Map(meses.map(m => [m.key, m]));
    const encontradas = new Set();

    movimientos
      .filter(m => m.tipo === 'COMPRA' && m.fecha)
      .forEach(m => {
        const mes = porKey.get(m.fecha.slice(0, 7));
        if (!mes) return;
        const monto = m.monto || 0;
        mes.gasto  += monto;
        mes.litros += m.litros || 0;

        const serie = dimension === 'combustible'
          ? (m.combustible_nombre || SIN_COMBUSTIBLE)
          : (conceptoPorConsumidor.get(m.consumidor_id) || SIN_CONCEPTO);
        encontradas.add(serie);
        mes[serie] = (mes[serie] || 0) + monto;
      });

    // Alfabético, con «sin dato» al final: así el color de cada serie no baila
    // según qué mes tenga datos.
    const ordenadas = [...encontradas]
      .filter(s => s !== SIN_COMBUSTIBLE && s !== SIN_CONCEPTO)
      .sort((a, b) => a.localeCompare(b, 'es'));
    if (encontradas.has(SIN_COMBUSTIBLE)) ordenadas.push(SIN_COMBUSTIBLE);
    if (encontradas.has(SIN_CONCEPTO))    ordenadas.push(SIN_CONCEPTO);

    return { data: meses, series: ordenadas };
  }, [movimientos, dimension, conceptoPorConsumidor]);

  const colores = useMemo(() => {
    const m = {};
    series.forEach((s, i) => { m[s] = colorDeSerie(s, dimension, i); });
    return m;
  }, [series, dimension]);

  const mesesConDatos  = data.filter(d => d.gasto > 0);
  const total6m        = data.reduce((s, d) => s + d.gasto, 0);
  const promedio       = mesesConDatos.length > 0 ? total6m / mesesConDatos.length : 0;
  const actual         = data[data.length - 1]?.gasto  ?? 0;
  const anterior       = data[data.length - 2]?.gasto  ?? 0;
  const tendenciaPct   = anterior > 0 ? ((actual - anterior) / anterior) * 100 : null;

  const botonDim = (valor, texto) => (
    <button
      type="button"
      onClick={() => setDimension(valor)}
      className={`px-2.5 h-7 rounded-lg text-[11px] font-medium transition-colors ${
        dimension === valor
          ? 'bg-sky-600 text-white'
          : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
      }`}
    >
      {texto}
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Mini-KPIs */}
      <div className="grid grid-cols-3 gap-4 border-b border-slate-100 pb-4">
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Total 6 meses</p>
          <p className="text-sm font-bold text-slate-800">{formatMonto(total6m)}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Promedio mensual</p>
          <p className="text-sm font-bold text-slate-800">{formatMonto(promedio)}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">vs mes anterior</p>
          <Tendencia pct={tendenciaPct} />
        </div>
      </div>

      {/* Selector de desglose */}
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-[10px] text-slate-400 uppercase tracking-wide mr-1">Desglosar por</span>
        {botonDim('combustible', 'Combustible')}
        {botonDim('concepto', 'Concepto de consumo')}
      </div>

      {/* Leyenda: sale de los datos, no de una lista fija */}
      <div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap text-[11px] text-slate-500">
        {series.map(s => (
          <span key={s} className="flex items-center gap-1.5 min-w-0">
            <span className="w-3 h-3 rounded-sm inline-block shrink-0" style={{ background: colores[s] }} />
            <span className="truncate">{s}</span>
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="w-4 border-t-2 border-dashed border-orange-400 inline-block" />Litros (eje der.)
        </span>
      </div>

      {/* Gráfico */}
      <ResponsiveContainer width="100%" height={180}>
        <ComposedChart data={data} margin={{ top: 4, right: 48, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />

          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
          />

          {/* Eje izquierdo: gasto */}
          <YAxis
            yAxisId="gasto"
            orientation="left"
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            width={44}
            tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
          />

          {/* Eje derecho: litros */}
          <YAxis
            yAxisId="litros"
            orientation="right"
            tick={{ fontSize: 10, fill: '#fb923c' }}
            axisLine={false}
            tickLine={false}
            width={44}
            tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(1)}kL` : `${v}L`}
          />

          {/* Línea de promedio */}
          {promedio > 0 && (
            <ReferenceLine
              yAxisId="gasto"
              y={promedio}
              stroke="#94a3b8"
              strokeDasharray="4 3"
              strokeWidth={1}
              label={{ value: 'prom', position: 'insideTopLeft', fontSize: 9, fill: '#94a3b8' }}
            />
          )}

          <Tooltip
            content={<CustomTooltip series={series} colores={colores} />}
            cursor={{ fill: '#f0f9ff', radius: 4 }}
          />

          {series.map((s, i) => (
            <Bar
              key={s}
              yAxisId="gasto"
              dataKey={s}
              stackId="gasto"
              maxBarSize={42}
              fill={colores[s]}
              // Solo la de arriba lleva las esquinas redondeadas; en las de
              // abajo dejaría una muesca blanca entre tramo y tramo.
              radius={i === series.length - 1 ? [4, 4, 0, 0] : 0}
            />
          ))}

          <Line
            yAxisId="litros"
            type="monotone"
            dataKey="litros"
            stroke="#fb923c"
            strokeWidth={2}
            strokeDasharray="5 3"
            dot={{ r: 3, fill: '#fb923c', strokeWidth: 0 }}
            activeDot={{ r: 5, fill: '#fb923c' }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
