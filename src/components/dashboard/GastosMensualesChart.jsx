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

import {
  SIN_COMBUSTIBLE, SIN_CONCEPTO, colorDeSerie, ordenarSeries, mapaConceptoPorConsumidor,
} from './coloresDesglose';

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

/**
 * Detalle del mes señalado.
 *
 * Va en su propia columna, fuera del gráfico, en lugar de flotar siguiendo al
 * ratón: el recuadro flotante se ponía encima de las barras vecinas justo
 * cuando hacían falta para comparar. Cuando no se señala nada, el hueco lo
 * ocupa la leyenda, así que no se pierde espacio.
 */
function PanelDetalle({ fila, series, colores }) {
  if (!fila) {
    return (
      <div className="space-y-1.5">
        {series.map(s => (
          <span key={s} className="flex items-center gap-1.5 min-w-0 text-[11px] text-slate-500">
            <span className="w-3 h-3 rounded-sm inline-block shrink-0" style={{ background: colores[s] }} />
            <span className="truncate">{s}</span>
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <span className="w-4 border-t-2 border-dashed border-orange-400 inline-block" />Litros (eje der.)
        </span>
        <p className="text-[10px] text-slate-400 pt-1.5">Toca o señala un mes para ver su reparto.</p>
      </div>
    );
  }

  const litros = Number(fila.litros || 0);
  const total  = Number(fila.gasto  || 0);
  // Solo las series con importe: listar las seis siempre, la mayoría a cero,
  // convierte el panel en una lista de ruido.
  const partes = series
    .map(s => ({ nombre: s, valor: Number(fila[s] || 0) }))
    .filter(p => p.valor > 0)
    .sort((a, b) => b.valor - a.valor);
  const precioMed = litros > 0 && total > 0 ? total / litros : null;

  return (
    <div className="text-xs space-y-1">
      <p className="font-semibold text-slate-700 dark:text-slate-200 border-b border-slate-100 dark:border-slate-700 pb-1 mb-1">
        {fila.label}
      </p>

      {partes.length === 0 && <p className="text-slate-400">Sin compras este mes</p>}

      {partes.map(p => (
        <div key={p.nombre} className="flex justify-between gap-2 items-center">
          <span className="flex items-center gap-1.5 min-w-0 text-slate-500">
            <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: colores[p.nombre] }} />
            <span className="truncate">{p.nombre}</span>
          </span>
          <span className="font-semibold text-slate-700 dark:text-slate-200 shrink-0">
            {formatMonto(p.valor)}
            <span className="text-slate-400 font-normal ml-1">
              {total > 0 ? `${Math.round((p.valor / total) * 100)}%` : ''}
            </span>
          </span>
        </div>
      ))}

      <div className="flex justify-between gap-2 border-t border-slate-100 dark:border-slate-700 pt-1 mt-1">
        <span className="text-slate-400">Total</span>
        <span className="font-bold text-slate-800 dark:text-slate-100">{formatMonto(total)}</span>
      </div>
      <div className="flex justify-between gap-2">
        <span className="text-slate-400">Litros</span>
        <span className="font-semibold text-orange-600">{fmtL(litros)} L</span>
      </div>
      {precioMed !== null && (
        <div className="flex justify-between gap-2">
          <span className="text-slate-400">Precio med.</span>
          <span className="text-slate-600 dark:text-slate-300">{formatMonto(precioMed)}/L</span>
        </div>
      )}
    </div>
  );
}

export default function GastosMensualesChart({ movimientos, consumidores = [], tiposConsumidor = [] }) {
  const [dimension, setDimension] = useState('combustible');
  const [mesActivo, setMesActivo] = useState(null);

  const { data: conceptos = [] } = useQuery({
    queryKey: ['conceptos-precio'],
    queryFn: () => base44.entities.ConceptoPrecio.list(),
    staleTime: 10 * 60_000,
  });

  const conceptoPorConsumidor = useMemo(
    () => mapaConceptoPorConsumidor(consumidores, tiposConsumidor, conceptos),
    [consumidores, tiposConsumidor, conceptos],
  );

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

    return { data: meses, series: ordenarSeries(encontradas) };
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

      {/* Gráfico y detalle, uno al lado del otro: el detalle nunca se pone
          encima de las barras. En pantalla estrecha se coloca debajo. */}
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
      <div className="min-w-0 flex-1">
      <ResponsiveContainer width="100%" height={180}>
        <ComposedChart
          data={data}
          margin={{ top: 4, right: 48, left: 0, bottom: 0 }}
          onMouseMove={e => {
            const i = e?.activeTooltipIndex;
            setMesActivo(prev => (Number.isInteger(i) && i !== prev ? i : prev));
          }}
          onMouseLeave={() => setMesActivo(null)}
          // En el teléfono no hay puntero que pasar por encima: se toca el mes.
          onClick={e => {
            const i = e?.activeTooltipIndex;
            if (Number.isInteger(i)) setMesActivo(prev => (prev === i ? null : i));
          }}
        >
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

          {/* Sigue haciendo falta para que Recharts pinte la columna resaltada
              y calcule el mes señalado; el contenido va en el panel de al lado. */}
          <Tooltip
            content={() => null}
            cursor={{ fill: '#f0f9ff', radius: 4 }}
            wrapperStyle={{ display: 'none' }}
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

        <div className="w-full sm:w-[200px] shrink-0 sm:border-l sm:border-slate-100 sm:dark:border-slate-700 sm:pl-4">
          <PanelDetalle
            fila={mesActivo != null ? data[mesActivo] : null}
            series={series}
            colores={colores}
          />
        </div>
      </div>
    </div>
  );
}
