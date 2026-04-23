import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, CreditCard, ArrowLeftRight, TrendingDown, TrendingUp, Users, CalendarDays } from 'lucide-react';
import { Badge } from "@/components/ui/badge";
import { calcularSaldo, formatMonto } from '@/components/ui-helpers/SaldoUtils';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import GastosMensualesChart from '@/components/dashboard/GastosMensualesChart';
import ConsumidoresPorTipo from '@/components/dashboard/ConsumidoresPorTipo';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { filterMovimientosByMonth, getMonthOptionsFromMovimientos } from '@/lib/fuel-analytics';

function SectionTitle({ icon: Icon, title, iconColor = 'text-slate-400' }) {
  return (
    <div className="flex items-center gap-2 mb-3 text-slate-600">
      <Icon className={`w-4 h-4 ${iconColor}`} />
      <span className="text-sm font-semibold uppercase tracking-wide">{title}</span>
    </div>
  );
}

export default function Dashboard() {
  const [mesFiltro, setMesFiltro] = useState('ALL');
  const { data: tarjetas = [] } = useQuery({ queryKey: ['tarjetas'], queryFn: () => base44.entities.Tarjeta.list() });
  const { data: movimientos = [] } = useQuery({ queryKey: ['movimientos'], queryFn: () => base44.entities.Movimiento.list('-fecha', 1000) });
  const { data: consumidores = [] } = useQuery({ queryKey: ['consumidores'], queryFn: () => base44.entities.Consumidor.list() });
  const { data: tiposConsumidor = [] } = useQuery({ queryKey: ['tiposConsumidor'], queryFn: () => base44.entities.TipoConsumidor.list() });
  const { data: tipoCombustible = [] } = useQuery({ queryKey: ['tipoCombustible'], queryFn: () => base44.entities.TipoCombustible.list() });

  const hoy = new Date();
  const movimientosFiltrados = filterMovimientosByMonth(movimientos, mesFiltro);

  const opcionesMes = useMemo(() => {
    return getMonthOptionsFromMovimientos(movimientos);
  }, [movimientos]);

  const tarjetasById = useMemo(
    () => Object.fromEntries(tarjetas.map(t => [t.id, t])),
    [tarjetas],
  );

  const formatMoneySymbol = (monto, moneda = 'USD') => {
    return formatMonto(monto, moneda);
  };

  const consumidoresReservaIds = useMemo(() => {
    return new Set(
      consumidores
        .filter((c) => {
          const tipo = (c.tipo_consumidor_nombre || '').toLowerCase();
          return tipo.includes('tanque') || tipo.includes('reserva');
        })
        .map(c => c.id)
    );
  }, [consumidores]);

  const resumenPorCombustible = useMemo(() => {
    const keys = new Set([
      ...tipoCombustible.map(c => c.nombre).filter(Boolean),
      ...movimientos.map(m => m.combustible_nombre).filter(Boolean),
    ]);

    return [...keys].map((nombreCombustible) => {
      const comprasHistoricas = movimientos.filter(m => m.tipo === 'COMPRA' && m.combustible_nombre === nombreCombustible);
      const despachosHistoricos = movimientos.filter(m => m.tipo === 'DESPACHO' && m.combustible_nombre === nombreCombustible);
      const comprasPeriodo = movimientosFiltrados.filter(m => m.tipo === 'COMPRA' && m.combustible_nombre === nombreCombustible);
      const despachosPeriodo = movimientosFiltrados.filter(m => m.tipo === 'DESPACHO' && m.combustible_nombre === nombreCombustible);
      const comprasReservaHistoricas = comprasHistoricas.filter(m => consumidoresReservaIds.has(m.consumidor_id));
      const comprasReservaPeriodo = comprasPeriodo.filter(m => consumidoresReservaIds.has(m.consumidor_id));
      const despachosReservaHistoricos = despachosHistoricos.filter(m => consumidoresReservaIds.has(m.consumidor_origen_id));
      const despachosReservaPeriodo = despachosPeriodo.filter(m => consumidoresReservaIds.has(m.consumidor_origen_id));

      const litrosInicio = comprasHistoricas
        .filter(m => mesFiltro !== 'ALL' && m.fecha < `${mesFiltro}-01`)
        .reduce((s, m) => s + (m.litros || 0), 0)
        - despachosHistoricos
          .filter(m => mesFiltro !== 'ALL' && m.fecha < `${mesFiltro}-01`)
          .reduce((s, m) => s + (m.litros || 0), 0);

      const montoInicio = comprasHistoricas
        .filter(m => mesFiltro !== 'ALL' && m.fecha < `${mesFiltro}-01`)
        .reduce((s, m) => s + (m.monto || 0), 0)
        - despachosHistoricos
          .filter(m => mesFiltro !== 'ALL' && m.fecha < `${mesFiltro}-01`)
          .reduce((s, m) => s + (m.monto || 0), 0);

      const litrosCompras = comprasPeriodo.reduce((s, m) => s + (m.litros || 0), 0);
      const montoCompras = comprasPeriodo.reduce((s, m) => s + (m.monto || 0), 0);
      const litrosConsumo = despachosPeriodo.reduce((s, m) => s + (m.litros || 0), 0);
      const montoConsumo = despachosPeriodo.reduce((s, m) => s + (m.monto || 0), 0);
      const recargasOpsMes = comprasReservaPeriodo.length;
      const recargasOpsTotal = comprasReservaHistoricas.length;
      const litrosComprasReservaMes = comprasReservaPeriodo.reduce((s, m) => s + (m.litros || 0), 0);
      const costoRecargasMes = comprasReservaPeriodo.reduce((s, m) => s + (m.monto || 0), 0);
      const costoRecargasTotal = comprasReservaHistoricas.reduce((s, m) => s + (m.monto || 0), 0);
      const despachosOpsMes = despachosReservaPeriodo.length;
      const despachosOpsTotal = despachosReservaHistoricos.length;
      const litrosDespachosMes = despachosReservaPeriodo.reduce((s, m) => s + (m.litros || 0), 0);
      const litrosDespachosTotal = despachosReservaHistoricos.reduce((s, m) => s + (m.litros || 0), 0);
      const montoDespachosMes = despachosReservaPeriodo.reduce((s, m) => s + (m.monto || 0), 0);

      const reservaIdsDelCombustible = new Set([
        ...comprasReservaHistoricas.map(m => m.consumidor_id).filter(Boolean),
        ...despachosReservaHistoricos.map(m => m.consumidor_origen_id).filter(Boolean),
      ]);
      const capacidadTotalReserva = [...reservaIdsDelCombustible]
        .map((id) => consumidores.find(c => c.id === id)?.datos_vehiculo?.capacidad_tanque || 0)
        .reduce((s, v) => s + (Number(v) || 0), 0);
      const litrosEnTanqueEstimado = Math.max(
        0,
        comprasReservaHistoricas.reduce((s, m) => s + (m.litros || 0), 0)
          - despachosReservaHistoricos.reduce((s, m) => s + (m.litros || 0), 0)
      );
      const litrosInicioReserva = comprasReservaHistoricas
        .filter(m => mesFiltro !== 'ALL' && m.fecha < `${mesFiltro}-01`)
        .reduce((s, m) => s + (m.litros || 0), 0)
        - despachosReservaHistoricos
          .filter(m => mesFiltro !== 'ALL' && m.fecha < `${mesFiltro}-01`)
          .reduce((s, m) => s + (m.litros || 0), 0);
      const montoInicioReserva = comprasReservaHistoricas
        .filter(m => mesFiltro !== 'ALL' && m.fecha < `${mesFiltro}-01`)
        .reduce((s, m) => s + (m.monto || 0), 0)
        - despachosReservaHistoricos
          .filter(m => mesFiltro !== 'ALL' && m.fecha < `${mesFiltro}-01`)
          .reduce((s, m) => s + (m.monto || 0), 0);
      const litrosTotalDisponibleReserva = Math.max(0, litrosInicioReserva + litrosComprasReservaMes);
      const montoTotalDisponibleReserva = Math.max(0, montoInicioReserva + costoRecargasMes);

      const detalleConsumoReservaMap = {};
      despachosReservaPeriodo.forEach(m => {
        const key = m.consumidor_nombre || 'Sin identificar';
        if (!detalleConsumoReservaMap[key]) detalleConsumoReservaMap[key] = { litros: 0, monto: 0 };
        detalleConsumoReservaMap[key].litros += m.litros || 0;
        detalleConsumoReservaMap[key].monto += m.monto || 0;
      });
      const detalleConsumoReserva = Object.entries(detalleConsumoReservaMap)
        .map(([nombre, data]) => ({ nombre, ...data }))
        .sort((a, b) => b.litros - a.litros);

      const detalleConsumoMap = {};
      despachosPeriodo.forEach(m => {
        const key = m.consumidor_nombre || 'Sin identificar';
        if (!detalleConsumoMap[key]) detalleConsumoMap[key] = { litros: 0, monto: 0 };
        detalleConsumoMap[key].litros += m.litros || 0;
        detalleConsumoMap[key].monto += m.monto || 0;
      });
      const detalleConsumo = Object.entries(detalleConsumoMap)
        .map(([nombre, data]) => ({ nombre, ...data }))
        .sort((a, b) => b.litros - a.litros);

      const ultimaCompra = comprasPeriodo[0] || comprasHistoricas[0] || null;
      const moneda = (ultimaCompra && tarjetasById[ultimaCompra.tarjeta_id]?.moneda) || 'USD';
      const precioRef = ultimaCompra?.precio || (litrosCompras > 0 ? montoCompras / litrosCompras : 0);

      return {
        nombreCombustible,
        moneda,
        precioRef,
        litrosInicio: Math.max(0, litrosInicio),
        montoInicio: Math.max(0, montoInicio),
        litrosCompras,
        montoCompras,
        litrosDisponible: Math.max(0, litrosInicio + litrosCompras),
        montoDisponible: Math.max(0, montoInicio + montoCompras),
        litrosConsumo,
        montoConsumo,
        litrosSaldoFinal: Math.max(0, litrosInicio + litrosCompras - litrosConsumo),
        montoSaldoFinal: Math.max(0, montoInicio + montoCompras - montoConsumo),
        capacidadTotalReserva,
        litrosEnTanqueEstimado,
        recargasOpsMes,
        recargasOpsTotal,
        litrosComprasReservaMes,
        costoRecargasMes,
        costoRecargasTotal,
        despachosOpsMes,
        despachosOpsTotal,
        litrosDespachosMes,
        litrosDespachosTotal,
        montoDespachosMes,
        litrosInicioReserva: Math.max(0, litrosInicioReserva),
        montoInicioReserva: Math.max(0, montoInicioReserva),
        litrosTotalDisponibleReserva,
        montoTotalDisponibleReserva,
        detalleConsumoReserva,
        detalleConsumo,
      };
    }).filter(r => r.litrosCompras > 0 || r.litrosConsumo > 0 || r.litrosInicio > 0);
  }, [movimientos, movimientosFiltrados, mesFiltro, tipoCombustible, tarjetasById, consumidoresReservaIds, consumidores]);

  // Resumen del mes
  const comprasMes = movimientosFiltrados.filter(m => m.tipo === 'COMPRA');
  const litrosMes = comprasMes.reduce((s, m) => s + (m.litros || 0), 0);
  const gastoMes = comprasMes.reduce((s, m) => s + (m.monto || 0), 0);
  const despachosMes = movimientosFiltrados.filter(m => m.tipo === 'DESPACHO');
  const litrosDespachadosMes = despachosMes.reduce((s, m) => s + (m.litros || 0), 0);

  // Consumidores activos
  const consumidoresActivos = consumidores.filter(c => c.activo);

  // Alertas de consumo crítico
  const alertasConsumo = consumidoresActivos.filter(c => {
    const consumoRef = c.datos_vehiculo?.indice_consumo_real || c.datos_vehiculo?.indice_consumo_fabricante;
    const movsConConsumo = movimientos
      .filter(m => m.tipo === 'COMPRA' && m.consumidor_id === c.id && m.consumo_real != null && (mesFiltro === 'ALL' || m.fecha?.startsWith(mesFiltro)))
      .sort((a, b) => b.odometro - a.odometro);
    if (!consumoRef || movsConConsumo.length === 0) return false;
    const consumoUltimo = movsConConsumo[0].consumo_real;
    const umbralCritico = c.datos_vehiculo?.umbral_critico_pct ?? 30;
    const desviacion = ((consumoRef - consumoUltimo) / consumoRef) * 100;
    return desviacion >= umbralCritico;
  });

  // Tarjetas
  const tarjetasActivas = tarjetas.filter(t => t.activa);
  const saldos = tarjetasActivas.map(t => ({ ...t, saldo: calcularSaldo(t, movimientos) }));

  // Stock en reserva (consumidores tanque/reserva - basado en compras y despachos)
  const stockReserva = (() => {
    const map = {};
    movimientos.filter(m => m.tipo === 'COMPRA' && m.litros && m.consumidor_id).forEach(m => {
      const con = consumidores.find(c => c.id === m.consumidor_id);
      const esTanque = con?.tipo_consumidor_nombre?.toLowerCase().includes('tanque')
        || con?.tipo_consumidor_nombre?.toLowerCase().includes('reserva');
      if (!esTanque) return;
      const k = m.combustible_nombre || '?';
      map[k] = (map[k] || 0) + (m.litros || 0);
    });
    movimientos.filter(m => m.tipo === 'DESPACHO' && m.litros).forEach(m => {
      const k = m.combustible_nombre || '?';
      if (map[k] != null) map[k] -= (m.litros || 0);
    });
    return map;
  })();

  const hayStockReserva = Object.keys(stockReserva).length > 0;
  const categoriasReserva = useMemo(() => {
    const rows = { Particular: 0, Cupet: 0, 'Almacén': 0 };
    movimientosFiltrados
      .filter(m => m.tipo === 'DESPACHO')
      .forEach((m) => {
        const raw = `${m.consumidor_origen_nombre || ''} ${m.referencia || ''}`.toLowerCase();
        if (raw.includes('cupet')) rows.Cupet += m.litros || 0;
        else if (raw.includes('almac')) rows['Almacén'] += m.litros || 0;
        else rows.Particular += m.litros || 0;
      });
    return rows;
  }, [movimientosFiltrados]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Panel Global</h1>
        <p className="text-xs text-slate-400 mt-0.5">
          {hoy.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Resumen del mes */}
      <div>
        <div className="flex flex-wrap items-end justify-between gap-2 mb-1">
          <SectionTitle icon={TrendingDown} title={`Resumen ${mesFiltro === 'ALL' ? 'general' : opcionesMes.find(x => x.key === mesFiltro)?.label || ''}`} iconColor="text-sky-500" />
          <div className="min-w-[220px] flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wide text-slate-400">Período</span>
            <Select value={mesFiltro} onValueChange={setMesFiltro}>
              <SelectTrigger className="h-8 text-xs">
                <CalendarDays className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
                <SelectValue placeholder="Filtrar por mes" />
              </SelectTrigger>
              <SelectContent>
                {opcionesMes.map(opt => (
                  <SelectItem key={opt.key} value={opt.key} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <p className="text-[11px] text-slate-400 uppercase tracking-wide">Gasto combustible</p>
              <p className="text-lg font-bold text-slate-800 mt-1 leading-tight">{formatMonto(gastoMes)}</p>
              <p className="text-xs text-slate-400 mt-1">{comprasMes.length} compras</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <p className="text-[11px] text-slate-400 uppercase tracking-wide">Litros comprados</p>
              <p className="text-lg font-bold text-orange-600 mt-1 leading-tight inline-flex items-baseline gap-1.5">
                <span>{litrosMes.toFixed(1)}</span>
                <span className="text-base font-semibold">L</span>
              </p>
              <p className="text-xs text-slate-400 mt-1 inline-flex items-baseline gap-1">
                <span>•</span>
                <span>{litrosDespachadosMes.toFixed(1)}</span>
                <span>L despachados</span>
              </p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <p className="text-[11px] text-slate-400 uppercase tracking-wide">Consumidores activos</p>
              <p className="text-lg font-bold text-emerald-600 mt-1 leading-tight">{consumidoresActivos.length}</p>
              <p className="text-xs text-slate-400 mt-1">{tiposConsumidor.filter(t => t.activo !== false).length} tipos</p>
            </CardContent>
          </Card>
          <Card className={`border-0 shadow-sm ${alertasConsumo.length > 0 ? 'ring-1 ring-red-200 bg-red-50/20' : ''}`}>
            <CardContent className="p-4">
              <p className="text-[11px] text-slate-400 uppercase tracking-wide">Consumo crítico</p>
              <p className={`text-lg font-bold mt-1 leading-tight ${alertasConsumo.length > 0 ? 'text-red-500' : 'text-slate-400'}`}>
                {alertasConsumo.length}
              </p>
              <p className="text-xs text-slate-400 mt-1">unidades con alerta</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Resumen por combustible */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionTitle icon={TrendingUp} title="Resumen por combustible" iconColor="text-blue-500" />
          <Link to={createPageUrl('Movimientos')} className="text-xs text-sky-600 hover:underline">
            Ver/cargar movimientos relacionados →
          </Link>
        </div>

        {resumenPorCombustible.length === 0 ? (
          <p className="text-sm text-slate-400">No hay datos de consumo para el período seleccionado.</p>
        ) : (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-700">Consumo total de combustible {mesFiltro === 'ALL' ? 'hasta la fecha' : `(${opcionesMes.find(x => x.key === mesFiltro)?.label || mesFiltro})`}</h3>
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
              {resumenPorCombustible.map(res => (
                <Card key={`${res.nombreCombustible}-total`} className="border border-slate-200 shadow-sm">
                  <CardContent className="p-3">
                    <h3 className="text-sm font-bold text-center mb-2">{res.nombreCombustible}</h3>
                    <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 text-xs">
                      <span>Precio</span><span className="text-right">—</span><span className="text-right font-medium">{formatMoneySymbol(res.precioRef, res.moneda)}</span>
                      <span className="text-slate-400 col-span-3 mt-1">Litros / Valor</span>
                      <span>Inicio</span><span className="text-right">{res.litrosInicio.toFixed(1)}</span><span className="text-right">{formatMoneySymbol(res.montoInicio, res.moneda)}</span>
                      <span>Compras</span><span className="text-right">{res.litrosCompras.toFixed(1)}</span><span className="text-right">{formatMoneySymbol(res.montoCompras, res.moneda)}</span>
                      <span className="font-semibold">Total disponible</span><span className="text-right font-semibold">{res.litrosDisponible.toFixed(1)}</span><span className="text-right font-semibold">{formatMoneySymbol(res.montoDisponible, res.moneda)}</span>
                      <span className="text-slate-400 col-span-3 mt-1">Consumo</span>
                      {res.detalleConsumo.map(item => (
                        <React.Fragment key={`${res.nombreCombustible}-${item.nombre}`}>
                          <span className="truncate">{item.nombre}</span><span className="text-right">{item.litros.toFixed(1)}</span><span className="text-right">{formatMoneySymbol(item.monto, res.moneda)}</span>
                        </React.Fragment>
                      ))}
                      <span className="font-semibold">Total consumo</span><span className="text-right font-semibold">{res.litrosConsumo.toFixed(1)}</span><span className="text-right font-semibold">{formatMoneySymbol(res.montoConsumo, res.moneda)}</span>
                      <span className="font-bold">Saldo final</span><span className="text-right font-bold">{res.litrosSaldoFinal.toFixed(1)}</span><span className="text-right font-bold">{formatMoneySymbol(res.montoSaldoFinal, res.moneda)}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <h3 className="text-sm font-semibold text-slate-700">Uso de la reserva almacenada {mesFiltro === 'ALL' ? 'hasta la fecha' : `(${opcionesMes.find(x => x.key === mesFiltro)?.label || mesFiltro})`}</h3>
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
              {resumenPorCombustible.map(res => (
                <Card key={`${res.nombreCombustible}-reserva`} className="border border-slate-200 shadow-sm">
                  <CardContent className="p-3">
                    <h3 className="text-sm font-bold text-center mb-2">{res.nombreCombustible}</h3>
                    <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 text-xs">
                      <span>Capacidad tanque</span><span className="text-right col-span-2">{res.capacidadTotalReserva > 0 ? `${res.capacidadTotalReserva.toFixed(1)} L` : 'No registrada'}</span>
                      <span>Le queda al tanque</span><span className="text-right col-span-2">{res.litrosEnTanqueEstimado.toFixed(1)} L</span>
                      <span>Recargas (ops)</span><span className="text-right">{res.recargasOpsMes}</span><span className="text-right">{res.recargasOpsTotal} total</span>
                      <span>Costo recarga</span><span className="text-right">{formatMoneySymbol(res.costoRecargasMes, res.moneda)}</span><span className="text-right">{formatMoneySymbol(res.costoRecargasTotal, res.moneda)}</span>
                      <span className="text-slate-400 col-span-3 mt-1">Litros / Valor</span>
                      <span>Inicio</span><span className="text-right">{res.litrosInicioReserva.toFixed(1)}</span><span className="text-right">{formatMoneySymbol(res.montoInicioReserva, res.moneda)}</span>
                      <span>Compras reserva</span><span className="text-right">{res.litrosComprasReservaMes.toFixed(1)}</span><span className="text-right">{formatMoneySymbol(res.costoRecargasMes, res.moneda)}</span>
                      <span className="font-semibold">Total disponible</span><span className="text-right font-semibold">{res.litrosTotalDisponibleReserva.toFixed(1)}</span><span className="text-right font-semibold">{formatMoneySymbol(res.montoTotalDisponibleReserva, res.moneda)}</span>
                      <span className="text-slate-400 col-span-3 mt-1">Despachos relacionados</span>
                      {res.detalleConsumoReserva.map(item => (
                        <React.Fragment key={`${res.nombreCombustible}-r-${item.nombre}`}>
                          <span className="truncate">{item.nombre}</span><span className="text-right">{item.litros.toFixed(1)}</span><span className="text-right">{formatMoneySymbol(item.monto, res.moneda)}</span>
                        </React.Fragment>
                      ))}
                      <span className="font-semibold">Total consumo</span><span className="text-right font-semibold">{res.litrosDespachosMes.toFixed(1)}</span><span className="text-right font-semibold">{formatMoneySymbol(res.montoDespachosMes, res.moneda)}</span>
                      <span className="font-bold">Saldo final</span><span className="text-right font-bold">{Math.max(0, res.litrosTotalDisponibleReserva - res.litrosDespachosMes).toFixed(1)}</span><span className="text-right font-bold">{formatMoneySymbol(Math.max(0, res.montoTotalDisponibleReserva - res.montoDespachosMes), res.moneda)}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Alertas de consumo crítico */}
      {alertasConsumo.length > 0 && (
        <div className="space-y-2">
          {alertasConsumo.map(c => (
            <div key={c.id} className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span className="font-semibold text-red-700">{c.nombre}</span>
              {c.codigo_interno && <span className="text-red-500 font-mono text-xs">{c.codigo_interno}</span>}
              <span className="text-red-600 text-xs">— consumo crítico en la última carga</span>
            </div>
          ))}
        </div>
      )}

      {/* Gráfico gasto mensual */}
      <div>
        <SectionTitle icon={TrendingUp} title="Gastos por mes (últimos 6 meses)" iconColor="text-sky-500" />
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 pt-4">
            <GastosMensualesChart movimientos={movimientos} />
          </CardContent>
        </Card>
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
                      {formatMonto(t.saldo, t.moneda || 'USD')}
                    </p>
                    {t.umbral_alerta != null && (
                      <div className="mt-2">
                        <div className="h-1 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${enAlerta ? 'bg-amber-400' : 'bg-sky-400'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">Umbral: {formatMonto(t.umbral_alerta, t.moneda || 'USD')}</p>
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

      {/* Stock en reserva (tanques) */}
      {hayStockReserva && (
        <div>
          <SectionTitle icon={ArrowLeftRight} title="Stock en reserva (tanques)" iconColor="text-purple-500" />
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
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
            {Object.entries(categoriasReserva).map(([cat, litros]) => (
              <Card key={cat} className="border-0 shadow-sm">
                <CardContent className="p-3">
                  <p className="text-[11px] text-slate-400 uppercase">{cat}</p>
                  <p className="text-sm font-bold text-slate-700">{Number(litros || 0).toFixed(1)} L</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Consumidores por tipo */}
      <div>
        <SectionTitle icon={Users} title="Estado de consumidores" iconColor="text-slate-500" />
        <ConsumidoresPorTipo
          consumidores={consumidores}
          tiposConsumidor={tiposConsumidor}
          movimientos={movimientos}
        />
        <Link to={createPageUrl('Movimientos')} className="text-xs text-sky-600 hover:underline mt-3 inline-block">
          Ver todos los movimientos →
        </Link>
      </div>
    </div>
  );
}
