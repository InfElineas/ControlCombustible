import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from "@/components/ui/card";
import { ChevronRight, Droplets } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { formatMonto } from '@/components/ui-helpers/SaldoUtils';
import {
  SIN_CONCEPTO, colorDeSerie, ordenarSeries, mapaConceptoPorConsumidor,
} from './coloresDesglose';

const fmtL = n => (n % 1 === 0 ? String(Math.round(n)) : n.toFixed(1));

/**
 * Litros consumidos del período, repartidos por concepto y, dentro de cada uno,
 * por consumidor.
 *
 * Cuenta los DESPACHO, que es lo que sale de verdad hacia quien lo usa. Se
 * dejan fuera los que van a parar a otro sitio de almacenamiento —surtidores,
 * tanques y depósitos—: ese combustible sigue siendo de la empresa, y contarlo
 * al entrar y otra vez al salir duplicaría los litros.
 */
export default function ConsumoPorConcepto({
  movimientos = [], consumidores = [], tiposConsumidor = [], idsAlmacenamiento,
}) {
  const [abierto, setAbierto] = useState(null);

  const { data: conceptos = [] } = useQuery({
    queryKey: ['conceptos-precio'],
    queryFn: () => base44.entities.ConceptoPrecio.list(),
    staleTime: 10 * 60_000,
  });

  const { grupos, totalLitros, totalMonto } = useMemo(() => {
    const conceptoDe = mapaConceptoPorConsumidor(consumidores, tiposConsumidor, conceptos);
    const nombreDe   = new Map(consumidores.map(c => [c.id, c.nombre]));
    const porId      = new Map(consumidores.map(c => [c.id, c]));
    const tipoPorId  = new Map(tiposConsumidor.map(t => [t.id, t]));

    // Por qué este consumidor no tiene concepto. Sin esto, «Sin concepto» es un
    // pendiente que no dice dónde está el fallo ni dónde se arregla.
    const motivoSinConcepto = (id) => {
      // Los despachos de bonificación se guardan así a propósito: copian el
      // nombre del destino pero dejan consumidor_id en blanco. Sin ficha no hay
      // tipo, y sin tipo no hay concepto del que tirar.
      if (!id) return 'el despacho guarda solo el nombre del destino, sin ficha de consumidor';
      const c = porId.get(id);
      if (!c) return 'no está en el catálogo de consumidores';
      if (!c.tipo_consumidor_id) return 'no tiene tipo de consumidor asignado';
      const t = tipoPorId.get(c.tipo_consumidor_id);
      if (!t) return `su tipo (${c.tipo_consumidor_nombre || 'desconocido'}) ya no existe`;
      if (!t.concepto_id) return `el tipo «${t.nombre}» no tiene concepto asignado`;
      return 'el concepto asignado a su tipo ya no existe';
    };

    const acumulado = new Map();   // concepto → { litros, monto, porConsumidor }
    let totalLitros = 0, totalMonto = 0;

    movimientos.forEach(m => {
      if (m.tipo !== 'DESPACHO') return;
      if (idsAlmacenamiento?.has(m.consumidor_id)) return;
      const litros = m.litros || 0;
      if (litros <= 0) return;

      const concepto = conceptoDe.get(m.consumidor_id) || SIN_CONCEPTO;
      const monto    = m.monto || 0;
      totalLitros += litros;
      totalMonto  += monto;

      if (!acumulado.has(concepto)) acumulado.set(concepto, { litros: 0, monto: 0, despachos: 0, porConsumidor: new Map() });
      const g = acumulado.get(concepto);
      g.litros += litros; g.monto += monto; g.despachos += 1;

      // Sin ficha de consumidor se agrupa por el nombre que trae el movimiento.
      // Con una sola clave para todos, destinos distintos —bonificaciones, uso
      // logístico, lo que sea— se sumaban en una fila con el nombre del primero
      // que llegara.
      const rotulo = nombreDe.get(m.consumidor_id) || m.consumidor_nombre || 'Sin consumidor';
      const clave  = m.consumidor_id || `nombre:${rotulo}`;
      if (!g.porConsumidor.has(clave)) g.porConsumidor.set(clave, {
        nombre: rotulo, litros: 0, monto: 0, despachos: 0,
        motivo: concepto === SIN_CONCEPTO ? motivoSinConcepto(m.consumidor_id) : null,
      });
      const c = g.porConsumidor.get(clave);
      c.litros += litros; c.monto += monto; c.despachos += 1;
    });

    const orden = ordenarSeries([...acumulado.keys()]);
    const grupos = orden.map((nombre, i) => ({
      nombre,
      color: colorDeSerie(nombre, 'concepto', i),
      ...acumulado.get(nombre),
      consumidores: [...acumulado.get(nombre).porConsumidor.values()].sort((a, b) => b.litros - a.litros),
    }));

    return { grupos, totalLitros, totalMonto };
  }, [movimientos, consumidores, tiposConsumidor, conceptos, idsAlmacenamiento]);

  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-baseline justify-between gap-2 mb-3">
          <p className="text-[11px] text-slate-400 uppercase tracking-wide">Litros por concepto de consumo</p>
          <p className="text-xs text-slate-400">
            {fmtL(totalLitros)} L{totalMonto > 0 ? ` · ${formatMonto(totalMonto)}` : ''}
          </p>
        </div>

        {grupos.length === 0 ? (
          <div className="py-6 text-center">
            <Droplets className="w-7 h-7 text-slate-200 mx-auto mb-1.5" />
            <p className="text-xs text-slate-400">Sin despachos en el período</p>
          </div>
        ) : (
          <div className="space-y-1">
            {grupos.map(g => {
              const pct = totalLitros > 0 ? (g.litros / totalLitros) * 100 : 0;
              const desplegado = abierto === g.nombre;
              return (
                <div key={g.nombre}>
                  <button
                    type="button"
                    onClick={() => setAbierto(desplegado ? null : g.nombre)}
                    className="w-full flex items-center gap-2 py-1.5 px-1 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 text-left"
                  >
                    <ChevronRight
                      className={`w-3.5 h-3.5 text-slate-300 shrink-0 transition-transform ${desplegado ? 'rotate-90' : ''}`}
                    />
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: g.color }} />
                    <span className="text-xs text-slate-600 dark:text-slate-300 truncate flex-1 min-w-0">{g.nombre}</span>
                    <span className="text-xs text-slate-400 tabular-nums shrink-0">{Math.round(pct)}%</span>
                    <span className="text-sm font-bold text-orange-600 tabular-nums shrink-0">{fmtL(g.litros)}</span>
                    <span className="text-[11px] font-semibold text-orange-500 shrink-0">L</span>
                  </button>

                  {/* Barra de proporción: comparar de un vistazo sin leer cifras */}
                  <div className="h-1 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden ml-[1.35rem] mr-1">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: g.color }} />
                  </div>

                  {desplegado && (
                    <div className="mt-1.5 mb-2 ml-[1.35rem] pl-2.5 border-l border-slate-100 dark:border-slate-700 space-y-1">
                      {g.consumidores.map(c => (
                        <div key={c.nombre}>
                          <div className="flex items-baseline gap-2 text-[11px]">
                            <span className="text-slate-500 dark:text-slate-400 truncate flex-1 min-w-0">{c.nombre}</span>
                            <span className="text-slate-300 tabular-nums shrink-0">
                              {c.despachos} {c.despachos === 1 ? 'despacho' : 'despachos'}
                            </span>
                            <span className="font-semibold text-slate-600 dark:text-slate-300 tabular-nums shrink-0">
                              {fmtL(c.litros)} L
                            </span>
                          </div>
                          {c.motivo && (
                            <p className="text-[10px] text-amber-600 dark:text-amber-400">{c.motivo}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            <div className="flex items-baseline gap-2 pt-2 mt-1 border-t border-slate-100 dark:border-slate-700">
              <span className="text-xs text-slate-400 flex-1">Total</span>
              <span className="text-sm font-bold text-slate-700 dark:text-slate-200 tabular-nums">{fmtL(totalLitros)}</span>
              <span className="text-[11px] font-semibold text-slate-400">L</span>
            </div>
          </div>
        )}

        <p className="text-[10px] text-slate-400 mt-2">
          Despachos del período, sin contar traslados a otros tanques, depósitos o
          surtidores. El concepto sale del tipo de cada consumidor; se asigna en
          Catálogos → Tipos de consumidor.
        </p>
      </CardContent>
    </Card>
  );
}
