import React, { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ArrowUpCircle, ArrowDownCircle, ArrowLeftRight, Warehouse, Fuel } from 'lucide-react';
import { formatMonto } from '@/components/ui-helpers/SaldoUtils';

const TIPO_CONFIG = {
  RECARGA:  { label: 'Recarga',  icon: ArrowUpCircle,   bg: 'bg-emerald-50', text: 'text-emerald-600', badge: 'border-emerald-200 text-emerald-700' },
  COMPRA:   { label: 'Compra',   icon: ArrowDownCircle, bg: 'bg-orange-50',  text: 'text-orange-600',  badge: 'border-orange-200 text-orange-700' },
  DESPACHO: { label: 'Despacho', icon: ArrowLeftRight,  bg: 'bg-purple-50',  text: 'text-purple-600',  badge: 'border-purple-200 text-purple-700' },
  DEPOSITO: { label: 'Depósito', icon: Warehouse,       bg: 'bg-teal-50',    text: 'text-teal-600',    badge: 'border-teal-200 text-teal-700' },
};

export default function LogConsumidorModal({ movimiento, todosMovimientos, onClose }) {
  const consumidorId = movimiento?.consumidor_id;
  const consumidorNombre = movimiento?.consumidor_nombre || movimiento?.vehiculo_chapa || '—';

  const logs = useMemo(() => {
    if (!consumidorId || !todosMovimientos) return [];
    return todosMovimientos
      .filter(m => m.consumidor_id === consumidorId || m.consumidor_origen_id === consumidorId)
      .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  }, [consumidorId, todosMovimientos]);

  const totalLitros = logs.filter(m => m.consumidor_id === consumidorId && (m.tipo === 'COMPRA' || m.tipo === 'DESPACHO' || m.tipo === 'DEPOSITO')).reduce((s, m) => s + (m.litros || 0), 0);
  const totalGasto = logs.filter(m => m.consumidor_id === consumidorId && (m.tipo === 'COMPRA' || m.tipo === 'DEPOSITO')).reduce((s, m) => s + (m.monto || 0), 0);

  return (
    <Dialog open={!!movimiento} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Fuel className="w-4 h-4 text-sky-500" />
            Log de movimientos — {consumidorNombre}
          </DialogTitle>
        </DialogHeader>

        {/* Resumen */}
        <div className="flex gap-3 mt-1 pb-3 border-b border-slate-100">
          <div className="bg-orange-50 rounded-lg px-3 py-2 flex-1 text-center">
            <p className="text-[10px] text-orange-500 uppercase font-semibold">Total litros</p>
            <p className="text-sm font-bold text-orange-700">{totalLitros.toFixed(1)} L</p>
          </div>
          <div className="bg-slate-50 rounded-lg px-3 py-2 flex-1 text-center">
            <p className="text-[10px] text-slate-500 uppercase font-semibold">Total gasto</p>
            <p className="text-sm font-bold text-slate-700">{formatMonto(totalGasto)}</p>
          </div>
          <div className="bg-sky-50 rounded-lg px-3 py-2 flex-1 text-center">
            <p className="text-[10px] text-sky-500 uppercase font-semibold">Movimientos</p>
            <p className="text-sm font-bold text-sky-700">{logs.length}</p>
          </div>
        </div>

        {/* Lista */}
        <div className="overflow-y-auto flex-1 space-y-1 mt-1 pr-1">
          {logs.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-8">Sin movimientos registrados</p>
          ) : logs.map(m => {
            const cfg = TIPO_CONFIG[m.tipo] || TIPO_CONFIG.COMPRA;
            const Icon = cfg.icon;
            const esOrigen = m.consumidor_origen_id === consumidorId && m.consumidor_id !== consumidorId;
            return (
              <div key={m.id} className={`flex items-center gap-3 p-3 rounded-lg border ${m.id === movimiento?.id ? 'border-sky-200 bg-sky-50' : 'border-slate-100 bg-white'}`}>
                <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${cfg.bg} ${cfg.text}`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-700">{m.fecha}</span>
                    <Badge variant="outline" className={`text-[10px] py-0 px-1.5 ${cfg.badge}`}>{cfg.label}</Badge>
                    {esOrigen && <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-purple-200 text-purple-600">Origen</Badge>}
                    {m.id === movimiento?.id && <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-sky-200 text-sky-600">Este</Badge>}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    {m.combustible_nombre && <span className="text-[11px] text-slate-400">{m.combustible_nombre}</span>}
                    {m.litros != null && <span className="text-[11px] text-slate-600 font-medium">{Number(m.litros).toFixed(1)} L</span>}
                    {m.odometro != null && <span className="text-[11px] text-slate-400">Odóm: {m.odometro.toLocaleString()} km</span>}
                    {m.consumo_real != null && <span className="text-[11px] text-sky-600 font-medium">{m.consumo_real.toFixed(2)} km/L</span>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {m.monto != null && (
                    <span className={`text-sm font-bold ${m.tipo === 'RECARGA' ? 'text-emerald-600' : 'text-slate-700'}`}>
                      {m.tipo === 'RECARGA' ? '+' : ''}{formatMonto(m.monto)}
                    </span>
                  )}
                  {m.monto == null && m.litros != null && (
                    <span className="text-sm font-bold text-purple-600">{Number(m.litros).toFixed(1)} L</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}