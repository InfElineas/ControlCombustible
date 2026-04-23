import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMonto } from '@/components/ui-helpers/SaldoUtils';
import CSVExport from '@/components/ui-helpers/CSVExport';
import { ArrowUpDown, List } from 'lucide-react';
import LogConsumidorMovimientosModal from '@/components/reportes/LogConsumidorMovimientosModal';

const COMBUSTIBLE_COLORS = [
  'bg-sky-100 text-sky-700',
  'bg-orange-100 text-orange-700',
  'bg-emerald-100 text-emerald-700',
  'bg-violet-100 text-violet-700',
  'bg-amber-100 text-amber-700',
];

function getIconForTipo(nombre) {
  const n = nombre?.toLowerCase() || '';
  if (n.includes('tanque') || n.includes('reserva')) return '🛢️';
  if (n.includes('equipo') || n.includes('grupo') || n.includes('generador')) return '⚡';
  if (n.includes('moto')) return '🏍️';
  return '🚗';
}

function CapacidadBar({ litrosActuales, capacidad }) {
  const [hovered, setHovered] = useState(false);

  if (!capacidad || capacidad <= 0) {
    // Barra relativa al máximo del reporte
    return null;
  }

  const pct = Math.min(100, (litrosActuales / capacidad) * 100);
  const color = pct < 20 ? 'bg-red-400' : pct < 50 ? 'bg-amber-400' : 'bg-sky-400';

  return (
    <div className="relative w-full"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      {hovered && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-10 bg-slate-800 text-white text-[10px] px-2 py-1 rounded-md whitespace-nowrap shadow-lg">
          {litrosActuales.toFixed(1)} L de {capacidad} L — <b>{pct.toFixed(0)}%</b> de capacidad
        </div>
      )}
      <div className="flex justify-between text-[9px] text-slate-400 mt-0.5">
        <span>{litrosActuales.toFixed(1)} L</span>
        <span>Cap: {capacidad} L ({pct.toFixed(0)}%)</span>
      </div>
    </div>
  );
}

function BarraRelativa({ pct, litros }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div className="relative w-full"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full bg-sky-400 transition-all" style={{ width: `${pct}%` }} />
      </div>
      {hovered && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-10 bg-slate-800 text-white text-[10px] px-2 py-1 rounded-md whitespace-nowrap shadow-lg">
          {litros.toFixed(1)} L ({pct.toFixed(0)}% del mayor consumidor)
        </div>
      )}
    </div>
  );
}

export default function ReporteVehiculos({ consumidores, movimientos }) {
  const [sortBy, setSortBy] = useState('litros');
  const [logConsumidor, setLogConsumidor] = useState(null);

  const reporteConsumidores = useMemo(() => {
    return consumidores.map(c => {
      const movs = movimientos.filter(m => m.tipo === 'COMPRA' && m.consumidor_id === c.id);
      const litros = movs.reduce((s, m) => s + (m.litros || 0), 0);
      const monto = movs.reduce((s, m) => s + (m.monto || 0), 0);

      const porComb = {};
      movs.forEach(m => {
        const key = m.combustible_nombre || 'Otro';
        if (!porComb[key]) porComb[key] = { litros: 0, monto: 0 };
        porComb[key].litros += m.litros || 0;
        porComb[key].monto += m.monto || 0;
      });

      // Capacidad del tanque (datos_vehiculo o datos_tanque)
      const capacidad = c.datos_vehiculo?.capacidad_tanque || c.datos_tanque?.capacidad_litros || null;

      return { c, litros, monto, compras: movs.length, porComb, capacidad };
    }).filter(r => r.compras > 0);
  }, [consumidores, movimientos]);

  const sorted = useMemo(() => {
    return [...reporteConsumidores].sort((a, b) => b[sortBy] - a[sortBy]);
  }, [reporteConsumidores, sortBy]);

  const maxLitros = sorted[0]?.litros || 1;

  const allCombNames = [...new Set(reporteConsumidores.flatMap(r => Object.keys(r.porComb)))];
  const combColorMap = Object.fromEntries(allCombNames.map((k, i) => [k, COMBUSTIBLE_COLORS[i % COMBUSTIBLE_COLORS.length]]));

  const csvData = sorted.map(r => ({
    nombre: r.c.nombre,
    codigo_interno: r.c.codigo_interno || '',
    tipo: r.c.tipo_consumidor_nombre || '',
    litros: r.litros,
    monto: r.monto,
    compras: r.compras,
    capacidad: r.capacidad || '',
    pct_capacidad: r.capacidad ? `${((r.litros / r.capacidad) * 100).toFixed(0)}%` : '',
    desglose: Object.entries(r.porComb).map(([k, v]) => `${k}: ${v.litros.toFixed(1)}L`).join('; '),
  }));

  const csvColumns = [
    { label: 'Nombre', accessor: 'nombre' },
    { label: 'Código', accessor: 'codigo_interno' },
    { label: 'Tipo', accessor: 'tipo' },
    { label: 'Litros', accessor: 'litros' },
    { label: 'Monto', accessor: 'monto' },
    { label: 'Cargas', accessor: 'compras' },
    { label: 'Capacidad (L)', accessor: 'capacidad' },
    { label: '% Capacidad', accessor: 'pct_capacidad' },
    { label: 'Desglose', accessor: 'desglose' },
  ];

  const SortBtn = ({ field, label }) => (
    <button
      onClick={() => setSortBy(field)}
      className={`flex items-center gap-1 text-xs font-semibold uppercase tracking-wide transition-colors ${sortBy === field ? 'text-sky-600' : 'text-slate-400 hover:text-slate-600'}`}
    >
      {label}
      <ArrowUpDown className="w-3 h-3" />
    </button>
  );

  if (sorted.length === 0) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="py-12 text-center text-sm text-slate-400">
          No hay compras registradas en el período seleccionado
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-0 shadow-sm">
        <CardHeader className="p-4 pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-700">Reporte por Consumidor</CardTitle>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              Ordenar:
              <SortBtn field="litros" label="Litros" />
              <SortBtn field="monto" label="Monto" />
              <SortBtn field="compras" label="#" />
            </div>
            <CSVExport data={csvData} columns={csvColumns} filename="reporte_consumidores" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-slate-100">
            {sorted.map((r, idx) => {
              const pctRelativo = (r.litros / maxLitros) * 100;
              const tieneCapacidad = r.capacidad && r.capacidad > 0;

              return (
                <div key={r.c.id} className={`px-4 py-3 ${idx === 0 ? 'bg-sky-50/40' : 'hover:bg-slate-50/60'} transition-colors`}>
                  <div className="flex items-start gap-3">
                    {/* Rank */}
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5 ${
                      idx === 0 ? 'bg-sky-500 text-white' :
                      idx === 1 ? 'bg-slate-400 text-white' :
                      idx === 2 ? 'bg-amber-500 text-white' :
                      'bg-slate-100 text-slate-500'
                    }`}>
                      {idx + 1}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Header row */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm">{getIconForTipo(r.c.tipo_consumidor_nombre)}</span>
                            <span className="text-sm font-semibold text-slate-800 truncate">{r.c.nombre}</span>
                            {r.c.codigo_interno && (
                              <span className="text-[11px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{r.c.codigo_interno}</span>
                            )}
                            {r.c.tipo_consumidor_nombre && (
                              <Badge variant="outline" className="text-[10px] py-0 px-1.5 shrink-0">{r.c.tipo_consumidor_nombre}</Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="flex items-center gap-4 text-right">
                            <div>
                              <p className="text-[10px] text-slate-400 uppercase tracking-wide">Litros</p>
                              <p className="text-sm font-bold text-slate-800">{r.litros.toFixed(1)} L</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-slate-400 uppercase tracking-wide">Monto</p>
                              <p className="text-sm font-bold text-slate-800">{formatMonto(r.monto)}</p>
                            </div>
                            <div className="hidden sm:block">
                              <p className="text-[10px] text-slate-400 uppercase tracking-wide">#Cargas</p>
                              <p className="text-sm font-semibold text-slate-500">{r.compras}</p>
                            </div>
                          </div>
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                            title="Ver todos los movimientos"
                            onClick={() => setLogConsumidor({ consumidor: r.c, movimientos })}
                          >
                            <List className="w-3.5 h-3.5 text-slate-400" />
                          </Button>
                        </div>
                      </div>

                      {/* Barra: con capacidad muestra % real, sin capacidad muestra relativa */}
                      <div className="mb-1.5">
                        {tieneCapacidad
                          ? <CapacidadBar litrosActuales={r.litros} capacidad={r.capacidad} />
                          : <BarraRelativa pct={pctRelativo} litros={r.litros} />
                        }
                      </div>

                      {/* Desglose por combustible */}
                      {Object.keys(r.porComb).length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {Object.entries(r.porComb).map(([k, v]) => (
                            <span key={k} className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${combColorMap[k]}`}>
                              {k}: {v.litros.toFixed(1)} L · {formatMonto(v.monto)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {logConsumidor && (
        <LogConsumidorMovimientosModal
          consumidor={logConsumidor.consumidor}
          movimientos={logConsumidor.movimientos}
          onClose={() => setLogConsumidor(null)}
        />
      )}
    </>
  );
}