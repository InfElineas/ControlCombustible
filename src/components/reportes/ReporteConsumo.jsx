import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, TrendingUp, HelpCircle } from 'lucide-react';
import { formatMonto } from '@/components/ui-helpers/SaldoUtils';
import ExportButton from '@/components/ui-helpers/ExportButton';

// Detecta estado de consumo.
// Devuelve 'inconsistente' si el valor es físicamente improbable (< 15% de la referencia).
// El estado normal/alerta/crítico compara la desviación contra la referencia.
function getEstadoConsumo(consumo, consumoRef, umbralAlerta, umbralCritico) {
  if (consumo == null || !consumoRef) return null;
  if (consumo < consumoRef * 0.15) return 'inconsistente';
  const desv = ((consumoRef - consumo) / consumoRef) * 100;
  if (desv >= (umbralCritico ?? 30)) return 'critico';
  if (desv >= (umbralAlerta  ?? 15)) return 'alerta';
  return 'normal';
}

const STATUS_CONFIG = {
  normal:        { label: 'Normal',        bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: TrendingUp  },
  alerta:        { label: 'Alerta',        bg: 'bg-amber-50  text-amber-700  border-amber-200',     icon: AlertTriangle },
  critico:       { label: 'Crítico',       bg: 'bg-red-50    text-red-700    border-red-200',       icon: AlertTriangle },
  inconsistente: { label: 'Dato incierto', bg: 'bg-slate-100 text-slate-600  border-slate-300',     icon: HelpCircle    },
};

export default function ReporteConsumo({ consumidores, movimientos }) {
  const reporte = useMemo(() => {
    return consumidores
      .filter(c => c.activo)
      .map(c => {
        const movsAbast  = movimientos.filter(m => (m.tipo === 'COMPRA' || m.tipo === 'DESPACHO') && m.consumidor_id === c.id);
        const movsCompra = movimientos.filter(m => m.tipo === 'COMPRA' && m.consumidor_id === c.id);
        const litrosTotal = movsAbast.reduce((s, m) => s + (m.litros || 0), 0);
        const montoTotal  = movsCompra.reduce((s, m) => s + (m.monto  || 0), 0);
        const cargas = movsAbast.length;

        // Movimientos con odómetro ordenados por odómetro ascendente
        const movsConOdo = movimientos
          .filter(m => (m.tipo === 'COMPRA' || m.tipo === 'DESPACHO') && m.consumidor_id === c.id && m.odometro != null)
          .sort((a, b) => (a.odometro || 0) - (b.odometro || 0));

        // Por cada par consecutivo: km, litros, días y consumo km/L
        const intervalos = movsConOdo
          .map((fill, idx) => {
            if (idx === 0) return null;
            const prev = movsConOdo[idx - 1];
            const km  = (fill.odometro || 0) - (prev.odometro || 0);
            const lit = fill.litros || 0;
            const días = fill.fecha && prev.fecha
              ? Math.max(0, (new Date(fill.fecha) - new Date(prev.fecha)) / 86400000)
              : null;
            const consumo = km > 0 && lit > 0 ? km / lit : null;
            if (!consumo) return null;
            return {
              consumo,
              km,
              lit,
              días,
              // Intervalo sospechoso: < 12 h entre cargas con < 20 km recorridos
              sospechoso: días != null && días < 0.5 && km < 20,
              kmPorDia:   días > 0.01 ? km  / días : null,
              litsPorDia: días > 0.01 ? lit / días : null,
              fecha:      fill.fecha,
              odometro:   fill.odometro,
            };
          })
          .filter(Boolean);

        // Promedio km-ponderado: totalKm / totalLitros
        // Más robusto que la media simple — los tramos largos pesan más
        const totalKmOdo  = intervalos.reduce((s, f) => s + f.km,  0);
        const totalLitOdo = intervalos.reduce((s, f) => s + f.lit, 0);
        const consumoPromedio = totalKmOdo > 0 && totalLitOdo > 0
          ? totalKmOdo / totalLitOdo
          : null;

        // Último intervalo (más reciente)
        const ultimoIntervalo = intervalos[intervalos.length - 1] ?? null;
        const consumoUltimo   = ultimoIntervalo?.consumo ?? null;

        // Último marcado como incierto si: intervalo muy corto O valor físicamente improbable
        const consumoRef    = c.datos_vehiculo?.indice_consumo_real || c.datos_vehiculo?.indice_consumo_fabricante || null;
        const ultimoIncierto = ultimoIntervalo != null && (
          ultimoIntervalo.sospechoso ||
          (consumoRef != null && consumoUltimo < consumoRef * 0.15)
        );

        // Días promedio entre cargas (excluye intervalos sin fecha)
        const intervalosConDias = intervalos.filter(f => f.días != null);
        const diasPromEntreCargas = intervalosConDias.length > 0
          ? intervalosConDias.reduce((s, f) => s + f.días, 0) / intervalosConDias.length
          : null;

        const umbralAlerta  = c.datos_vehiculo?.umbral_alerta_pct  ?? 15;
        const umbralCritico = c.datos_vehiculo?.umbral_critico_pct ?? 30;

        // Estado principal: basado en el PROMEDIO (más estable que el último)
        const estadoPromedio = getEstadoConsumo(consumoPromedio, consumoRef, umbralAlerta, umbralCritico);
        // Estado del último: si es incierto lo marca aparte para no confundirlo con un problema real
        const estadoUltimo   = ultimoIncierto
          ? 'inconsistente'
          : getEstadoConsumo(consumoUltimo, consumoRef, umbralAlerta, umbralCritico);

        // Historial de los últimos 5 intervalos (más recientes primero)
        const historial = [...intervalos].reverse().slice(0, 5);

        return {
          id: c.id,
          nombre: c.nombre,
          codigo_interno: c.codigo_interno || '',
          tipo: c.tipo_consumidor_nombre || '',
          litros: litrosTotal,
          monto: montoTotal,
          cargas,
          consumoUltimo,
          consumoPromedio,
          consumoRef,
          estadoUltimo,
          estadoPromedio,
          ultimoIncierto,
          diasPromEntreCargas,
          historial,
          tieneOdometro: movsConOdo.length > 0,
        };
      })
      .filter(r => r.cargas > 0);
  }, [consumidores, movimientos]);

  const csvConsumo = [
    { label: 'Consumidor',           accessor: 'nombre' },
    { label: 'Código',               accessor: 'codigo_interno' },
    { label: 'Tipo',                 accessor: 'tipo' },
    { label: 'Cargas',               accessor: 'cargas' },
    { label: 'Litros',               accessor: r => r.litros.toFixed(2) },
    { label: 'Monto',                accessor: r => formatMonto(r.monto) },
    { label: 'Ref (km/L)',           accessor: r => r.consumoRef?.toFixed(2) || '—' },
    { label: 'Prom (km/L)',          accessor: r => r.consumoPromedio?.toFixed(2) || '—' },
    { label: 'Último (km/L)',        accessor: r => r.consumoUltimo?.toFixed(2) || '—' },
    { label: 'Días prom/carga',      accessor: r => r.diasPromEntreCargas?.toFixed(1) || '—' },
    { label: 'Estado',               accessor: r => r.estadoPromedio || '—' },
    { label: 'Último estado',        accessor: r => r.estadoUltimo || '—' },
  ];

  if (reporte.length === 0) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="py-12 text-center text-slate-400 text-sm">
          No hay datos de consumo registrados aún.
        </CardContent>
      </Card>
    );
  }

  const alertasCriticas   = reporte.filter(r => r.estadoPromedio === 'critico');
  const alertasAlerta     = reporte.filter(r => r.estadoPromedio === 'alerta');
  const alertasInconsist  = reporte.filter(r => r.estadoUltimo   === 'inconsistente' && r.estadoPromedio !== 'critico');

  return (
    <div className="space-y-4">
      {/* Banners de alerta */}
      {(alertasCriticas.length > 0 || alertasAlerta.length > 0 || alertasInconsist.length > 0) && (
        <div className="space-y-2">
          {alertasCriticas.map(r => (
            <div key={r.id} className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span className="font-semibold text-red-700">{r.nombre}</span>
              <span className="text-red-600">
                consumo promedio crítico: {r.consumoPromedio?.toFixed(2)} km/L vs {r.consumoRef?.toFixed(2)} km/L ref.
                {r.diasPromEntreCargas != null && (
                  <span className="text-red-400 ml-2">(carga c/ ~{r.diasPromEntreCargas.toFixed(0)} días)</span>
                )}
              </span>
            </div>
          ))}
          {alertasAlerta.map(r => (
            <div key={r.id} className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="font-semibold text-amber-700">{r.nombre}</span>
              <span className="text-amber-600">
                consumo promedio en alerta: {r.consumoPromedio?.toFixed(2)} km/L vs {r.consumoRef?.toFixed(2)} km/L ref.
              </span>
            </div>
          ))}
          {alertasInconsist.map(r => (
            <div key={r.id} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm">
              <HelpCircle className="w-4 h-4 text-slate-500 shrink-0" />
              <span className="font-semibold text-slate-600">{r.nombre}</span>
              <span className="text-slate-500">
                última carga con dato incierto: {r.consumoUltimo?.toFixed(2)} km/L
                {r.historial[0]?.sospechoso && ' (intervalo entre cargas muy corto)'}
                {r.historial[0]?.días != null && ` — ${r.historial[0].días < 1 ? `${(r.historial[0].días * 24).toFixed(0)}h` : `${r.historial[0].días.toFixed(1)} días`} desde carga anterior`}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Tabla principal */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-700">Consumo por Consumidor</CardTitle>
          <ExportButton data={reporte} columns={csvConsumo} filename="reporte_consumo" title="Reporte de Consumo" />
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50">
                  <TableHead className="text-xs">Consumidor</TableHead>
                  <TableHead className="text-xs hidden md:table-cell">Tipo</TableHead>
                  <TableHead className="text-xs text-right">Litros</TableHead>
                  <TableHead className="text-xs text-right hidden sm:table-cell">Monto</TableHead>
                  <TableHead className="text-xs text-right">Ref (km/L)</TableHead>
                  <TableHead className="text-xs text-right">Prom (km/L)</TableHead>
                  <TableHead className="text-xs text-right">Último (km/L)</TableHead>
                  <TableHead className="text-xs">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reporte.map(r => {
                  const statusCfg  = r.estadoPromedio ? STATUS_CONFIG[r.estadoPromedio] : null;
                  const StatusIcon = statusCfg?.icon;
                  return (
                    <TableRow
                      key={r.id}
                      className={
                        r.estadoPromedio === 'critico'       ? 'bg-red-50/30'
                        : r.estadoPromedio === 'alerta'      ? 'bg-amber-50/30'
                        : r.estadoPromedio === 'inconsistente' ? 'bg-slate-50/50'
                        : ''
                      }
                    >
                      <TableCell>
                        <div className="font-medium text-sm">{r.nombre}</div>
                        {r.codigo_interno && (
                          <div className="text-xs text-slate-400">{r.codigo_interno}</div>
                        )}
                        {r.diasPromEntreCargas != null && (
                          <div className="text-[10px] text-slate-400">
                            ~{r.diasPromEntreCargas.toFixed(0)} días/carga · {r.cargas} cargas
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-slate-500 hidden md:table-cell">
                        {r.tipo || '—'}
                      </TableCell>
                      <TableCell className="text-right text-sm">{r.litros.toFixed(1)} L</TableCell>
                      <TableCell className="text-right text-sm hidden sm:table-cell">
                        {formatMonto(r.monto)}
                      </TableCell>
                      <TableCell className="text-right text-sm text-slate-400">
                        {r.consumoRef?.toFixed(2) ?? '—'}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {r.consumoPromedio != null ? (
                          <span className={
                            r.estadoPromedio === 'critico'       ? 'text-red-600 font-semibold'
                            : r.estadoPromedio === 'alerta'      ? 'text-amber-600 font-semibold'
                            : r.estadoPromedio === 'inconsistente' ? 'text-slate-500'
                            : 'text-slate-700'
                          }>
                            {r.consumoPromedio.toFixed(2)}
                          </span>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {r.consumoUltimo != null ? (
                          <span className={
                            r.estadoUltimo === 'inconsistente' ? 'text-slate-400 italic'
                            : r.estadoUltimo === 'critico'     ? 'text-red-600 font-bold'
                            : r.estadoUltimo === 'alerta'      ? 'text-amber-600 font-bold'
                            : 'text-emerald-700 font-semibold'
                          }>
                            {r.consumoUltimo.toFixed(2)}
                            {r.ultimoIncierto && (
                              <HelpCircle className="inline w-3 h-3 ml-1 text-slate-400" title="Dato posiblemente incorrecto" />
                            )}
                          </span>
                        ) : '—'}
                      </TableCell>
                      <TableCell>
                        {statusCfg ? (
                          <Badge variant="outline" className={`text-[10px] gap-1 ${statusCfg.bg}`}>
                            <StatusIcon className="w-3 h-3" />
                            {statusCfg.label}
                          </Badge>
                        ) : (
                          <span className="text-xs text-slate-300">Sin datos</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
