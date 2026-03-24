import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CreditCard, AlertTriangle, ArrowLeftRight, Truck, Clock, TrendingDown } from 'lucide-react';
import { calcularSaldo, formatMonto } from '@/components/ui-helpers/SaldoUtils';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

function SectionTitle({ icon: Icon, title, color = 'text-slate-600', iconColor = 'text-slate-400' }) {
  return (
    <div className={`flex items-center gap-2 mb-3 ${color}`}>
      <Icon className={`w-4 h-4 ${iconColor}`} />
      <span className="text-sm font-semibold uppercase tracking-wide">{title}</span>
    </div>
  );
}

export default function Dashboard() {
  const [detailVehiculo, setDetailVehiculo] = useState(null);
  const { data: tarjetas = [] } = useQuery({ queryKey: ['tarjetas'], queryFn: () => base44.entities.Tarjeta.list() });
  const { data: vehiculos = [] } = useQuery({ queryKey: ['vehiculos'], queryFn: () => base44.entities.Vehiculo.list() });
  const { data: movimientos = [] } = useQuery({ queryKey: ['movimientos'], queryFn: () => base44.entities.Movimiento.list('-fecha') });

  const tarjetasActivas = tarjetas.filter(t => t.activa);
  const saldos = tarjetasActivas.map(t => ({ ...t, saldo: calcularSaldo(t, movimientos) }));
  const tarjetasAlerta = saldos.filter(t => t.umbral_alerta != null && t.saldo < t.umbral_alerta);

  // Stock en reserva por combustible
  const stockReserva = (() => {
    const map = {};
    movimientos.filter(m => m.tipo === 'COMPRA' && m.litros).forEach(m => {
      const k = m.combustible_nombre || m.combustible_id || '?';
      map[k] = (map[k] || 0) + (m.litros || 0);
    });
    movimientos.filter(m => m.tipo === 'DESPACHO' && m.litros).forEach(m => {
      const k = m.combustible_nombre || m.combustible_id || '?';
      map[k] = (map[k] || 0) - (m.litros || 0);
    });
    return map;
  })();

  // Último abastecimiento por vehículo (COMPRA o DESPACHO hacia el vehículo)
  const hoy = new Date();
  const vehiculosConActividad = vehiculos.filter(v => v.activa).map(v => {
    const movsVehiculo = movimientos.filter(m =>
      (m.tipo === 'COMPRA' || m.tipo === 'DESPACHO') && m.vehiculo_chapa === v.chapa
    ).sort((a, b) => b.fecha?.localeCompare(a.fecha));
    const ultimo = movsVehiculo[0];
    const diasSinAbast = ultimo
      ? Math.floor((hoy - new Date(ultimo.fecha)) / (1000 * 60 * 60 * 24))
      : null;
    return { ...v, ultimoMov: ultimo, diasSinAbast };
  }).sort((a, b) => {
    if (a.diasSinAbast === null) return 1;
    if (b.diasSinAbast === null) return -1;
    return b.diasSinAbast - a.diasSinAbast;
  });

  const detalleVehiculo = useMemo(() => {
    if (!detailVehiculo) return null;
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const sinceIso = since.toISOString().slice(0, 10);
    const movs = movimientos
      .filter((m) => (m.vehiculo_chapa === detailVehiculo.chapa || m.vehiculo_origen_chapa === detailVehiculo.chapa) && (m.fecha || '') >= sinceIso)
      .sort((a, b) => `${b.fecha || ''}`.localeCompare(`${a.fecha || ''}`));
    const compras = movs.filter((m) => m.tipo === 'COMPRA' && m.vehiculo_chapa === detailVehiculo.chapa);
    const litros = compras.reduce((s, m) => s + Number(m.litros || 0), 0);
    const monto = compras.reduce((s, m) => s + Number(m.monto || 0), 0);
    const comprasConOdo = compras.filter((m) => Number.isFinite(Number(m.odometro))).sort((a, b) => `${a.fecha || ''}`.localeCompare(`${b.fecha || ''}`));
    const km = comprasConOdo.length >= 2 ? Number(comprasConOdo[comprasConOdo.length - 1].odometro) - Number(comprasConOdo[0].odometro) : 0;
    return {
      movs,
      kmPorLitro: litros > 0 && km > 0 ? km / litros : null,
      costoPorKm: km > 0 ? monto / km : null,
      compras: compras.length,
      despachos: movs.filter((m) => m.tipo === 'DESPACHO').length,
    };
  }, [detailVehiculo, movimientos]);

  // Resumen del mes actual
  const mesActual = hoy.toISOString().slice(0, 7);
  const movsDelMes = movimientos.filter(m => m.fecha?.startsWith(mesActual));
  const comprasMes = movsDelMes.filter(m => m.tipo === 'COMPRA');
  const litrosMes = comprasMes.reduce((s, m) => s + (m.litros || 0), 0);
  const gastoMes = comprasMes.reduce((s, m) => s + (m.monto || 0), 0);
  const despachosMes = movsDelMes.filter(m => m.tipo === 'DESPACHO');
  const litrosDespachadosMes = despachosMes.reduce((s, m) => s + (m.litros || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-xs text-slate-400 mt-0.5">
          {hoy.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Resumen del mes */}
      <div>
        <SectionTitle icon={TrendingDown} title={`Resumen ${hoy.toLocaleDateString('es-ES', { month: 'long' })}`} iconColor="text-sky-500" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <p className="text-[11px] text-slate-400 uppercase tracking-wide">Gasto en combustible</p>
              <p className="text-lg font-bold text-slate-800 mt-1">{formatMonto(gastoMes)}</p>
              <p className="text-xs text-slate-400">{comprasMes.length} compras</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <p className="text-[11px] text-slate-400 uppercase tracking-wide">Litros comprados</p>
              <p className="text-lg font-bold text-orange-600 mt-1">{litrosMes.toFixed(1)} L</p>
              <p className="text-xs text-slate-400">{litrosDespachadosMes.toFixed(1)} L despachados</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm col-span-2 sm:col-span-1">
            <CardContent className="p-4">
              <p className="text-[11px] text-slate-400 uppercase tracking-wide">Alertas activas</p>
              <p className={`text-lg font-bold mt-1 ${tarjetasAlerta.length > 0 ? 'text-amber-500' : 'text-slate-400'}`}>
                {tarjetasAlerta.length}
              </p>
              <p className="text-xs text-slate-400">tarjetas con saldo bajo</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Saldo por tarjeta */}
      <div>
        <SectionTitle icon={CreditCard} title="Saldo por tarjeta" iconColor="text-blue-500" />
        {saldos.length === 0 ? (
          <p className="text-sm text-slate-400">No hay tarjetas activas</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {saldos.map(t => {
              const enAlerta = t.umbral_alerta != null && t.saldo < t.umbral_alerta;
              const pct = t.umbral_alerta ? Math.min(100, Math.max(0, (t.saldo / (t.umbral_alerta * 3)) * 100)) : null;
              return (
                <Card key={t.id} className={`border-0 shadow-sm ${enAlerta ? 'ring-1 ring-amber-300 bg-amber-50/30' : ''}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-700 truncate">{t.alias || t.id_tarjeta}</p>
                        <p className="text-[11px] text-slate-400 truncate">{t.id_tarjeta}</p>
                      </div>
                      <Badge variant="outline" className={`text-[10px] shrink-0 ml-2 ${enAlerta ? 'border-amber-300 text-amber-600' : ''}`}>
                        {t.moneda}
                      </Badge>
                    </div>
                    <p className={`text-2xl font-bold ${t.saldo < 0 ? 'text-red-600' : enAlerta ? 'text-amber-600' : 'text-slate-800'}`}>
                      {formatMonto(t.saldo)}
                    </p>
                    {t.umbral_alerta != null && (
                      <div className="mt-2">
                        <div className="h-1 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${enAlerta ? 'bg-amber-400' : 'bg-sky-400'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">Umbral: {formatMonto(t.umbral_alerta)}</p>
                      </div>
                    )}
                    {enAlerta && (
                      <div className="flex items-center gap-1 mt-2">
                        <AlertTriangle className="w-3 h-3 text-amber-500" />
                        <span className="text-[11px] text-amber-600 font-medium">Saldo por debajo del umbral</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Stock en reserva */}
      {Object.keys(stockReserva).length > 0 && (
        <div>
          <SectionTitle icon={ArrowLeftRight} title="Stock en reserva" iconColor="text-purple-500" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Object.entries(stockReserva).map(([nombre, litros]) => (
              <Card key={nombre} className={`border-0 shadow-sm ${litros < 0 ? 'ring-1 ring-red-200 bg-red-50/30' : ''}`}>
                <CardContent className="p-4">
                  <p className="text-xs text-slate-500 font-medium truncate">{nombre}</p>
                  <p className={`text-2xl font-bold mt-1 ${litros < 0 ? 'text-red-600' : 'text-purple-700'}`}>
                    {litros.toFixed(1)} <span className="text-sm font-normal">L</span>
                  </p>
                  {litros < 0 && (
                    <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Stock negativo
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Vehículos sin reabastecimiento */}
      <div>
        <SectionTitle icon={Truck} title="Estado de vehículos" iconColor="text-slate-500" />
        {vehiculosConActividad.length === 0 ? (
          <p className="text-sm text-slate-400">No hay vehículos registrados</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {vehiculosConActividad.map(v => {
              const dias = v.diasSinAbast;
              const color = dias === null ? 'text-slate-400' : dias > 14 ? 'text-red-500' : dias > 7 ? 'text-amber-500' : 'text-emerald-600';
              const bgColor = dias === null ? '' : dias > 14 ? 'ring-1 ring-red-100' : dias > 7 ? 'ring-1 ring-amber-100' : '';
              return (
                <Card key={v.id} className={`border-0 shadow-sm ${bgColor} cursor-pointer`} onClick={() => setDetailVehiculo(v)}>
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      dias === null ? 'bg-slate-100' : dias > 14 ? 'bg-red-50' : dias > 7 ? 'bg-amber-50' : 'bg-emerald-50'
                    }`}>
                      <Truck className={`w-4 h-4 ${color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">{v.alias || v.chapa}</p>
                      {v.alias && <p className="text-[11px] text-slate-400 truncate">{v.chapa}</p>}
                      {v.area_centro && <p className="text-[11px] text-slate-400 truncate">{v.area_centro}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      {dias === null ? (
                        <span className="text-xs text-slate-400">Sin registros</span>
                      ) : (
                        <>
                          <p className={`text-sm font-bold ${color}`}>{dias}d</p>
                          <p className="text-[10px] text-slate-400">sin abastecer</p>
                        </>
                      )}
                    </div>
                    {dias !== null && dias > 7 && (
                      <Clock className={`w-3.5 h-3.5 shrink-0 ${color}`} />
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
        <Link to={createPageUrl('Movimientos')} className="text-xs text-sky-600 hover:underline mt-3 inline-block">
          Ver todos los movimientos →
        </Link>
      </div>

      <Dialog open={!!detailVehiculo} onOpenChange={() => setDetailVehiculo(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Detalle de vehículo {detailVehiculo?.chapa}</DialogTitle>
          </DialogHeader>
          {detailVehiculo && detalleVehiculo && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <Card><CardContent className="p-3"><p className="text-slate-400">Compras (30d)</p><p className="font-semibold">{detalleVehiculo.compras}</p></CardContent></Card>
                <Card><CardContent className="p-3"><p className="text-slate-400">Despachos (30d)</p><p className="font-semibold">{detalleVehiculo.despachos}</p></CardContent></Card>
                <Card><CardContent className="p-3"><p className="text-slate-400">Km/L estimado</p><p className="font-semibold">{detalleVehiculo.kmPorLitro != null ? detalleVehiculo.kmPorLitro.toFixed(2) : '—'}</p></CardContent></Card>
                <Card><CardContent className="p-3"><p className="text-slate-400">Costo/Km</p><p className="font-semibold">{detalleVehiculo.costoPorKm != null ? `$${detalleVehiculo.costoPorKm.toFixed(2)}` : '—'}</p></CardContent></Card>
              </div>
              <div className="overflow-auto border rounded-xl max-h-72">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="text-left px-3 py-2">Fecha</th>
                      <th className="text-left px-3 py-2">Tipo</th>
                      <th className="text-left px-3 py-2">Combustible</th>
                      <th className="text-right px-3 py-2">Litros</th>
                      <th className="text-right px-3 py-2">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalleVehiculo.movs.map((m) => (
                      <tr key={m.id} className="border-b last:border-b-0">
                        <td className="px-3 py-2">{m.fecha}</td>
                        <td className="px-3 py-2">{m.tipo}</td>
                        <td className="px-3 py-2">{m.combustible_nombre || '—'}</td>
                        <td className="px-3 py-2 text-right">{m.litros ?? '—'}</td>
                        <td className="px-3 py-2 text-right">{m.monto ?? '—'}</td>
                      </tr>
                    ))}
                    {detalleVehiculo.movs.length === 0 && (
                      <tr><td colSpan={5} className="text-center py-6 text-slate-400">Sin movimientos en los últimos 30 días</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
