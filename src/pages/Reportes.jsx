import React, { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Users, BarChart2, Droplets, DollarSign, TrendingUp, Download, Loader2 } from 'lucide-react';
import { formatMonto } from '@/components/ui-helpers/SaldoUtils';
import ExportButton from '@/components/ui-helpers/ExportButton';
import { useUserRole } from '@/components/ui-helpers/useUserRole';
import VentaEstadoBadge from '@/components/ui-helpers/VentaEstadoBadge';
import { Button } from "@/components/ui/button";

import ReporteConsumo from '@/components/reportes/ReporteConsumo';
import ReporteVehiculos from '@/components/reportes/ReporteVehiculos';

export default function Reportes() {
  const { isOperador, isCajero, isEconomico, role, canVerPrecios } = useUserRole();
  const [tab, setTab] = useState('tarjetas');
  const [exportandoFinanciero, setExportandoFinanciero] = useState(false);

  useEffect(() => {
    if (isCajero)    { setTab('bonificaciones'); return; }
    if (isEconomico) { setTab('financiero');     return; }
    if (isOperador && tab === 'tarjetas') setTab('vehiculos');
  }, [isOperador, isCajero, isEconomico]);
  const { data: ventas = [] } = useQuery({
    queryKey: ['ventas-reporte'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('venta_trabajador')
        .select('*')
        .order('fecha_venta', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const { data: tarjetas = [] } = useQuery({ queryKey: ['tarjetas'], queryFn: () => base44.entities.Tarjeta.list() });
  const { data: consumidores = [] } = useQuery({ queryKey: ['consumidores'], queryFn: () => base44.entities.Consumidor.list() });
  const { data: movimientos = [] } = useQuery({ queryKey: ['movimientos'], queryFn: () => base44.entities.Movimiento.list('-fecha', 2000), staleTime: 5 * 60_000 });

  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  const consumidoresVehiculos = useMemo(() => consumidores.filter(c => {
    if (c.categoria) return c.categoria === 'consumidor';
    const n = (c.tipo_consumidor_nombre || '').toLowerCase();
    return !n.includes('tanque') && !n.includes('reserva') && !n.includes('surtidor');
  }), [consumidores]);

  const movsFiltered = useMemo(() => {
    return movimientos.filter(m => {
      if (fechaDesde && m.fecha < fechaDesde) return false;
      if (fechaHasta && m.fecha > fechaHasta) return false;
      return true;
    });
  }, [movimientos, fechaDesde, fechaHasta]);

  // Reporte tarjetas
  const reporteTarjetas = useMemo(() => {
    return tarjetas.map(t => {
      const movs = movsFiltered.filter(m =>
        m.tarjeta_id === t.id ||
        (!m.tarjeta_id && m.tarjeta_alias && (m.tarjeta_alias === t.alias || m.tarjeta_alias === t.id_tarjeta))
      );
      const compras = movs.filter(m => m.tipo === 'COMPRA');
      const totalComprado = compras.reduce((s, m) => s + (m.monto || 0), 0);
      const litrosTotal = compras.reduce((s, m) => s + (m.litros || 0), 0);
      return {
        id: t.id,
        tarjeta: t.alias || t.id_tarjeta,
        id_tarjeta: t.id_tarjeta,
        moneda: t.moneda,
        total_comprado: totalComprado,
        litros_total: litrosTotal,
        movimientos: movs.length,
        activa: t.activa,
      };
    });
  }, [tarjetas, movsFiltered]);


  // Bonificaciones filtradas por rango de fecha
  const ventasFiltradas = useMemo(() => {
    return ventas.filter(v => {
      if (fechaDesde && v.fecha_venta < fechaDesde) return false;
      if (fechaHasta && v.fecha_venta > fechaHasta) return false;
      return true;
    });
  }, [ventas, fechaDesde, fechaHasta]);

  const csvBonificaciones = [
    { label: 'Fecha',        accessor: 'fecha_venta' },
    { label: 'Trabajador',   accessor: 'beneficiario_nombre' },
    { label: 'CI',           accessor: 'beneficiario_ci' },
    { label: 'Área',         accessor: 'beneficiario_area' },
    { label: 'Combustible',  accessor: 'combustible_nombre' },
    { label: 'Litros',       accessor: 'litros' },
    { label: 'Precio/L',     accessor: 'precio_por_litro' },
    { label: 'Monto',        accessor: 'monto' },
    { label: 'Moneda',       accessor: 'moneda' },
    { label: 'Estado',       accessor: 'estado' },
    { label: 'Tanque',       accessor: 'tanque_origen_nombre' },
    { label: 'Referencia',   accessor: 'referencia' },
  ];

  const csvTarjetas = [
    { label: 'Tarjeta', accessor: 'tarjeta' },
    { label: 'Número', accessor: 'id_tarjeta' },
    { label: 'Moneda', accessor: 'moneda' },
    { label: 'Total Comprado', accessor: 'total_comprado' },
    { label: 'Total Litros', accessor: 'litros_total' },
    { label: 'Movimientos', accessor: 'movimientos' },
  ];

  // ── Reporte Financiero (economico / superadmin / auditor) ──────────────────

  const consumidoresSurtidorIds = useMemo(() => new Set(
    consumidores
      .filter(c => c.categoria === 'surtidor' || (!c.categoria && (c.tipo_consumidor_nombre || '').toLowerCase().includes('surtidor')))
      .map(c => c.id)
  ), [consumidores]);

  const reporteFinanciero = useMemo(() => {
    let litrosComprados = 0, gastoCompras = 0, litrosVD = 0, litrosServicios = 0;
    movsFiltered.forEach(m => {
      if (m.tipo === 'COMPRA') {
        litrosComprados += m.litros || 0;
        gastoCompras    += m.monto  || 0;
      } else if (m.tipo === 'DESPACHO') {
        if (m.consumidor_nombre === 'Uso Logístico')                                        litrosVD        += m.litros || 0;
        else if (!consumidoresSurtidorIds.has(m.consumidor_id))                             litrosServicios += m.litros || 0;
      }
    });
    const precioPromedio  = litrosComprados > 0 ? gastoCompras / litrosComprados : 0;
    const litrosTotalSalida = litrosVD + litrosServicios;

    const cobradas   = ventasFiltradas.filter(v => ['PAGADO_FINALIZADO', 'PAGADO'].includes(v.estado));
    const porCobrar  = ventasFiltradas.filter(v => ['ENTREGADO', 'RETIRADO'].includes(v.estado));
    const pendientes = ventasFiltradas.filter(v => v.estado === 'PENDIENTE');

    const montoCobrado   = cobradas.reduce((s, v)  => s + (v.monto  || 0), 0);
    const montoPorCobrar = porCobrar.reduce((s, v)  => s + (v.monto  || 0), 0);
    const litrosCobrados = cobradas.reduce((s, v)  => s + (v.litros || 0), 0);

    const costoVentas      = litrosCobrados * precioPromedio;
    const margenVentas     = montoCobrado - costoVentas;
    const costoServicios   = litrosServicios * precioPromedio;
    const resultadoNeto    = margenVentas - costoServicios;

    return {
      litrosComprados, gastoCompras, precioPromedio,
      litrosVD, litrosServicios, litrosTotalSalida,
      pctVD: litrosTotalSalida > 0 ? (litrosVD / litrosTotalSalida) * 100 : 0,
      pctServicios: litrosTotalSalida > 0 ? (litrosServicios / litrosTotalSalida) * 100 : 0,
      montoCobrado, montoPorCobrar,
      litrosCobrados,
      cantCobradas: cobradas.length, cantPorCobrar: porCobrar.length, cantPendientes: pendientes.length,
      costoVentas, margenVentas, costoServicios, resultadoNeto,
    };
  }, [movsFiltered, ventasFiltradas, consumidoresSurtidorIds]);

  async function handleExportFinanciero() {
    setExportandoFinanciero(true);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      const periodoLabel = fechaDesde && fechaHasta ? `${fechaDesde} al ${fechaHasta}` : fechaDesde || fechaHasta || 'Todo';

      const wsC = wb.addWorksheet('Compras');
      wsC.columns = [
        { header: 'Fecha', key: 'fecha', width: 12 },
        { header: 'Tarjeta', key: 'tarjeta', width: 22 },
        { header: 'Consumidor', key: 'consumidor', width: 26 },
        { header: 'Combustible', key: 'combustible', width: 16 },
        { header: 'Litros', key: 'litros', width: 10 },
        { header: 'Monto', key: 'monto', width: 14 },
        { header: 'Moneda', key: 'moneda', width: 8 },
      ];
      movsFiltered.filter(m => m.tipo === 'COMPRA').forEach(m => {
        const t = tarjetas.find(x => x.id === m.tarjeta_id);
        wsC.addRow({ fecha: m.fecha, tarjeta: t?.alias || t?.id_tarjeta || m.tarjeta_alias || '—', consumidor: m.consumidor_nombre || '—', combustible: m.combustible_nombre || '—', litros: m.litros || 0, monto: m.monto || 0, moneda: m.moneda || '—' });
      });

      const wsB = wb.addWorksheet('Bonificaciones VD');
      wsB.columns = [
        { header: 'Fecha', key: 'fecha', width: 12 },
        { header: 'Trabajador', key: 'trabajador', width: 28 },
        { header: 'CI', key: 'ci', width: 12 },
        { header: 'Área', key: 'area', width: 18 },
        { header: 'Combustible', key: 'combustible', width: 16 },
        { header: 'Litros', key: 'litros', width: 10 },
        { header: 'Precio/L', key: 'precio', width: 10 },
        { header: 'Monto', key: 'monto', width: 14 },
        { header: 'Moneda', key: 'moneda', width: 8 },
        { header: 'Estado', key: 'estado', width: 18 },
      ];
      ventasFiltradas.forEach(v => wsB.addRow({ fecha: v.fecha_venta, trabajador: v.beneficiario_nombre, ci: v.beneficiario_ci || '—', area: v.beneficiario_area || '—', combustible: v.combustible_nombre, litros: v.litros || 0, precio: v.precio_por_litro || 0, monto: v.monto || 0, moneda: v.moneda || '—', estado: v.estado }));

      const wsR = wb.addWorksheet('Resumen P&L');
      wsR.getColumn(1).width = 32;
      wsR.getColumn(2).width = 20;
      [
        ['Período', periodoLabel],
        ['', ''],
        ['── COMPRAS ──', ''],
        ['Litros comprados', reporteFinanciero.litrosComprados],
        ['Gasto en compras', reporteFinanciero.gastoCompras],
        ['Precio promedio / L', reporteFinanciero.precioPromedio.toFixed(4)],
        ['', ''],
        ['── CLASIFICACIÓN DE SALIDAS ──', ''],
        ['Litros hacia almacén VD', reporteFinanciero.litrosVD],
        ['Litros hacia servicios/flota', reporteFinanciero.litrosServicios],
        ['% hacia almacén VD', `${reporteFinanciero.pctVD.toFixed(1)}%`],
        ['% hacia servicios', `${reporteFinanciero.pctServicios.toFixed(1)}%`],
        ['', ''],
        ['── BONIFICACIONES VD ──', ''],
        ['Ventas cobradas', reporteFinanciero.cantCobradas],
        ['Ventas por cobrar', reporteFinanciero.cantPorCobrar],
        ['Ventas pendientes entrega', reporteFinanciero.cantPendientes],
        ['Ingresos cobrados', reporteFinanciero.montoCobrado],
        ['Ingresos por cobrar', reporteFinanciero.montoPorCobrar],
        ['', ''],
        ['── RESULTADO ESTIMADO ──', ''],
        ['+ Ingresos cobrados', reporteFinanciero.montoCobrado],
        ['- Costo de lo vendido', reporteFinanciero.costoVentas],
        ['= Margen en ventas', reporteFinanciero.margenVentas],
        ['- Gasto en servicios/flota', reporteFinanciero.costoServicios],
        ['= Resultado neto estimado', reporteFinanciero.resultadoNeto],
      ].forEach(r => wsR.addRow(r));

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      a.download = `reporte_financiero_${periodoLabel.replace(/\s/g, '_')}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    } finally {
      setExportandoFinanciero(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Reportes</h1>
        <p className="text-sm text-slate-400">Análisis de tarjetas y vehículos</p>
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-4 space-y-3">
          {/* Accesos rápidos */}
          <div className="flex flex-wrap gap-1.5">
            {[
              { label: 'Hoy',            fn: () => { const d = new Date().toISOString().slice(0,10); setFechaDesde(d); setFechaHasta(d); } },
              { label: 'Ayer',           fn: () => { const d = new Date(Date.now()-864e5).toISOString().slice(0,10); setFechaDesde(d); setFechaHasta(d); } },
              { label: 'Últimos 7 días', fn: () => { setFechaDesde(new Date(Date.now()-6*864e5).toISOString().slice(0,10)); setFechaHasta(new Date().toISOString().slice(0,10)); } },
              { label: 'Este mes',       fn: () => { const n=new Date(); setFechaDesde(`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-01`); setFechaHasta(new Date().toISOString().slice(0,10)); } },
            ].map(({ label, fn }) => (
              <button key={label} onClick={fn}
                className="text-xs px-2.5 py-1 rounded-md border border-slate-200 text-slate-600 hover:bg-sky-50 hover:border-sky-300 hover:text-sky-700 transition-colors">
                {label}
              </button>
            ))}
            {(fechaDesde || fechaHasta) && (
              <button className="text-xs px-2.5 py-1 rounded-md text-rose-500 hover:bg-rose-50 transition-colors" onClick={() => { setFechaDesde(''); setFechaHasta(''); }}>
                Limpiar
              </button>
            )}
          </div>
          {/* Rango manual */}
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs text-slate-500">Desde</label>
              <Input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} className="mt-1 h-8 text-xs w-38" />
            </div>
            <div>
              <label className="text-xs text-slate-500">Hasta</label>
              <Input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} className="mt-1 h-8 text-xs w-38" />
            </div>
            {fechaDesde && fechaHasta && fechaDesde === fechaHasta && (
              <span className="text-xs text-sky-600 pb-1">Filtrando por: {fechaDesde}</span>
            )}
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab}>
        <div className="flex gap-0.5 flex-wrap border-b border-slate-200 dark:border-slate-700 mb-4">
          {[
            !isOperador && !isCajero &&                                   { value: 'tarjetas',       label: 'Tarjetas',        icon: <CreditCard  className="w-3.5 h-3.5" /> },
            !isCajero && !isEconomico &&                                   { value: 'vehiculos',       label: 'Consumidores',    icon: <BarChart2   className="w-3.5 h-3.5" /> },
            !isCajero && !isEconomico &&                                   { value: 'consumo',         label: 'Consumo',         icon: <Users       className="w-3.5 h-3.5" /> },
                                                                           { value: 'bonificaciones',  label: 'Bonificaciones',  icon: <Droplets    className="w-3.5 h-3.5" /> },
            (isEconomico || role === 'superadmin' || role === 'auditor') && { value: 'financiero',      label: 'Financiero',      icon: <DollarSign  className="w-3.5 h-3.5" /> },
          ].filter(Boolean).map(({ value: v, label, icon }) => (
            <button
              key={v}
              onClick={() => setTab(v)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t border-b-2 transition-colors -mb-px ${
                tab === v
                  ? 'border-sky-500 text-sky-700 dark:text-sky-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              {icon}{label}
            </button>
          ))}
        </div>

        <TabsContent value="tarjetas" className="mt-0">
          <Card className="border-0 shadow-sm">
            <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold text-slate-700">Reporte por Tarjeta</CardTitle>
              <ExportButton data={reporteTarjetas} columns={csvTarjetas} filename="reporte_tarjetas" title="Reporte por Tarjeta" />
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/50">
                      <TableHead className="text-xs">Tarjeta</TableHead>
                      <TableHead className="text-xs">Moneda</TableHead>
                      {canVerPrecios && <TableHead className="text-xs text-right">Comprado</TableHead>}
                      <TableHead className="text-xs text-right">Litros</TableHead>
                      <TableHead className="text-xs text-right">#Movs</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reporteTarjetas.map(r => (
                      <TableRow key={r.id}>
                        <TableCell className="text-sm font-medium">{r.tarjeta}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{r.moneda}</Badge></TableCell>
                        {canVerPrecios && <TableCell className="text-right text-sm text-orange-600">{formatMonto(r.total_comprado)}</TableCell>}
                        <TableCell className="text-right text-sm text-slate-700">{r.litros_total > 0 ? `${r.litros_total.toFixed(1)} L` : '—'}</TableCell>
                        <TableCell className="text-right text-sm text-slate-500">{r.movimientos}</TableCell>
                      </TableRow>
                    ))}
                    {reporteTarjetas.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center text-slate-400 py-8">Sin datos</TableCell></TableRow>
                    )}
                    {reporteTarjetas.length > 0 && (() => {
                      const totalLitros = reporteTarjetas.reduce((s, r) => s + r.litros_total, 0);
                      const totalMovs   = reporteTarjetas.reduce((s, r) => s + r.movimientos, 0);
                      const monedas = [...new Set(reporteTarjetas.map(r => r.moneda).filter(Boolean))];
                      return (
                        <TableRow className="bg-slate-50 border-t-2 border-slate-200 font-semibold">
                          <TableCell className="text-sm font-bold text-slate-800">Total</TableCell>
                          <TableCell className="text-xs text-slate-400">{monedas.join(' / ')}</TableCell>
                          <TableCell className="text-right text-xs text-slate-400">ver por tarjeta</TableCell>
                          <TableCell className="text-right text-sm font-bold text-slate-800">{totalLitros.toFixed(1)} L</TableCell>
                          <TableCell className="text-right text-sm font-bold text-slate-800">{totalMovs}</TableCell>
                        </TableRow>
                      );
                    })()}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vehiculos" className="mt-0">
          <ReporteVehiculos consumidores={consumidoresVehiculos} movimientos={movsFiltered} />
        </TabsContent>
        <TabsContent value="consumo" className="mt-0">
          <ReporteConsumo consumidores={consumidoresVehiculos} movimientos={movsFiltered} />
        </TabsContent>

        <TabsContent value="bonificaciones" className="mt-0">
          <Card className="border-0 shadow-sm">
            <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold text-slate-700">Reporte de Bonificaciones</CardTitle>
                <p className="text-xs text-slate-400 mt-0.5">{ventasFiltradas.length} registros</p>
              </div>
              <ExportButton data={ventasFiltradas} columns={csvBonificaciones} filename="reporte_bonificaciones" title="Reporte de Bonificaciones de Combustible" />
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/50">
                      <TableHead className="text-xs">Fecha</TableHead>
                      <TableHead className="text-xs">Trabajador</TableHead>
                      <TableHead className="text-xs">CI</TableHead>
                      <TableHead className="text-xs">Área</TableHead>
                      <TableHead className="text-xs">Combustible</TableHead>
                      <TableHead className="text-xs text-right">Litros</TableHead>
                      {canVerPrecios && <TableHead className="text-xs text-right">P. Venta/L</TableHead>}
                      {canVerPrecios && <TableHead className="text-xs text-right">Monto</TableHead>}
                      <TableHead className="text-xs">Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ventasFiltradas.length === 0 ? (
                      <TableRow><TableCell colSpan={canVerPrecios ? 9 : 7} className="text-center text-slate-400 py-8">Sin datos en el período seleccionado</TableCell></TableRow>
                    ) : ventasFiltradas.map(v => (
                      <TableRow key={v.id}>
                        <TableCell className="text-xs text-slate-500">{v.fecha_venta}</TableCell>
                        <TableCell className="text-sm font-medium">{v.beneficiario_nombre}</TableCell>
                        <TableCell className="text-xs font-mono text-slate-400">{v.beneficiario_ci ?? '—'}</TableCell>
                        <TableCell className="text-xs text-slate-500">{v.beneficiario_area ?? '—'}</TableCell>
                        <TableCell className="text-xs">{v.combustible_nombre}</TableCell>
                        <TableCell className="text-right text-sm text-sky-700">{Number(v.litros).toFixed(1)} L</TableCell>
                        {canVerPrecios && <TableCell className="text-right text-sm text-slate-500">{v.precio_venta_unitario != null ? `${Number(v.precio_venta_unitario).toFixed(4)}` : '—'}</TableCell>}
                        {canVerPrecios && <TableCell className="text-right text-sm font-medium">{formatMonto(v.monto)} <span className="text-xs text-slate-400">{v.moneda}</span></TableCell>}
                        <TableCell>
                          <VentaEstadoBadge estado={v.estado} />
                        </TableCell>
                      </TableRow>
                    ))}
                    {ventasFiltradas.length > 0 && (() => {
                      const totalL = ventasFiltradas.reduce((s, v) => s + (Number(v.litros) || 0), 0);
                      const cobradas   = ventasFiltradas.filter(v => ['PAGADO_FINALIZADO','PAGADO'].includes(v.estado));
                      const porCobrar  = ventasFiltradas.filter(v => ['ENTREGADO','RETIRADO'].includes(v.estado));
                      const montoCobrado  = cobradas.reduce((s, v) => s + (v.monto || 0), 0);
                      const montoPendiente = porCobrar.reduce((s, v) => s + (v.monto || 0), 0);
                      return (
                        <TableRow className="bg-slate-50 border-t-2 border-slate-200">
                          <TableCell colSpan={canVerPrecios ? 5 : 4} className="text-sm font-bold text-slate-800">
                            Total — {ventasFiltradas.length} registros
                          </TableCell>
                          <TableCell className="text-right text-sm font-bold text-sky-700">{totalL.toFixed(1)} L</TableCell>
                          {canVerPrecios && <TableCell />}
                          {canVerPrecios && (
                            <TableCell className="text-right text-xs text-slate-600">
                              <span className="font-bold text-emerald-700">{formatMonto(montoCobrado)}</span>
                              {montoPendiente > 0 && <span className="text-amber-600 ml-1">(+{formatMonto(montoPendiente)} pdte)</span>}
                            </TableCell>
                          )}
                          <TableCell />
                        </TableRow>
                      );
                    })()}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="financiero" className="mt-0">
          <div className="space-y-4">
            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Gasto en compras',    value: formatMonto(reporteFinanciero.gastoCompras),    sub: `${reporteFinanciero.litrosComprados.toFixed(1)} L`,       color: 'text-rose-600 bg-rose-50' },
                { label: 'Ingresos cobrados',   value: formatMonto(reporteFinanciero.montoCobrado),    sub: `${reporteFinanciero.cantCobradas} ventas`,                color: 'text-emerald-600 bg-emerald-50' },
                { label: 'Por cobrar',          value: formatMonto(reporteFinanciero.montoPorCobrar),  sub: `${reporteFinanciero.cantPorCobrar} ventas entregadas`,    color: 'text-amber-600 bg-amber-50' },
                { label: 'Resultado estimado',  value: formatMonto(Math.abs(reporteFinanciero.resultadoNeto)), sub: reporteFinanciero.resultadoNeto >= 0 ? 'ganancia' : 'pérdida', color: reporteFinanciero.resultadoNeto >= 0 ? 'text-teal-600 bg-teal-50' : 'text-red-600 bg-red-50' },
              ].map(k => (
                <Card key={k.label} className="border-0 shadow-sm">
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${k.color}`}>
                      <DollarSign className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide">{k.label}</p>
                      <p className="text-sm font-bold text-slate-800 truncate">{k.value}</p>
                      <p className="text-[10px] text-slate-400">{k.sub}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Clasificación de salidas */}
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4 space-y-3">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">Destino de salidas del período</p>
                  {reporteFinanciero.litrosTotalSalida > 0 ? (
                    <div className="space-y-2 text-xs">
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                            Almacén VD — genera ingreso
                          </span>
                          <span className="text-emerald-700 font-bold">{reporteFinanciero.litrosVD.toFixed(1)} L · {Math.round(reporteFinanciero.pctVD)}%</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2">
                          <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${reporteFinanciero.pctVD}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="flex items-center gap-1.5 text-rose-600 font-medium">
                            <span className="w-2 h-2 rounded-full bg-rose-400" />
                            Servicios / Flota — gasto
                          </span>
                          <span className="text-rose-600 font-bold">{reporteFinanciero.litrosServicios.toFixed(1)} L · {Math.round(reporteFinanciero.pctServicios)}%</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2">
                          <div className="h-2 rounded-full bg-rose-400" style={{ width: `${reporteFinanciero.pctServicios}%` }} />
                        </div>
                      </div>
                      <p className="text-slate-400 pt-1">Total salidas: {reporteFinanciero.litrosTotalSalida.toFixed(1)} L de {reporteFinanciero.litrosComprados.toFixed(1)} L comprados</p>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 py-2">Sin despachos en el período seleccionado</p>
                  )}
                </CardContent>
              </Card>

              {/* P&L */}
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4 space-y-1.5">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">Resultado financiero estimado</p>
                  {reporteFinanciero.precioPromedio > 0 ? (
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-500">+ Ingresos cobrados</span>
                        <span className="font-medium text-emerald-700">{formatMonto(reporteFinanciero.montoCobrado)}</span>
                      </div>
                      {reporteFinanciero.montoPorCobrar > 0 && (
                        <div className="flex justify-between">
                          <span className="text-slate-400">  (+ por cobrar)</span>
                          <span className="text-amber-600">{formatMonto(reporteFinanciero.montoPorCobrar)}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-slate-500">− Costo de lo vendido</span>
                        <span className="font-medium text-slate-600">−{formatMonto(reporteFinanciero.costoVentas)}</span>
                      </div>
                      <div className="flex justify-between border-t border-slate-100 pt-1">
                        <span className="font-medium text-slate-700">= Margen en ventas</span>
                        <span className={`font-bold ${reporteFinanciero.margenVentas >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                          {reporteFinanciero.margenVentas >= 0 ? '' : '−'}{formatMonto(Math.abs(reporteFinanciero.margenVentas))}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">− Gasto servicios / flota</span>
                        <span className="font-medium text-rose-600">−{formatMonto(reporteFinanciero.costoServicios)}</span>
                      </div>
                      <div className="flex justify-between border-t border-slate-200 pt-1.5">
                        <span className="font-semibold text-slate-800">= Resultado neto</span>
                        <span className={`font-bold text-base ${reporteFinanciero.resultadoNeto >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                          {reporteFinanciero.resultadoNeto >= 0 ? '' : '−'}{formatMonto(Math.abs(reporteFinanciero.resultadoNeto))}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 pt-0.5">
                        Precio prom. compra: {reporteFinanciero.precioPromedio.toFixed(4)}/L (estimado)
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 py-2">Sin compras en el período para estimar costos</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Exportar */}
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs h-8"
                onClick={handleExportFinanciero}
                disabled={exportandoFinanciero}
              >
                {exportandoFinanciero
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Download className="w-3.5 h-3.5" />
                }
                Exportar Excel
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}