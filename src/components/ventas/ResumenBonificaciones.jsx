import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Table2 } from 'lucide-react';
import { formatMonto } from '@/components/ui-helpers/SaldoUtils';

const fmtL = n => (n % 1 === 0 ? String(Math.round(n)) : n.toFixed(1));

// Columnas del desglose. El orden sigue el ciclo de vida de una bonificación,
// que es como la gente piensa el dato: lo que falta por entregar, lo entregado
// sin cobrar y lo ya cobrado.
const COLUMNAS = [
  { estado: 'PENDIENTE',         label: 'Pendiente', cls: 'text-amber-600 dark:text-amber-400' },
  { estado: 'ENTREGADO',         label: 'Entregado', cls: 'text-sky-600 dark:text-sky-400' },
  { estado: 'PAGADO_FINALIZADO', label: 'Pagado',    cls: 'text-emerald-600 dark:text-emerald-400' },
  { estado: 'CANCELADO',         label: 'Cancelado', cls: 'text-slate-400' },
];

/**
 * Desglose de litros e importe por combustible y estado.
 *
 * Responde de un vistazo las preguntas que antes obligaban a ir pestaña por
 * pestaña: cuánta gasolina se ha pagado, cuánta queda pendiente, cuántos litros
 * se entregaron. Respeta los filtros de arriba, así que acotando por tanque o
 * por área se obtiene el mismo desglose de ese subconjunto.
 */
export default function ResumenBonificaciones({ ventas, normalizeEstado, canVerPrecios = true }) {
  const [abierto, setAbierto] = useState(true);

  const { filas, totales } = useMemo(() => {
    const porCombustible = new Map();

    for (const v of ventas) {
      const clave = v.combustible_nombre || 'Sin combustible';
      if (!porCombustible.has(clave)) {
        porCombustible.set(clave, {
          combustible: clave,
          celdas: Object.fromEntries(COLUMNAS.map(c => [c.estado, { n: 0, litros: 0, monto: 0 }])),
        });
      }
      const fila = porCombustible.get(clave);
      const estado = normalizeEstado(v.estado);
      const celda = fila.celdas[estado];
      if (!celda) continue; // un estado que no está en el desglose
      celda.n += 1;
      celda.litros += v.litros || 0;
      celda.monto += v.monto || 0;
    }

    const filas = [...porCombustible.values()]
      .sort((a, b) => a.combustible.localeCompare(b.combustible));

    // El total de cada columna, para leer la fila de abajo sin sumar a mano.
    const totales = Object.fromEntries(COLUMNAS.map(c => [c.estado, { n: 0, litros: 0, monto: 0 }]));
    for (const f of filas) {
      for (const c of COLUMNAS) {
        totales[c.estado].n += f.celdas[c.estado].n;
        totales[c.estado].litros += f.celdas[c.estado].litros;
        totales[c.estado].monto += f.celdas[c.estado].monto;
      }
    }
    return { filas, totales };
  }, [ventas, normalizeEstado]);

  if (filas.length === 0) return null;

  const Celda = ({ dato, cls }) => (
    <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
      {dato.n === 0 ? (
        <span className="text-slate-300 dark:text-slate-600">—</span>
      ) : (
        <>
          <span className={`font-semibold ${cls}`}>{fmtL(dato.litros)} L</span>
          {canVerPrecios && dato.monto > 0 && (
            <span className="block text-[10px] text-slate-400">{formatMonto(dato.monto)}</span>
          )}
          <span className="block text-[10px] text-slate-300 dark:text-slate-600">{dato.n} reg.</span>
        </>
      )}
    </td>
  );

  return (
    <div className="rounded-2xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setAbierto(a => !a)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-slate-50/60 dark:hover:bg-slate-800/60 transition-colors"
      >
        <Table2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex-1">
          Desglose por combustible y estado
        </span>
        {abierto
          ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
          : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
      </button>

      {abierto && (
        <div className="overflow-x-auto border-t border-slate-100 dark:border-slate-700">
          <table className="w-full min-w-[34rem] text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-700">
                <th className="px-3 py-2 text-left font-semibold">Combustible</th>
                {COLUMNAS.map(c => (
                  <th key={c.estado} className="px-2 py-2 text-right font-semibold">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {filas.map(f => (
                <tr key={f.combustible}>
                  <td className="px-3 py-1.5 font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap">
                    {f.combustible}
                  </td>
                  {COLUMNAS.map(c => (
                    <Celda key={c.estado} dato={f.celdas[c.estado]} cls={c.cls} />
                  ))}
                </tr>
              ))}
              {filas.length > 1 && (
                <tr className="bg-slate-50/70 dark:bg-slate-800/50">
                  <td className="px-3 py-1.5 font-bold text-slate-700 dark:text-slate-200">Total</td>
                  {COLUMNAS.map(c => (
                    <Celda key={c.estado} dato={totales[c.estado]} cls={c.cls} />
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
