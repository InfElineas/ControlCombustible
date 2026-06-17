import React, { useMemo } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { formatMonto } from '@/components/ui-helpers/SaldoUtils';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const fmtL = n => (n % 1 === 0 ? String(Math.round(n)) : n.toFixed(1));

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

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const gasto  = Number(payload.find(p => p.dataKey === 'gasto')?.value  || 0);
  const litros = Number(payload.find(p => p.dataKey === 'litros')?.value || 0);
  const precioMed = litros > 0 && gasto > 0 ? gasto / litros : null;
  return (
    <div className="glass rounded-xl px-3 py-2.5 text-xs space-y-1 min-w-[140px]">
      <p className="font-semibold text-slate-700 border-b border-slate-100 pb-1 mb-1">{label}</p>
      <div className="flex justify-between gap-3">
        <span className="text-slate-400">Gasto</span>
        <span className="font-bold text-slate-800">{formatMonto(gasto)}</span>
      </div>
      <div className="flex justify-between gap-3">
        <span className="text-slate-400">Litros</span>
        <span className="font-semibold text-orange-600">{fmtL(litros)} L</span>
      </div>
      {precioMed !== null && (
        <div className="flex justify-between gap-3 border-t border-slate-100 pt-1 mt-1">
          <span className="text-slate-400">Precio med.</span>
          <span className="text-slate-600">{formatMonto(precioMed)}/L</span>
        </div>
      )}
    </div>
  );
}

export default function GastosMensualesChart({ movimientos }) {
  const data = useMemo(() => {
    const hoy = new Date();
    const meses = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      meses.push({ key, label: MESES[d.getMonth()], gasto: 0, litros: 0, esMesActual: i === 0 });
    }
    movimientos
      .filter(m => m.tipo === 'COMPRA' && m.fecha)
      .forEach(m => {
        const key = m.fecha.slice(0, 7);
        const mes = meses.find(x => x.key === key);
        if (mes) {
          mes.gasto  += m.monto  || 0;
          mes.litros += m.litros || 0;
        }
      });
    return meses;
  }, [movimientos]);

  const mesesConDatos  = data.filter(d => d.gasto > 0);
  const total6m        = data.reduce((s, d) => s + d.gasto, 0);
  const promedio       = mesesConDatos.length > 0 ? total6m / mesesConDatos.length : 0;
  const actual         = data[data.length - 1]?.gasto  ?? 0;
  const anterior       = data[data.length - 2]?.gasto  ?? 0;
  const tendenciaPct   = anterior > 0 ? ((actual - anterior) / anterior) * 100 : null;
  const maxGasto       = Math.max(...data.map(d => d.gasto));

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

      {/* Leyenda compacta */}
      <div className="flex items-center gap-4 text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-sky-400 inline-block" />Gasto ($ eje izq.)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 border-t-2 border-dashed border-orange-400 inline-block" />Litros (eje der.)
        </span>
      </div>

      {/* Gráfico */}
      <ResponsiveContainer width="100%" height={180}>
        <ComposedChart data={data} margin={{ top: 4, right: 48, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="gastoGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#38bdf8" stopOpacity={0.95} />
              <stop offset="100%" stopColor="#0284c7" stopOpacity={0.75} />
            </linearGradient>
            <linearGradient id="gastoGradientHigh" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#f59e0b" stopOpacity={0.9} />
              <stop offset="100%" stopColor="#d97706" stopOpacity={0.7} />
            </linearGradient>
          </defs>

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

          <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f0f9ff', radius: 4 }} />

          <Bar
            yAxisId="gasto"
            dataKey="gasto"
            radius={[4, 4, 0, 0]}
            maxBarSize={42}
            fill="url(#gastoGradient)"
          />

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
