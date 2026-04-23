import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowUpCircle, ArrowDownCircle, ArrowLeftRight, Filter, Plus } from 'lucide-react';
import { formatMonto } from '@/components/ui-helpers/SaldoUtils';
import { useUserRole } from '@/components/ui-helpers/useUserRole';
import ConfirmDialog from '@/components/ui-helpers/ConfirmDialog';
import CSVExport from '@/components/ui-helpers/CSVExport';
import NuevoMovimientoForm from '@/components/movimientos/NuevoMovimientoForm';
import MovimientoDetalle from '@/components/movimientos/MovimientoDetalle';
import MovimientoAcciones from '@/components/movimientos/MovimientoAcciones';
import LogConsumidorModal from '@/components/movimientos/LogConsumidorModal';
import ConsumidorDetalleModal from '@/components/movimientos/ConsumidorDetalleModal';
import EditarMovimientoModal from '@/components/movimientos/EditarMovimientoModal';
import MovimientosFiltros, { FILTROS_INICIAL } from '@/components/movimientos/MovimientosFiltros';

const TIPO_CONFIG = {
  RECARGA:  { label: 'Recarga',  icon: ArrowUpCircle,   bg: 'bg-emerald-50', text: 'text-emerald-600', badge: 'border-emerald-200 text-emerald-700' },
  COMPRA:   { label: 'Compra',   icon: ArrowDownCircle, bg: 'bg-orange-50',  text: 'text-orange-600',  badge: 'border-orange-200 text-orange-700' },
  DESPACHO: { label: 'Despacho', icon: ArrowLeftRight,  bg: 'bg-purple-50',  text: 'text-purple-600',  badge: 'border-purple-200 text-purple-700' },
};

export default function Movimientos() {
  const { canDelete, canWrite } = useUserRole();
  const queryClient = useQueryClient();

  const { data: movimientos = [], isLoading } = useQuery({
    queryKey: ['movimientos'],
    queryFn: () => base44.entities.Movimiento.list('-fecha', 1000),
  });
  const { data: tarjetas = [] } = useQuery({ queryKey: ['tarjetas'], queryFn: () => base44.entities.Tarjeta.list() });
  const { data: consumidores = [] } = useQuery({ queryKey: ['consumidores'], queryFn: () => base44.entities.Consumidor.list() });
  const { data: combustibles = [] } = useQuery({ queryKey: ['combustibles'], queryFn: () => base44.entities.TipoCombustible.list() });
  const { data: tiposConsumidor = [] } = useQuery({ queryKey: ['tiposConsumidor'], queryFn: () => base44.entities.TipoConsumidor.list() });

  const [filters, setFilters] = useState(FILTROS_INICIAL);
  const [showFilters, setShowFilters] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [showNuevo, setShowNuevo] = useState(false);
  const [detalleMovimiento, setDetalleMovimiento] = useState(null);
  const [logMovimiento, setLogMovimiento] = useState(null);
  const [consumidorDetalleId, setConsumidorDetalleId] = useState(null);
  const [editarMovimiento, setEditarMovimiento] = useState(null);

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Movimiento.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['movimientos'] });
      toast.success('Movimiento eliminado');
      setDeleteId(null);
    },
  });

  const filtered = useMemo(() => {
    const consumidorById = Object.fromEntries(consumidores.map(c => [c.id, c]));
    return movimientos.filter(m => {
      if (filters.fechaDesde && m.fecha < filters.fechaDesde) return false;
      if (filters.fechaHasta && m.fecha > filters.fechaHasta) return false;
      if (filters.tipo !== 'all' && m.tipo !== filters.tipo) return false;
      if (filters.tarjeta !== 'all' && m.tarjeta_id !== filters.tarjeta) return false;
      if (filters.consumidor !== 'all' && m.consumidor_id !== filters.consumidor) return false;
      if (filters.tipoCombustible !== 'all' && m.combustible_id !== filters.tipoCombustible) return false;
      const identificador = String(m.vehiculo_chapa || consumidorById[m.consumidor_id]?.codigo_interno || '').toLowerCase();
      if (filters.chapa && !identificador.includes(String(filters.chapa).toLowerCase())) return false;
      // Filtro por tipo de consumidor (requiere cruzar con consumidores)
      if (filters.tipoConsumidor !== 'all') {
        const con = consumidores.find(c => c.id === m.consumidor_id);
        if (!con || con.tipo_consumidor_id !== filters.tipoConsumidor) return false;
      }
      return true;
    });
  }, [movimientos, filters, consumidores]);

  // Resumen rápido de filtrados
  const resumen = useMemo(() => {
    const litros = filtered.filter(m => m.tipo === 'COMPRA').reduce((s, m) => s + (m.litros || 0), 0);
    const gasto = filtered.filter(m => m.tipo === 'COMPRA').reduce((s, m) => s + (m.monto || 0), 0);
    const litrosDespacho = filtered.filter(m => m.tipo === 'DESPACHO').reduce((s, m) => s + (m.litros || 0), 0);
    return { litros, gasto, litrosDespacho };
  }, [filtered]);

  const csvColumns = [
    { label: 'Fecha', accessor: 'fecha' },
    { label: 'Tipo', accessor: 'tipo' },
    { label: 'Tarjeta', accessor: r => r.tarjeta_alias || r.tarjeta_id || '' },
    { label: 'Consumidor Destino', accessor: r => r.consumidor_nombre || r.vehiculo_chapa || '' },
    { label: 'Chapa/Código destino', accessor: r => r.vehiculo_chapa || consumidores.find(c => c.id === r.consumidor_id)?.codigo_interno || '' },
    { label: 'Consumidor Origen', accessor: r => r.consumidor_origen_nombre || r.vehiculo_origen_chapa || '' },
    { label: 'Combustible', accessor: r => r.combustible_nombre || '' },
    { label: 'Litros', accessor: r => r.litros || '' },
    { label: 'Precio/L', accessor: r => r.precio || '' },
    { label: 'Monto', accessor: 'monto' },
    { label: 'Odómetro', accessor: r => r.odometro || '' },
    { label: 'Km recorridos', accessor: r => r.km_recorridos || '' },
    { label: 'Consumo real (km/L)', accessor: r => r.consumo_real || '' },
    { label: 'Referencia', accessor: r => r.referencia || '' },
  ];

  const hasActiveFilters = Object.entries(filters).some(([k, v]) => v && v !== 'all');

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-800">Movimientos</h1>
          <p className="text-xs text-slate-400">{filtered.length} registros</p>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <CSVExport data={filtered} columns={csvColumns} filename="movimientos" />
          <Button
            variant="outline" size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="gap-1 px-2.5"
          >
            <Filter className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Filtros</span>
            {hasActiveFilters && <span className="w-1.5 h-1.5 rounded-full bg-sky-500 shrink-0" />}
          </Button>
          {canWrite && (
            <Button size="sm" onClick={() => setShowNuevo(true)} className="gap-1 px-2.5 bg-sky-600 hover:bg-sky-700">
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Nuevo</span>
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <MovimientosFiltros
          filters={filters}
          onChange={setFilters}
          consumidores={consumidores}
          tiposConsumidor={tiposConsumidor}
          combustibles={combustibles}
          tarjetas={tarjetas}
        />
      )}

      {/* Resumen rápido cuando hay filtros */}
      {hasActiveFilters && filtered.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {resumen.litros > 0 && (
            <div className="bg-orange-50 border border-orange-100 rounded-lg px-3 py-1.5 flex items-center gap-2">
              <span className="text-xs text-orange-500 font-medium">Litros comprados</span>
              <span className="text-xs font-bold text-orange-700">{resumen.litros.toFixed(1)} L</span>
            </div>
          )}
          {resumen.gasto > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 flex items-center gap-2">
              <span className="text-xs text-slate-500 font-medium">Gasto total</span>
              <span className="text-xs font-bold text-slate-700">{formatMonto(resumen.gasto)}</span>
            </div>
          )}
          {resumen.litrosDespacho > 0 && (
            <div className="bg-purple-50 border border-purple-100 rounded-lg px-3 py-1.5 flex items-center gap-2">
              <span className="text-xs text-purple-500 font-medium">Litros despachados</span>
              <span className="text-xs font-bold text-purple-700">{resumen.litrosDespacho.toFixed(1)} L</span>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="py-12 text-center text-sm text-slate-400">Cargando...</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-slate-400">No hay movimientos</div>
      ) : (
        <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Fecha</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Tipo</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Combustible</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Origen / Tarjeta</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Destino / Consumidor</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Chapa/Código</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Litros</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Precio/L</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Monto</th>
                  <th className="px-2 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(m => {
                  const cfg = TIPO_CONFIG[m.tipo] || TIPO_CONFIG.COMPRA;
                  const Icon = cfg.icon;
                  return (
                    <tr key={m.id} className="hover:bg-slate-50/60 transition-colors group">
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap font-medium text-xs">{m.fecha}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${cfg.bg} ${cfg.text}`}>
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <Badge variant="outline" className={`text-[10px] py-0 px-1.5 border hidden sm:inline-flex ${cfg.badge}`}>
                            {cfg.label}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-xs hidden md:table-cell">
                        {m.combustible_nombre || '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-xs">
                        {m.tipo === 'DESPACHO'
                          ? <span className="text-purple-700 font-medium">{m.consumidor_origen_nombre || m.vehiculo_origen_chapa || 'Reserva'}</span>
                          : <span>{m.tarjeta_alias || m.tarjeta_id || '—'}</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-xs">
                        {m.consumidor_nombre || m.vehiculo_chapa
                          ? (
                            <span className="font-medium">
                              {m.consumidor_nombre || m.vehiculo_chapa}
                            </span>
                          )
                          : '—'
                        }
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs hidden md:table-cell">
                        {m.vehiculo_chapa || consumidores.find(c => c.id === m.consumidor_id)?.codigo_interno || '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700 font-medium whitespace-nowrap text-xs">
                        {m.litros != null ? `${Number(m.litros).toFixed(1)} L` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-500 text-xs whitespace-nowrap hidden lg:table-cell">
                        {m.precio != null ? `$${Number(m.precio).toFixed(2)}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {m.tipo !== 'DESPACHO' && m.monto != null ? (
                          <span className={`text-xs font-bold ${m.tipo === 'RECARGA' ? 'text-emerald-600' : 'text-slate-800'}`}>
                            {m.tipo === 'RECARGA' ? '+' : ''}{formatMonto(m.monto)}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-2 py-3">
                        <MovimientoAcciones
                          movimiento={m}
                          canDelete={canDelete}
                          canWrite={canWrite}
                          onLog={setLogMovimiento}
                          onDetalle={mov => setConsumidorDetalleId(mov.consumidor_id)}
                          onEditar={setEditarMovimiento}
                          onEliminar={setDeleteId}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Nuevo movimiento */}
      <Dialog open={showNuevo} onOpenChange={setShowNuevo}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar Movimiento</DialogTitle>
          </DialogHeader>
          <NuevoMovimientoForm onSuccess={() => setShowNuevo(false)} />
        </DialogContent>
      </Dialog>

      {/* Detalle movimiento */}
      <MovimientoDetalle movimiento={detalleMovimiento} onClose={() => setDetalleMovimiento(null)} />

      {/* Log por consumidor */}
      <LogConsumidorModal
        movimiento={logMovimiento}
        todosMovimientos={movimientos}
        onClose={() => setLogMovimiento(null)}
      />

      {/* Detalle consumidor */}
      <ConsumidorDetalleModal
        consumidorId={consumidorDetalleId}
        todosMovimientos={movimientos}
        onClose={() => setConsumidorDetalleId(null)}
      />

      {/* Editar movimiento */}
      <EditarMovimientoModal
        movimiento={editarMovimiento}
        onClose={() => setEditarMovimiento(null)}
      />

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
