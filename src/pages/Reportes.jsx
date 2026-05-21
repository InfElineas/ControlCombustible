import React, { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Users, BarChart2 } from 'lucide-react';
import { formatMonto } from '@/components/ui-helpers/SaldoUtils';
import ExportButton from '@/components/ui-helpers/ExportButton';
import { useUserRole } from '@/components/ui-helpers/useUserRole';

import ReporteConsumo from '@/components/reportes/ReporteConsumo';
import ReporteVehiculos from '@/components/reportes/ReporteVehiculos';

export default function Reportes() {
  const { isOperador } = useUserRole();
  const [tab, setTab] = useState('tarjetas');

  useEffect(() => {
    if (isOperador && tab === 'tarjetas') setTab('vehiculos');
  }, [isOperador]);
  const { data: tarjetas = [] } = useQuery({ queryKey: ['tarjetas'], queryFn: () => base44.entities.Tarjeta.list() });
  const { data: consumidores = [] } = useQuery({ queryKey: ['consumidores'], queryFn: () => base44.entities.Consumidor.list() });
  const { data: movimientos = [] } = useQuery({ queryKey: ['movimientos'], queryFn: () => base44.entities.Movimiento.list('-created_date', 2000) });

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


  const csvTarjetas = [
    { label: 'Tarjeta', accessor: 'tarjeta' },
    { label: 'Número', accessor: 'id_tarjeta' },
    { label: 'Moneda', accessor: 'moneda' },
    { label: 'Total Comprado', accessor: 'total_comprado' },
    { label: 'Total Litros', accessor: 'litros_total' },
    { label: 'Movimientos', accessor: 'movimientos' },
  ];


  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Reportes</h1>
        <p className="text-sm text-slate-400">Análisis de tarjetas y vehículos</p>
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-4 flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-slate-500">Desde</label>
            <Input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} className="mt-1 w-40" />
          </div>
          <div>
            <label className="text-xs text-slate-500">Hasta</label>
            <Input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} className="mt-1 w-40" />
          </div>
          {(fechaDesde || fechaHasta) && (
            <button className="text-xs text-sky-600 hover:underline pb-2" onClick={() => { setFechaDesde(''); setFechaHasta(''); }}>Limpiar</button>
          )}
        </CardContent>
      </Card>

      <Tabs value={tab}>
        <div className="flex gap-0.5 flex-wrap border-b border-slate-200 dark:border-slate-700 mb-4">
          {[
            !isOperador && { value: 'tarjetas',  label: 'Tarjetas',      icon: <CreditCard className="w-3.5 h-3.5" /> },
            { value: 'vehiculos', label: 'Consumidores',   icon: <BarChart2  className="w-3.5 h-3.5" /> },
            { value: 'consumo',   label: 'Consumo',        icon: <Users      className="w-3.5 h-3.5" /> },
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
                      <TableHead className="text-xs text-right">Comprado</TableHead>
                      <TableHead className="text-xs text-right">Litros</TableHead>
                      <TableHead className="text-xs text-right">#Movs</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reporteTarjetas.map(r => (
                      <TableRow key={r.id}>
                        <TableCell className="text-sm font-medium">{r.tarjeta}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{r.moneda}</Badge></TableCell>
                        <TableCell className="text-right text-sm text-orange-600">{formatMonto(r.total_comprado)}</TableCell>
                        <TableCell className="text-right text-sm text-slate-700">{r.litros_total > 0 ? `${r.litros_total.toFixed(1)} L` : '—'}</TableCell>
                        <TableCell className="text-right text-sm text-slate-500">{r.movimientos}</TableCell>
                      </TableRow>
                    ))}
                    {reporteTarjetas.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center text-slate-400 py-8">Sin datos</TableCell></TableRow>
                    )}
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
      </Tabs>
    </div>
  );
}