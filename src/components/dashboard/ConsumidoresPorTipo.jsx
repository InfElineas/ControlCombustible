import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Droplets } from 'lucide-react';
import { formatMonto } from '@/components/ui-helpers/SaldoUtils';

function getIconForTipo(nombre) {
  const n = nombre?.toLowerCase() || '';
  if (n.includes('tanque') || n.includes('reserva')) return '🛢️';
  if (n.includes('equipo') || n.includes('grupo') || n.includes('generador')) return '⚡';
  if (n.includes('moto')) return '🏍️';
  return '🚗';
}

function esTanque(consumidor) {
  const n = (consumidor.tipo_consumidor_nombre || '').toLowerCase();
  return n.includes('tanque') || n.includes('reserva');
}

function StockBar({ pct }) {
  const [hovered, setHovered] = React.useState(false);
  const color = pct < 20 ? 'bg-red-400' : pct < 40 ? 'bg-amber-400' : 'bg-emerald-400';
  return (
    <div className="relative w-full"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      {hovered && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-20 bg-slate-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap shadow">
          {pct.toFixed(0)}% de capacidad
        </div>
      )}
    </div>
  );
}

function ConsumidorCard({ consumidor, movimientos, hoy }) {
  const movsConsumidor = movimientos.filter(m =>
    (m.tipo === 'COMPRA' || m.tipo === 'DESPACHO') && m.consumidor_id === consumidor.id
  ).sort((a, b) => b.fecha?.localeCompare(a.fecha));

  const ultimoMov = movsConsumidor[0];
  const diasSinAbast = ultimoMov
    ? Math.floor((hoy - new Date(ultimoMov.fecha)) / (1000 * 60 * 60 * 24))
    : null;

  // Litros y gasto del mes actual
  const mesActual = hoy.toISOString().slice(0, 7);
  const comprasMes = movimientos.filter(m =>
    m.tipo === 'COMPRA' && m.consumidor_id === consumidor.id && m.fecha?.startsWith(mesActual)
  );
  const litrosMes = comprasMes.reduce((s, m) => s + (m.litros || 0), 0);
  const gastoMes = comprasMes.reduce((s, m) => s + (m.monto || 0), 0);

  // Última carga (litros y monto)
  const ultimaCompra = movimientos
    .filter(m => m.tipo === 'COMPRA' && m.consumidor_id === consumidor.id)
    .sort((a, b) => b.fecha?.localeCompare(a.fecha))[0];

  // Consumo real - último registro con odómetro
  const movsConConsumo = movimientos.filter(m =>
    m.tipo === 'COMPRA' && m.consumidor_id === consumidor.id && m.consumo_real != null
  ).sort((a, b) => (b.odometro || 0) - (a.odometro || 0));
  const ultimoConsumoReal = movsConConsumo[0]?.consumo_real ?? null;
  const ultimoOdometro = movsConConsumo[0]?.odometro ?? null;

  // Referencia de consumo
  const consumoRef = consumidor.datos_vehiculo?.indice_consumo_real
    || consumidor.datos_vehiculo?.indice_consumo_fabricante
    || null;
  const umbralCritico = consumidor.datos_vehiculo?.umbral_critico_pct ?? 30;
  const umbralAlerta = consumidor.datos_vehiculo?.umbral_alerta_pct ?? 15;

  let estadoConsumo = null;
  if (consumoRef && ultimoConsumoReal != null) {
    const desv = ((consumoRef - ultimoConsumoReal) / consumoRef) * 100;
    if (desv >= umbralCritico) estadoConsumo = 'critico';
    else if (desv >= umbralAlerta) estadoConsumo = 'alerta';
  }

  // Stock para tanques (total entradas COMPRA - salidas DESPACHO como origen)
  const esTanqueConsumidor = esTanque(consumidor);
  const capacidad = consumidor.datos_tanque?.capacidad_litros || null;
  const stockActual = React.useMemo(() => {
    if (!esTanqueConsumidor) return null;
    const entradas = movimientos.filter(m => m.tipo === 'COMPRA' && m.consumidor_id === consumidor.id)
      .reduce((s, m) => s + (m.litros || 0), 0);
    const salidas = movimientos.filter(m => m.tipo === 'DESPACHO' && m.consumidor_origen_id === consumidor.id)
      .reduce((s, m) => s + (m.litros || 0), 0);
    return Math.max(0, entradas - salidas);
  }, [esTanqueConsumidor, movimientos, consumidor.id]);

  // Cobertura en días: promedio diario de consumo de los últimos 30 días de despacho
  const coberturaDias = React.useMemo(() => {
    if (!esTanqueConsumidor || stockActual == null) return null;
    const hace30 = new Date(hoy); hace30.setDate(hace30.getDate() - 30);
    const hace30Str = hace30.toISOString().slice(0, 10);
    const despachos30 = movimientos.filter(m =>
      m.tipo === 'DESPACHO' && m.consumidor_origen_id === consumidor.id && m.fecha >= hace30Str
    );
    const totalDespachadoL = despachos30.reduce((s, m) => s + (m.litros || 0), 0);
    if (totalDespachadoL === 0) return null;
    const promedioLDia = totalDespachadoL / 30;
    return Math.floor(stockActual / promedioLDia);
  }, [esTanqueConsumidor, stockActual, movimientos, consumidor.id, hoy]);

  const colorDias = diasSinAbast === null ? 'text-slate-400'
    : diasSinAbast > 14 ? 'text-red-500'
    : diasSinAbast > 7 ? 'text-amber-500'
    : 'text-emerald-600';

  const ringDias = diasSinAbast === null ? ''
    : diasSinAbast > 14 ? 'ring-1 ring-red-100'
    : diasSinAbast > 7 ? 'ring-1 ring-amber-100'
    : '';

  const ringConsumo = estadoConsumo === 'critico' ? 'ring-1 ring-red-200'
    : estadoConsumo === 'alerta' ? 'ring-1 ring-amber-200'
    : '';

  const stockPct = capacidad && stockActual != null ? (stockActual / capacidad) * 100 : null;

  return (
    <Card className={`border-0 shadow-sm ${ringDias || ringConsumo}`}>
      <CardContent className="p-3 space-y-2">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base leading-none">{getIconForTipo(consumidor.tipo_consumidor_nombre)}</span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-700 truncate leading-tight">{consumidor.nombre}</p>
              {consumidor.codigo_interno && (
                <p className="text-[11px] text-slate-400 font-mono truncate">{consumidor.codigo_interno}</p>
              )}
            </div>
          </div>
          {estadoConsumo && (
            <AlertTriangle className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${estadoConsumo === 'critico' ? 'text-red-500' : 'text-amber-500'}`} />
          )}
        </div>

        {/* Para tanques: stock visual */}
        {esTanqueConsumidor && stockActual != null && (
          <div>
            <div className="flex justify-between text-[10px] text-slate-500 mb-0.5">
              <span className="flex items-center gap-1"><Droplets className="w-3 h-3 text-blue-400" /> Stock actual</span>
              <span className="font-bold text-slate-700">{stockActual.toFixed(1)} L{capacidad ? ` / ${capacidad} L` : ''}</span>
            </div>
            {capacidad && <StockBar pct={stockPct} />}
            {coberturaDias != null && (
              <p className={`text-[10px] mt-1 font-medium ${coberturaDias < 3 ? 'text-red-500' : coberturaDias < 7 ? 'text-amber-500' : 'text-emerald-600'}`}>
                Cobertura estimada: ~{coberturaDias} días (basado en últimos 30d)
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          {/* Última carga */}
          {ultimaCompra && (
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">Última carga</p>
              <p className="font-semibold text-slate-700">
                {ultimaCompra.litros != null ? `${Number(ultimaCompra.litros).toFixed(1)} L` : ''}
                {ultimaCompra.monto != null ? <span className="text-slate-400 ml-1 text-[10px]">{formatMonto(ultimaCompra.monto)}</span> : ''}
              </p>
              <p className="text-[10px] text-slate-400">{ultimaCompra.fecha}</p>
            </div>
          )}

          {/* Litros este mes */}
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wide">Litros mes</p>
            <p className="font-semibold text-slate-700">{litrosMes > 0 ? `${litrosMes.toFixed(1)} L` : '—'}</p>
          </div>

          {/* Odómetro */}
          {!esTanqueConsumidor && ultimoOdometro != null && (
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">Odómetro</p>
              <p className="font-semibold text-slate-700">{ultimoOdometro.toLocaleString()} km</p>
            </div>
          )}

          {/* Días sin abastecer */}
          {!esTanqueConsumidor && (
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">Último abast.</p>
              {diasSinAbast === null
                ? <p className="text-slate-400">Sin registros</p>
                : <p className={`font-semibold ${colorDias}`}>{diasSinAbast}d atrás</p>
              }
            </div>
          )}

          {/* Consumo real */}
          {!esTanqueConsumidor && ultimoConsumoReal != null && (
            <div className="col-span-2">
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">Consumo real (últ. carga)</p>
              <div className="flex items-center gap-2">
                <p className={`font-semibold ${estadoConsumo === 'critico' ? 'text-red-600' : estadoConsumo === 'alerta' ? 'text-amber-600' : 'text-sky-700'}`}>
                  {ultimoConsumoReal.toFixed(2)} km/L
                </p>
                {consumoRef && (
                  <span className="text-[10px] text-slate-400">ref: {consumoRef.toFixed(2)} km/L</span>
                )}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function ConsumidoresPorTipo({ consumidores, tiposConsumidor, movimientos }) {
  const hoy = new Date();
  const consumidoresActivos = consumidores.filter(c => c.activo);

  const grupos = tiposConsumidor
    .filter(t => t.activo !== false)
    .map(tipo => ({
      tipo,
      items: consumidoresActivos.filter(c => c.tipo_consumidor_id === tipo.id),
    }))
    .filter(g => g.items.length > 0);

  const tipoIds = new Set(tiposConsumidor.map(t => t.id));
  const sinTipo = consumidoresActivos.filter(c => !tipoIds.has(c.tipo_consumidor_id));
  if (sinTipo.length > 0) {
    grupos.push({ tipo: { id: '__none', nombre: 'Sin clasificar' }, items: sinTipo });
  }

  if (grupos.length === 0) {
    return <p className="text-sm text-slate-400">No hay consumidores activos registrados</p>;
  }

  return (
    <div className="space-y-5">
      {grupos.map(({ tipo, items }) => {
        const mesActual = hoy.toISOString().slice(0, 7);
        const comprasMes = movimientos.filter(m =>
          m.tipo === 'COMPRA' && m.fecha?.startsWith(mesActual) &&
          items.some(c => c.id === m.consumidor_id)
        );
        const litrosMes = comprasMes.reduce((s, m) => s + (m.litros || 0), 0);
        const gastoMes = comprasMes.reduce((s, m) => s + (m.monto || 0), 0);

        return (
          <div key={tipo.id}>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm">{getIconForTipo(tipo.nombre)}</span>
                <span className="text-sm font-semibold text-slate-600 uppercase tracking-wide">{tipo.nombre}</span>
                <Badge variant="outline" className="text-[10px] py-0 px-1.5">{items.length}</Badge>
              </div>
              {litrosMes > 0 && (
                <div className="ml-auto flex items-center gap-3 text-xs text-slate-400">
                  <span><b className="text-slate-600">{litrosMes.toFixed(1)} L</b> este mes</span>
                  {gastoMes > 0 && <span><b className="text-slate-600">{formatMonto(gastoMes)}</b></span>}
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {items.map(c => (
                <ConsumidorCard key={c.id} consumidor={c} movimientos={movimientos} hoy={hoy} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
