import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { formatMonto } from '@/components/ui-helpers/SaldoUtils';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export default function GastosMensualesChart({ movimientos }) {
  const data = useMemo(() => {
    const hoy = new Date();
    const meses = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      meses.push({ key, label: MESES[d.getMonth()], gasto: 0, litros: 0 });
    }
    movimientos
      .filter(m => m.tipo === 'COMPRA' && m.fecha)
      .forEach(m => {
        const key = m.fecha.slice(0, 7);
        const mes = meses.find(x => x.key === key);
        if (mes) {
          mes.gasto += m.monto || 0;
          mes.litros += m.litros || 0;
        }
      });
    return meses;
  }, [movimientos]);

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-lg text-xs">
        <p className="font-semibold text-slate-700 mb-1">{label}</p>
        <p className="text-slate-600">Gasto: <span className="font-bold text-slate-800">$ {formatMonto(Number(payload[0]?.value || 0))}</span></p>
        <p className="text-slate-400">Litros: {Number(payload[0]?.payload?.litros || 0).toFixed(1)} L</p>
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={45} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f0f9ff', radius: 4 }} />
        <Bar dataKey="gasto" fill="#38bdf8" radius={[4, 4, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  );
}
