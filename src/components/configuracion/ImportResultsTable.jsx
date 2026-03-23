import React from 'react';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, AlertCircle, MinusCircle } from 'lucide-react';

const statusConfig = {
  ok: { icon: CheckCircle2, color: 'text-emerald-500', label: 'OK', bg: 'bg-emerald-50' },
  error: { icon: XCircle, color: 'text-red-500', label: 'Error', bg: 'bg-red-50' },
  skipped: { icon: MinusCircle, color: 'text-slate-400', label: 'Omitido', bg: 'bg-slate-50' },
};

export default function ImportResultsTable({ rows, mode }) {
  if (!rows || rows.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-100 max-h-80 overflow-y-auto">
      <table className="w-full text-xs">
        <thead className="bg-slate-50 sticky top-0">
          <tr>
            <th className="text-left px-3 py-2 text-slate-500 font-medium">Fecha</th>
            <th className="text-left px-3 py-2 text-slate-500 font-medium">Tipo</th>
            <th className="text-left px-3 py-2 text-slate-500 font-medium">Tarjeta</th>
            <th className="text-left px-3 py-2 text-slate-500 font-medium">Vehículo</th>
            <th className="text-left px-3 py-2 text-slate-500 font-medium">Combustible</th>
            <th className="text-right px-3 py-2 text-slate-500 font-medium">Monto</th>
            <th className="text-left px-3 py-2 text-slate-500 font-medium">Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rows.map((item, i) => {
            const hasError = item.errors?.length > 0;
            const hasWarning = item.warnings?.length > 0;
            const st = mode === 'results' ? statusConfig[item.status] : null;
            const Icon = st?.icon;

            return (
              <tr key={i} className={`${hasError ? 'bg-red-50/40' : hasWarning ? 'bg-amber-50/30' : ''}`}>
                <td className="px-3 py-2 text-slate-700 font-mono">{item.fecha || item.movimiento?.fecha || '—'}</td>
                <td className="px-3 py-2">
                  <Badge
                    variant="outline"
                    className={`text-[10px] py-0 px-1.5 ${
                      item.accion === 'RECARGA' ? 'border-emerald-200 text-emerald-700' : 'border-orange-200 text-orange-700'
                    }`}
                  >
                    {item.accion || '—'}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-slate-600">{item.movimiento?.tarjeta_alias || item.row?.Tarjeta || '—'}</td>
                <td className="px-3 py-2 text-slate-600">{item.movimiento?.vehiculo_chapa || item.row?.Chapa || '—'}</td>
                <td className="px-3 py-2 text-slate-600">{item.movimiento?.combustible_nombre || item.row?.['Tipo Combustible'] || '—'}</td>
                <td className="px-3 py-2 text-right text-slate-700 font-medium">
                  {item.movimiento?.monto != null ? `$${item.movimiento.monto.toFixed(2)}` : '—'}
                </td>
                <td className="px-3 py-2">
                  {mode === 'results' && st ? (
                    <div className="flex items-center gap-1">
                      <Icon className={`w-3.5 h-3.5 ${st.color}`} />
                      <span className={st.color}>{st.label}</span>
                    </div>
                  ) : hasError ? (
                    <div className="flex items-center gap-1">
                      <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                      <span className="text-red-600 truncate max-w-[140px]" title={item.errors.join(', ')}>
                        {item.errors[0]}
                      </span>
                    </div>
                  ) : hasWarning ? (
                    <div className="flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span className="text-amber-600 truncate max-w-[140px]" title={item.warnings.join(', ')}>
                        {item.warnings[0]}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-emerald-600">Listo</span>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
