import React, { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ArrowDownCircle, ArrowLeftRight, Warehouse, Fuel } from 'lucide-react';
import { formatMonto } from '@/components/ui-helpers/SaldoUtils';

export default function LogConsumidorMovimientosModal({ consumidor, movimientos, onClose }) {
  const logs = useMemo(() => {
    if (!consumidor || !movimientos) return [];
    return movimientos
      .filter(m => m.consumidor_id === consumidor.id || m.consumidor_origen_id === consumidor.id)
      .sort((a, b) => b.fecha?.localeCompare(a.fecha));
  }, [consumidor, movimientos]);

  const totalLitros = logs.filter(m => m.consumidor_id === consumidor.id && (m.tipo === 'COMPRA' || m.tipo === 'DESPACHO' || m.tipo === 'DEPOSITO')).reduce((s, m) => s + (m.litros || 0), 0);
  const totalGasto = logs.filter(m => m.tipo === 'COMPRA' || m.tipo === 'DEPOSITO').reduce((s, m) => s + (m.monto || 0), 0);
  const avgConsumo = (() => {
    const vals = logs.filter(m => m.consumo_real != null).map(m => m.consumo_real);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  })();

  return (
    <Dialog open={!!consumidor} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Fuel className="w-4 h-4 text-sky-500" />
            Movimientos — {consumidor?.nombre}
            {consumidor?.codigo_interno && <span className="text-slate-400 font-mono text-xs">{consumidor.codigo_interno}</span>}
          </DialogTitle>
        </DialogHeader>

        {/* Resumen */}
        <div className="flex gap-3 pb-3 border-b border-slate-100 flex-wrap">
          <div className="bg-orange-50 rounded-lg px-3 py-2 flex-1 text-center min-w-[80px]">
            <p className="text-[10px] text-orange-500 uppercase font-semibold">Total litros</p>
            <p className="text-sm font-bold text-orange-700">{totalLitros.toFixed(1)} L</p>
          </div>
          <div className="bg-slate-50 rounded-lg px-3 py-2 flex-1 text-center min-w-[80px]">
            <p className="text-[10px] text-slate-500 uppercase font-semibold">Total gasto</p>
            <p className="text-sm font-bold text-slate-700">{formatMonto(totalGasto)}</p>
          </div>
          <div className="bg-sky-50 rounded-lg px-3 py-2 flex-1 text-center min-w-[80px]">
            <p className="text-[10px] text-sky-500 uppercase font-semibold">Movimientos</p>
            <p className="text-sm font-bold text-sky-700">{logs.length}</p>
          </div>
          {avgConsumo != null && (
            <div className="bg-emerald-50 rounded-lg px-3 py-2 flex-1 text-center min-w-[80px]">
              <p className="text-[10px] text-emerald-500 uppercase font-semibold">km/L prom.</p>
              <p className="text-sm font-bold text-emerald-700">{avgConsumo.toFixed(2)}</p>
            </div>
          )}
        </div>

        {/* Tabla */}
        <div className="overflow-auto flex-1 mt-1">
          {logs.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-8">Sin movimientos registrados</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-slate-100">
                  <th className="text-left py-2 px-2 text-slate-500 font-semibold">Fecha</th>
                  <th className="text-left py-2 px-2 text-slate-500 font-semibold">Tipo</th>
                  <th className="text-left py-2 px-2 text-slate-500 font-semibold hidden sm:table-cell">Combustible</th>
                  <th className="text-right py-2 px-2 text-slate-500 font-semibold">Litros</th>
                  <th className="text-right py-2 px-2 text-slate-500 font-semibold hidden sm:table-cell">Odóm.</th>
                  <th className="text-right py-2 px-2 text-slate-500 font-semibold hidden md:table-cell">km/L</th>
                  <th className="text-right py-2 px-2 text-slate-500 font-semibold">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {logs.map(m => {
                  const esOrigen = m.consumidor_origen_id === consumidor.id && m.consumidor_id !== consumidor.id;
                  return (
                    <tr key={m.id} className="hover:bg-slate-50/60">
                      <td className="py-2 px-2 text-slate-600 font-medium">{m.fecha}</td>
                      <td className="py-2 px-2">
                        <div className="flex items-center gap-1">
                          {m.tipo === 'COMPRA'   ? <ArrowDownCircle className="w-3 h-3 text-orange-400" />
                           : m.tipo === 'DEPOSITO' ? <Warehouse className="w-3 h-3 text-teal-500" />
                           : <ArrowLeftRight className="w-3 h-3 text-purple-400" />}
                          <Badge variant="outline" className={`text-[9px] py-0 px-1 ${
                            m.tipo === 'COMPRA'   ? 'border-orange-200 text-orange-600' :
                            m.tipo === 'DESPACHO' ? 'border-purple-200 text-purple-600' :
                            m.tipo === 'DEPOSITO' ? 'border-teal-200 text-teal-600' :
                            'border-emerald-200 text-emerald-600'
                          }`}>
                            {esOrigen ? 'Origen' : m.tipo}
                          </Badge>
                        </div>
                      </td>
                      <td className="py-2 px-2 text-slate-500 hidden sm:table-cell">{m.combustible_nombre || '—'}</td>
                      <td className="py-2 px-2 text-right font-medium text-slate-700">{m.litros != null ? `${Number(m.litros).toFixed(1)} L` : '—'}</td>
                      <td className="py-2 px-2 text-right text-slate-500 hidden sm:table-cell">{m.odometro != null ? m.odometro.toLocaleString() : '—'}</td>
                      <td className="py-2 px-2 text-right font-medium hidden md:table-cell">
                        {m.consumo_real != null
                          ? <span className="text-sky-600">{Number(m.consumo_real).toFixed(2)}</span>
                          : <span className="text-slate-300">—</span>
                        }
                      </td>
                      <td className="py-2 px-2 text-right font-bold text-slate-700">
                        {m.monto != null ? formatMonto(m.monto) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}