import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Trash2, ArrowUpCircle, ArrowDownCircle, ArrowLeftRight, Filter, X, Plus, Eye, List, Rows3 } from 'lucide-react';
import { formatMonto } from '@/components/ui-helpers/SaldoUtils';
import { useUserRole } from '@/components/ui-helpers/useUserRole';
import ConfirmDialog from '@/components/ui-helpers/ConfirmDialog';
import CSVExport from '@/components/ui-helpers/CSVExport';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import NuevoMovimientoForm from '@/components/movimientos/NuevoMovimientoForm';

export default function Movimientos() {
  const { isAdmin } = useUserRole();
  const queryClient = useQueryClient();
  const { data: movimientos = [], isLoading } = useQuery({
    queryKey: ['movimientos'],
    queryFn: () => base44.entities.Movimiento.list('-fecha'),
  });
  const { data: tarjetas = [] } = useQuery({ queryKey: ['tarjetas'], queryFn: () => base44.entities.Tarjeta.list() });
  const { data: vehiculos = [] } = useQuery({ queryKey: ['vehiculos'], queryFn: () => base44.entities.Vehiculo.list() });
  const { data: combustibles = [] } = useQuery({ queryKey: ['combustibles'], queryFn: () => base44.entities.TipoCombustible.list() });

  const [filters, setFilters] = useState({ fechaDesde: '', fechaHasta: '', tarjeta: 'all', vehiculo: 'all', combustible: 'all', tipo: 'all', soloDespachos: false });
  const [showFilters, setShowFilters] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [showNuevo, setShowNuevo] = useState(false);
  const [viewMode, setViewMode] = useState('table');
  const [detailMovimiento, setDetailMovimiento] = useState(null);

  const movimientosConRecorrido = useMemo(() => {
    const comprasPorVehiculo = new Map();
    const comprasOrdenadas = [...movimientos]
      .filter((m) => m.tipo === 'COMPRA' && m.vehiculo_chapa && m.odometro != null)
      .sort((a, b) => {
        const fa = `${a.fecha || ''}|${a.created_date || ''}`;
        const fb = `${b.fecha || ''}|${b.created_date || ''}`;
        return fa.localeCompare(fb);
      });

    comprasOrdenadas.forEach((mov) => {
      const historial = comprasPorVehiculo.get(mov.vehiculo_chapa) || [];
      historial.push(mov);
      comprasPorVehiculo.set(mov.vehiculo_chapa, historial);
    });

    return movimientos.map((mov) => {
      if (mov.tipo !== 'COMPRA' || mov.odometro == null || !mov.vehiculo_chapa) {
        return { ...mov, km_recorridos: null };
      }

      const historial = comprasPorVehiculo.get(mov.vehiculo_chapa) || [];
      const index = historial.findIndex((item) => item.id === mov.id);
      if (index <= 0) return { ...mov, km_recorridos: null };
      const anterior = historial[index - 1];
      const delta = Number(mov.odometro) - Number(anterior.odometro);
      return { ...mov, km_recorridos: Number.isFinite(delta) && delta >= 0 ? delta : null };
    });
  }, [movimientos]);

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Movimiento.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['movimientos'] });
      toast.success('Movimiento eliminado');
      setDeleteId(null);
    },
  });

  const filtered = useMemo(() => {
    return movimientosConRecorrido.filter(m => {
      if (filters.fechaDesde && m.fecha < filters.fechaDesde) return false;
      if (filters.fechaHasta && m.fecha > filters.fechaHasta) return false;
      if (filters.tarjeta !== 'all' && m.tarjeta_id !== filters.tarjeta) return false;
      if (filters.vehiculo !== 'all' && m.vehiculo_chapa !== filters.vehiculo) return false;
      if (filters.combustible !== 'all' && m.combustible_id !== filters.combustible) return false;
      if (filters.tipo !== 'all' && m.tipo !== filters.tipo) return false;
      if (filters.soloDespachos && m.tipo !== 'DESPACHO') return false;
      return true;
    });
  }, [movimientosConRecorrido, filters]);

  const csvColumns = [
    { label: 'Fecha', accessor: 'fecha' },
    { label: 'Tipo', accessor: 'tipo' },
    { label: 'Tarjeta', accessor: r => r.tarjeta_alias || r.tarjeta_id },
    { label: 'Vehículo', accessor: r => r.vehiculo_chapa || '' },
    { label: 'Combustible', accessor: r => r.combustible_nombre || '' },
    { label: 'Podómetro (km)', accessor: r => r.odometro ?? '' },
    { label: 'Km recorridos', accessor: r => r.km_recorridos ?? '' },
    { label: 'Litros', accessor: r => r.litros || '' },
    { label: 'Precio', accessor: r => r.precio || '' },
    { label: 'Monto', accessor: 'monto' },
    { label: 'Referencia', accessor: r => r.referencia || '' },
  ];

  const hasActiveFilters = Object.entries(filters).some(([k, v]) => v && v !== 'all');

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-800">Movimientos</h1>
          <p className="text-xs text-slate-400">{filtered.length} registros</p>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <CSVExport data={filtered} columns={csvColumns} filename="movimientos" />
          <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)} className="gap-1 px-2.5">
            <Filter className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Filtros</span>
            {hasActiveFilters && <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setViewMode((v) => (v === 'table' ? 'cards' : 'table'))} className="gap-1 px-2.5">
            {viewMode === 'table' ? <Rows3 className="w-3.5 h-3.5" /> : <List className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{viewMode === 'table' ? 'Tarjetas' : 'Tabla'}</span>
          </Button>
          <Button size="sm" onClick={() => setShowNuevo(true)} className="gap-1 px-2.5 bg-sky-600 hover:bg-sky-700">
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Nuevo</span>
          </Button>
        </div>
      </div>

      {showFilters && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 grid grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-slate-500">Desde</label>
              <Input type="date" value={filters.fechaDesde} onChange={e => setFilters(f => ({ ...f, fechaDesde: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <label className="text-xs text-slate-500">Hasta</label>
              <Input type="date" value={filters.fechaHasta} onChange={e => setFilters(f => ({ ...f, fechaHasta: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <label className="text-xs text-slate-500">Tipo</label>
              <Select value={filters.tipo} onValueChange={v => setFilters(f => ({ ...f, tipo: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="RECARGA">Recarga</SelectItem>
                  <SelectItem value="COMPRA">Compra</SelectItem>
                  <SelectItem value="DESPACHO">Despacho</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant={filters.soloDespachos ? 'default' : 'outline'}
                className="w-full mt-1"
                onClick={() => setFilters((f) => ({ ...f, soloDespachos: !f.soloDespachos }))}
              >
                Solo despachos
              </Button>
            </div>
            <div>
              <label className="text-xs text-slate-500">Tarjeta</label>
              <Select value={filters.tarjeta} onValueChange={v => setFilters(f => ({ ...f, tarjeta: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {tarjetas.map(t => <SelectItem key={t.id} value={t.id}>{t.alias || t.id_tarjeta}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-slate-500">Vehículo</label>
              <Select value={filters.vehiculo} onValueChange={v => setFilters(f => ({ ...f, vehiculo: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {vehiculos.map(v => <SelectItem key={v.id} value={v.chapa}>{v.chapa}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-slate-500">Combustible</label>
              <Select value={filters.combustible} onValueChange={v => setFilters(f => ({ ...f, combustible: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {combustibles.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {hasActiveFilters && (
              <div className="col-span-full">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setFilters({ fechaDesde: '', fechaHasta: '', tarjeta: 'all', vehiculo: 'all', combustible: 'all', tipo: 'all', soloDespachos: false })
                  }
                  className="text-xs text-slate-500"
                >
                  <X className="w-3 h-3 mr-1" /> Limpiar filtros
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {isLoading ? (
          <div className="py-12 text-center text-sm text-slate-400">Cargando...</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">No hay movimientos</div>
        ) : viewMode === 'table' ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-0 overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b text-slate-500">
                  <tr>
                    <th className="text-left px-3 py-2">Fecha</th>
                    <th className="text-left px-3 py-2">Tipo</th>
                    <th className="text-left px-3 py-2">Tarjeta</th>
                    <th className="text-left px-3 py-2">Vehículo</th>
                    <th className="text-left px-3 py-2">Combustible</th>
                    <th className="text-right px-3 py-2">Litros</th>
                    <th className="text-right px-3 py-2">Monto</th>
                    <th className="text-left px-3 py-2">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m) => (
                    <tr key={m.id} className="border-b last:border-b-0">
                      <td className="px-3 py-2">{m.fecha}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className="text-[10px] py-0 px-1.5">{m.tipo}</Badge>
                      </td>
                      <td className="px-3 py-2">{m.tarjeta_alias || m.tarjeta_id || '—'}</td>
                      <td className="px-3 py-2">{m.vehiculo_chapa || m.vehiculo_origen_chapa || '—'}</td>
                      <td className="px-3 py-2">{m.combustible_nombre || '—'}</td>
                      <td className="px-3 py-2 text-right">{m.litros != null ? Number(m.litros).toFixed(2) : '—'}</td>
                      <td className="px-3 py-2 text-right">{m.monto != null ? formatMonto(m.monto) : '—'}</td>
                      <td className="px-3 py-2">
                        <Button variant="ghost" size="sm" onClick={() => setDetailMovimiento(m)} className="h-7 px-2">
                          <Eye className="w-3.5 h-3.5 mr-1" /> Ver
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ) : (
          filtered.map(m => (
            <Card key={m.id} className="border-0 shadow-sm">
              <CardContent className="p-3 flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  m.tipo === 'RECARGA' ? 'bg-emerald-50 text-emerald-600'
                  : m.tipo === 'DESPACHO' ? 'bg-purple-50 text-purple-600'
                  : 'bg-orange-50 text-orange-600'
                }`}>
                  {m.tipo === 'RECARGA' ? <ArrowUpCircle className="w-3.5 h-3.5" />
                  : m.tipo === 'DESPACHO' ? <ArrowLeftRight className="w-3.5 h-3.5" />
                  : <ArrowDownCircle className="w-3.5 h-3.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="outline" className={`text-[10px] shrink-0 py-0 px-1.5 ${
                      m.tipo === 'RECARGA' ? 'border-emerald-200 text-emerald-700'
                      : m.tipo === 'DESPACHO' ? 'border-purple-200 text-purple-700'
                      : 'border-orange-200 text-orange-700'
                    }`}>{m.tipo}</Badge>
                    <span className="text-xs font-medium text-slate-700 truncate">
                      {m.tipo === 'COMPRA' ? `${m.vehiculo_chapa || ''}${m.combustible_nombre ? ` · ${m.combustible_nombre}` : ''}`
                      : m.tipo === 'DESPACHO' ? `${m.vehiculo_origen_chapa || ''} → ${m.vehiculo_chapa || ''}`
                      : m.tarjeta_alias || m.tarjeta_id || 'Recarga'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {m.fecha}
                    {m.tipo === 'COMPRA' && m.litros ? ` · ${m.litros}L` : ''}
                    {m.tipo === 'COMPRA' && m.odometro != null ? ` · Odómetro: ${m.odometro} km` : ''}
                    {m.tipo === 'COMPRA' && m.km_recorridos != null ? ` · Recorrido: ${m.km_recorridos.toFixed(1)} km` : ''}
                    {m.referencia ? ` · ${m.referencia}` : ''}
                  </p>
                </div>
                <div className="text-right shrink-0 ml-auto">
                  <span className={`text-sm font-bold ${m.tipo === 'RECARGA' ? 'text-emerald-600' : m.tipo === 'DESPACHO' ? 'text-purple-700' : 'text-slate-800'}`}>
                    {m.tipo === 'DESPACHO' ? `${(m.litros || 0).toFixed(1)}L` : `${m.tipo === 'RECARGA' ? '+' : ''}${formatMonto(m.monto)}`}
                  </span>
                </div>
                {isAdmin && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-slate-200 hover:text-red-500" onClick={() => setDeleteId(m.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={showNuevo} onOpenChange={setShowNuevo}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar Movimiento</DialogTitle>
          </DialogHeader>
          <NuevoMovimientoForm onSuccess={() => setShowNuevo(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!detailMovimiento} onOpenChange={() => setDetailMovimiento(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalle de movimiento</DialogTitle>
          </DialogHeader>
          {detailMovimiento && (
            <div className="space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><b>Fecha:</b> {detailMovimiento.fecha}</div>
                <div><b>Tipo:</b> {detailMovimiento.tipo}</div>
                <div><b>Tarjeta:</b> {detailMovimiento.tarjeta_alias || detailMovimiento.tarjeta_id || '—'}</div>
                <div><b>Vehículo:</b> {detailMovimiento.vehiculo_chapa || '—'}</div>
                <div><b>Combustible:</b> {detailMovimiento.combustible_nombre || '—'}</div>
                <div><b>Precio:</b> {detailMovimiento.precio ?? '—'}</div>
                <div><b>Litros:</b> {detailMovimiento.litros ?? '—'}</div>
                <div><b>Monto:</b> {detailMovimiento.monto ?? '—'}</div>
                <div><b>Odómetro:</b> {detailMovimiento.odometro ?? '—'}</div>
                <div><b>Recorrido:</b> {detailMovimiento.km_recorridos ?? '—'}</div>
              </div>
              <div><b>Referencia:</b> {detailMovimiento.referencia || '—'}</div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title="Eliminar movimiento"
        description="¿Está seguro? Esta acción no se puede deshacer."
        onConfirm={() => deleteMutation.mutate(deleteId)}
        destructive
      />
    </div>
  );
}
