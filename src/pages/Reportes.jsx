import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Truck } from 'lucide-react';
import { calcularSaldo, formatMonto } from '@/components/ui-helpers/SaldoUtils';
import CSVExport from '@/components/ui-helpers/CSVExport';

export default function Reportes() {
  const { data: tarjetas = [] } = useQuery({ queryKey: ['tarjetas'], queryFn: () => base44.entities.Tarjeta.list() });
  const { data: vehiculos = [] } = useQuery({ queryKey: ['vehiculos'], queryFn: () => base44.entities.Vehiculo.list() });
  const { data: movimientos = [] } = useQuery({ queryKey: ['movimientos'], queryFn: () => base44.entities.Movimiento.list('-created_date') });

  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

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
      const movs = movsFiltered.filter(m => m.tarjeta_id === t.id);
      const totalRecargado = movs.filter(m => m.tipo === 'RECARGA').reduce((s, m) => s + (m.monto || 0), 0);
      const totalComprado = movs.filter(m => m.tipo === 'COMPRA').reduce((s, m) => s + (m.monto || 0), 0);
      const saldo = calcularSaldo(t, movimientos); // saldo total (no filtrado)
      return {
        id: t.id,
        tarjeta: t.alias || t.id_tarjeta,
        id_tarjeta: t.id_tarjeta,
        moneda: t.moneda,
        saldo_inicial: t.saldo_inicial,
        total_recargado: totalRecargado,
        total_comprado: totalComprado,
        saldo_actual: saldo,
        movimientos: movs.length,
        activa: t.activa,
      };
    });
  }, [tarjetas, movsFiltered, movimientos]);

  // Reporte vehículos
  const reporteVehiculos = useMemo(() => {
    return vehiculos.map(v => {
      const movs = movsFiltered.filter(m => m.vehiculo_chapa === v.chapa && m.tipo === 'COMPRA');
      const litros = movs.reduce((s, m) => s + (m.litros || 0), 0);
      const monto = movs.reduce((s, m) => s + (m.monto || 0), 0);

      // Desglose por combustible
      const porComb = {};
      movs.forEach(m => {
        const key = m.combustible_nombre || 'Otro';
        if (!porComb[key]) porComb[key] = { litros: 0, monto: 0 };
        porComb[key].litros += m.litros || 0;
        porComb[key].monto += m.monto || 0;
      });

      return {
        id: v.id,
        chapa: v.chapa,
        alias: v.alias || '',
        litros,
        monto,
        compras: movs.length,
        desglose: porComb,
        activa: v.activa,
      };
    }).filter(v => v.compras > 0 || v.activa);
  }, [vehiculos, movsFiltered]);

  const csvTarjetas = [
    { label: 'Tarjeta', accessor: 'tarjeta' },
    { label: 'Número', accessor: 'id_tarjeta' },
    { label: 'Moneda', accessor: 'moneda' },
    { label: 'Saldo Inicial', accessor: 'saldo_inicial' },
    { label: 'Total Recargado', accessor: 'total_recargado' },
    { label: 'Total Comprado', accessor: 'total_comprado' },
    { label: 'Saldo Actual', accessor: 'saldo_actual' },
    { label: 'Movimientos', accessor: 'movimientos' },
  ];

  const csvVehiculos = [
    { label: 'Chapa', accessor: 'chapa' },
    { label: 'Alias', accessor: 'alias' },
    { label: 'Litros', accessor: 'litros' },
    { label: 'Monto', accessor: 'monto' },
    { label: 'Compras', accessor: 'compras' },
    { label: 'Desglose', accessor: r => Object.entries(r.desglose).map(([k, v]) => `${k}: ${v.litros.toFixed(1)}L`).join('; ') },
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

      <Tabs defaultValue="tarjetas">
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="tarjetas" className="gap-1.5">
            <CreditCard className="w-3.5 h-3.5" /> Tarjetas
          </TabsTrigger>
          <TabsTrigger value="vehiculos" className="gap-1.5">
            <Truck className="w-3.5 h-3.5" /> Vehículos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tarjetas" className="mt-4">
          <Card className="border-0 shadow-sm">
            <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold text-slate-700">Reporte por Tarjeta</CardTitle>
              <CSVExport data={reporteTarjetas} columns={csvTarjetas} filename="reporte_tarjetas" />
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/50">
                      <TableHead className="text-xs">Tarjeta</TableHead>
                      <TableHead className="text-xs">Moneda</TableHead>
                      <TableHead className="text-xs text-right">S. Inicial</TableHead>
                      <TableHead className="text-xs text-right">Recargado</TableHead>
                      <TableHead className="text-xs text-right">Comprado</TableHead>
                      <TableHead className="text-xs text-right">Saldo</TableHead>
                      <TableHead className="text-xs text-right">#Movs</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reporteTarjetas.map(r => (
                      <TableRow key={r.id}>
                        <TableCell className="text-sm font-medium">{r.tarjeta}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{r.moneda}</Badge></TableCell>
                        <TableCell className="text-right text-sm">{formatMonto(r.saldo_inicial)}</TableCell>
                        <TableCell className="text-right text-sm text-emerald-600">+{formatMonto(r.total_recargado)}</TableCell>
                        <TableCell className="text-right text-sm text-orange-600">-{formatMonto(r.total_comprado)}</TableCell>
                        <TableCell className={`text-right text-sm font-semibold ${r.saldo_actual < 0 ? 'text-red-600' : 'text-slate-800'}`}>{formatMonto(r.saldo_actual)}</TableCell>
                        <TableCell className="text-right text-sm text-slate-500">{r.movimientos}</TableCell>
                      </TableRow>
                    ))}
                    {reporteTarjetas.length === 0 && (
                      <TableRow><TableCell colSpan={7} className="text-center text-slate-400 py-8">Sin datos</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vehiculos" className="mt-4">
          <Card className="border-0 shadow-sm">
            <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold text-slate-700">Reporte por Vehículo</CardTitle>
              <CSVExport data={reporteVehiculos} columns={csvVehiculos} filename="reporte_vehiculos" />
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/50">
                      <TableHead className="text-xs">Chapa</TableHead>
                      <TableHead className="text-xs">Alias</TableHead>
                      <TableHead className="text-xs text-right">Litros</TableHead>
                      <TableHead className="text-xs text-right">Monto</TableHead>
                      <TableHead className="text-xs text-right">#Compras</TableHead>
                      <TableHead className="text-xs">Desglose</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reporteVehiculos.map(r => (
                      <TableRow key={r.id}>
                        <TableCell className="text-sm font-medium">{r.chapa}</TableCell>
                        <TableCell className="text-sm text-slate-500">{r.alias || '—'}</TableCell>
                        <TableCell className="text-right text-sm">{r.litros.toFixed(1)}</TableCell>
                        <TableCell className="text-right text-sm font-medium">{formatMonto(r.monto)}</TableCell>
                        <TableCell className="text-right text-sm text-slate-500">{r.compras}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(r.desglose).map(([k, v]) => (
                              <Badge key={k} variant="outline" className="text-[10px]">
                                {k}: {v.litros.toFixed(1)}L
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {reporteVehiculos.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center text-slate-400 py-8">Sin datos</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}