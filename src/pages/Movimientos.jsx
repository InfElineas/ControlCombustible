import React, { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useSearchParams } from 'react-router-dom';
import { ArrowUpCircle, ArrowDownCircle, ArrowLeftRight, Warehouse, Filter, Plus, ChevronLeft, ChevronRight, ChevronDown, Paperclip } from 'lucide-react';
import { formatMonto } from '@/components/ui-helpers/SaldoUtils';
import CombustibleBadge from '@/components/ui-helpers/CombustibleBadge';
import { useUserRole } from '@/components/ui-helpers/useUserRole';
import ConfirmDialog from '@/components/ui-helpers/ConfirmDialog';
import ExportButton from '@/components/ui-helpers/ExportButton';
import NuevoMovimientoForm from '@/components/movimientos/NuevoMovimientoForm';
import MovimientoDetalle from '@/components/movimientos/MovimientoDetalle';
import MovimientoAcciones from '@/components/movimientos/MovimientoAcciones';
import LogConsumidorModal from '@/components/movimientos/LogConsumidorModal';
import ConsumidorDetalleModal from '@/components/movimientos/ConsumidorDetalleModal';
import EditarMovimientoModal from '@/components/movimientos/EditarMovimientoModal';
import MovimientosFiltros, { FILTROS_INICIAL } from '@/components/movimientos/MovimientosFiltros';

const PAGE_SIZE_OPTIONS = [25, 50, 100, 0]; // 0 = todos

const TIPO_CONFIG = {
  RECARGA:  { label: 'Recarga',  icon: ArrowUpCircle,   bg: 'bg-emerald-50', text: 'text-emerald-600', badge: 'border-emerald-200 text-emerald-700' },
  COMPRA:   { label: 'Compra',   icon: ArrowDownCircle, bg: 'bg-orange-50',  text: 'text-orange-600',  badge: 'border-orange-200 text-orange-700' },
  DESPACHO: { label: 'Despacho', icon: ArrowLeftRight,  bg: 'bg-purple-50',  text: 'text-purple-600',  badge: 'border-purple-200 text-purple-700' },
  DEPOSITO: { label: 'Depósito', icon: Warehouse,       bg: 'bg-teal-50',    text: 'text-teal-600',    badge: 'border-teal-200 text-teal-700' },
};

export default function Movimientos() {
  const { canDelete, canWrite, canRecargar, isEconomico, canVerPrecios } = useUserRole();
  const queryClient = useQueryClient();

  const { data: movimientos = [], isLoading } = useQuery({
    queryKey: ['movimientos'],
    queryFn: () => base44.entities.Movimiento.list('-fecha', 5000),
    select: data => [...data].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')),
    staleTime: 5 * 60_000,
  });
  const { data: tarjetas = [] } = useQuery({ queryKey: ['tarjetas'], queryFn: () => base44.entities.Tarjeta.list() });
  const { data: consumidores = [] } = useQuery({ queryKey: ['consumidores'], queryFn: () => base44.entities.Consumidor.list() });
  const { data: combustibles = [] } = useQuery({ queryKey: ['combustibles'], queryFn: () => base44.entities.TipoCombustible.list() });
  const { data: tiposConsumidor = [] } = useQuery({ queryKey: ['tiposConsumidor'], queryFn: () => base44.entities.TipoConsumidor.list() });

  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState(FILTROS_INICIAL);
  const [showFilters, setShowFilters] = useState(false);
  const [tabCombustible, setTabCombustible] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [pinMovId, setPinMovId] = useState(null);

  useEffect(() => {
    const nombreCombustible = searchParams.get('combustible');
    if (!nombreCombustible || combustibles.length === 0) return;
    const match = combustibles.find(c => c.nombre === nombreCombustible);
    if (match) setTabCombustible(match.id);
  }, [searchParams, combustibles]);

  useEffect(() => {
    const movId = searchParams.get('movimientoId');
    if (!movId || movimientos.length === 0) return;
    const mov = movimientos.find(m => m.id === movId);
    if (mov) {
      setPinMovId(movId);
      setDetalleMovimiento(mov);
    }
  }, [searchParams, movimientos]);

  const clearPin = () => {
    setPinMovId(null);
    setSearchParams(prev => { prev.delete('movimientoId'); return prev; });
  };

  useEffect(() => { setPage(1); }, [filters, tabCombustible, pinMovId]);

  const [collapsedDates, setCollapsedDates] = useState(new Set());
  const toggleDate = (fecha) => setCollapsedDates(prev => {
    const next = new Set(prev);
    next.has(fecha) ? next.delete(fecha) : next.add(fecha);
    return next;
  });

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
      queryClient.invalidateQueries({ queryKey: ['ventas'] });
      queryClient.invalidateQueries({ queryKey: ['ventas-pendientes'] });
      toast.success('Movimiento eliminado');
      setDeleteId(null);
    },
    onError: (e) => toast.error(e.message ?? 'Error al eliminar movimiento'),
  });

  const filtered = useMemo(() => {
    if (pinMovId) return movimientos.filter(m => m.id === pinMovId);
    const consumidorById = Object.fromEntries(consumidores.map(c => [c.id, c]));
    return movimientos.filter(m => {
      // Economico ve solo DESPACHOs VD (consumidor_nombre='Uso Logístico'), no los de flota
      if (isEconomico && m.tipo === 'DESPACHO' && m.consumidor_nombre !== 'Uso Logístico') return false;
      if (filters.fechaDesde && m.fecha < filters.fechaDesde) return false;
      if (filters.fechaHasta && m.fecha > filters.fechaHasta) return false;
      if (filters.tipo !== 'all' && m.tipo !== filters.tipo) return false;
      if (filters.tarjeta !== 'all' && m.tarjeta_id !== filters.tarjeta) return false;
      if (filters.consumidor !== 'all') {
        if (m.consumidor_id !== filters.consumidor) {
          // Movimientos sin consumidor_id (bonificaciones): comparar por nombre
          if (!m.consumidor_id) {
            const sel = consumidorById[filters.consumidor];
            if (!sel || (m.consumidor_nombre || '') !== sel.nombre) return false;
          } else {
            return false;
          }
        }
      }
      const identificador = String(m.vehiculo_chapa || consumidorById[m.consumidor_id]?.codigo_interno || '').toLowerCase();
      if (filters.chapa && !identificador.includes(String(filters.chapa).toLowerCase())) return false;
      if (filters.tipoConsumidor !== 'all') {
        const con = consumidorById[m.consumidor_id]
          ?? (!m.consumidor_id ? consumidores.find(c => c.nombre === m.consumidor_nombre) : null);
        if (!con || con.tipo_consumidor_id !== filters.tipoConsumidor) return false;
      }
      return true;
    });
  }, [movimientos, filters, consumidores, pinMovId]);

  // Count per combustible for tab badges
  const tabCounts = useMemo(() => {
    const counts = {};
    filtered.forEach(m => {
      if (m.combustible_id) counts[m.combustible_id] = (counts[m.combustible_id] || 0) + 1;
    });
    return counts;
  }, [filtered]);

  // Only show tabs for combustibles that actually appear in filtered results
  const activeTabs = useMemo(() => combustibles.filter(c => tabCounts[c.id] > 0), [combustibles, tabCounts]);

  const filteredByTab = useMemo(() => {
    if (tabCombustible === 'all') return filtered;
    return filtered.filter(m => m.combustible_id === tabCombustible);
  }, [filtered, tabCombustible]);

  const totalPages = pageSize === 0 ? 1 : Math.max(1, Math.ceil(filteredByTab.length / pageSize));

  const paginated = useMemo(() => {
    if (pageSize === 0) return filteredByTab;
    const start = (page - 1) * pageSize;
    return filteredByTab.slice(start, start + pageSize);
  }, [filteredByTab, page, pageSize]);

  const resumen = useMemo(() => {
    const litros = filteredByTab.filter(m => m.tipo === 'COMPRA').reduce((s, m) => s + (m.litros || 0), 0);
    const gasto = filteredByTab.filter(m => m.tipo === 'COMPRA').reduce((s, m) => s + (m.monto || 0), 0);
    const litrosDespacho = filteredByTab.filter(m => m.tipo === 'DESPACHO').reduce((s, m) => s + (m.litros || 0), 0);
    const litrosDeposito = filteredByTab.filter(m => m.tipo === 'DEPOSITO').reduce((s, m) => s + (m.litros || 0), 0);
    return { litros, gasto, litrosDespacho, litrosDeposito };
  }, [filteredByTab]);

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
    ...(!isEconomico ? [
      { label: 'Odómetro', accessor: r => r.odometro || '' },
      { label: 'Km recorridos', accessor: r => r.km_recorridos || '' },
      { label: 'Consumo real (km/L)', accessor: r => r.consumo_real || '' },
    ] : []),
    { label: 'Referencia', accessor: r => r.referencia || '' },
  ];

  const hasActiveFilters = Object.entries(filters).some(([k, v]) => v && v !== 'all');

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-800">Movimientos</h1>
          <p className="text-xs text-slate-400">{filteredByTab.length} registros</p>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <ExportButton data={filteredByTab} columns={csvColumns} filename="movimientos" title="Movimientos" />
          <Button
            variant="outline" size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="gap-1 px-2.5"
          >
            <Filter className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Filtros</span>
            {hasActiveFilters && <span className="w-1.5 h-1.5 rounded-full bg-sky-500 shrink-0" />}
          </Button>
          {(canWrite || canRecargar) && (
            <Button size="sm" onClick={() => setShowNuevo(true)} className="gap-1 px-2.5 bg-sky-600 hover:bg-sky-700">
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Nuevo</span>
            </Button>
          )}
        </div>
      </div>

      {/* Pin banner */}
      {pinMovId && (
        <div className="flex items-center gap-2 bg-sky-50 border border-sky-200 rounded-xl px-4 py-2 text-sm text-sky-700">
          <span className="font-medium">Mostrando movimiento específico</span>
          <button
            onClick={clearPin}
            className="ml-auto text-xs text-sky-500 hover:text-sky-700 font-semibold underline underline-offset-2"
          >
            × Limpiar
          </button>
        </div>
      )}

      {/* Tabs por combustible */}
      {!pinMovId && activeTabs.length > 1 && (
        <div className="flex gap-0.5 flex-wrap border-b border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setTabCombustible('all')}
            className={`px-3 py-2 text-xs font-medium rounded-t border-b-2 transition-colors -mb-px ${
              tabCombustible === 'all'
                ? 'border-sky-500 text-sky-700 dark:text-sky-400 bg-white dark:bg-slate-900'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
            }`}
          >
            Todos
            <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-normal ${tabCombustible === 'all' ? 'bg-sky-100 dark:bg-sky-900/60 text-sky-600 dark:text-sky-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
              {filtered.length}
            </span>
          </button>
          {activeTabs.map(c => (
            <button
              key={c.id}
              onClick={() => setTabCombustible(c.id)}
              className={`px-3 py-2 text-xs font-medium rounded-t border-b-2 transition-colors -mb-px ${
                tabCombustible === c.id
                  ? 'border-sky-500 text-sky-700 dark:text-sky-400 bg-white dark:bg-slate-900'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              {c.nombre}
              <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-normal ${tabCombustible === c.id ? 'bg-sky-100 dark:bg-sky-900/60 text-sky-600 dark:text-sky-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                {tabCounts[c.id] || 0}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      {showFilters && (
        <MovimientosFiltros
          filters={filters}
          onChange={setFilters}
          consumidores={consumidores}
          tiposConsumidor={tiposConsumidor}
          tarjetas={tarjetas}
        />
      )}

      {/* Resumen rápido — siempre visible para economico, o cuando hay filtros activos */}
      {(isEconomico || hasActiveFilters || tabCombustible !== 'all') && filteredByTab.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {resumen.litros > 0 && (
            <div className="bg-orange-50 border border-orange-100 rounded-lg px-3 py-1.5 flex items-center gap-2">
              <span className="text-xs text-orange-500 font-medium">Litros comprados</span>
              <span className="text-xs font-bold text-orange-700">{resumen.litros.toFixed(1)} L</span>
            </div>
          )}
          {resumen.gasto > 0 && canVerPrecios && (
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
          {resumen.litrosDeposito > 0 && (
            <div className="bg-teal-50 border border-teal-100 rounded-lg px-3 py-1.5 flex items-center gap-2">
              <span className="text-xs text-teal-500 font-medium">Litros depositados</span>
              <span className="text-xs font-bold text-teal-700">{resumen.litrosDeposito.toFixed(1)} L</span>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="py-12 text-center text-sm text-slate-400">Cargando...</div>
      ) : filteredByTab.length === 0 ? (
        <div className="py-12 text-center text-sm text-slate-400">No hay movimientos</div>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
          {/* Paginación superior */}
          {(totalPages > 1 || filteredByTab.length > 0) && (
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50/50">
              <span className="text-xs text-slate-500">
                {pageSize === 0
                  ? `${filteredByTab.length} registros`
                  : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filteredByTab.length)} de ${filteredByTab.length}`}
              </span>
              <div className="flex items-center gap-2">
                <select
                  value={pageSize}
                  onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                  className="h-7 rounded border border-slate-200 bg-white text-xs px-1.5 text-slate-600 focus:outline-none"
                >
                  {PAGE_SIZE_OPTIONS.map(n => (
                    <option key={n} value={n}>{n === 0 ? 'Todos' : n}</option>
                  ))}
                </select>
                {pageSize !== 0 && (<>
                  <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </Button>
                  <span className="px-2 text-xs text-slate-600 tabular-nums">{page} / {totalPages}</span>
                  <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </>)}
              </div>
            </div>
          )}
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
                  {canVerPrecios && <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Precio/L</th>}
                  {canVerPrecios && <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Monto</th>}
                  <th className="px-2 py-3 w-8"></th>
                  <th className="px-2 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(() => {
                  const rows = [];
                  let lastFecha = null;
                  paginated.forEach(m => {
                    if (m.fecha !== lastFecha) {
                      lastFecha = m.fecha;
                      const d = new Date((m.fecha || '') + 'T00:00:00');
                      const label = !Number.isNaN(d.getTime())
                        ? d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
                        : m.fecha;
                      const isCollapsed = collapsedDates.has(m.fecha);
                      const countFecha = paginated.filter(x => x.fecha === m.fecha).length;
                      rows.push(
                        <tr key={`sep-${m.fecha}`} className="cursor-pointer select-none" onClick={() => toggleDate(m.fecha)}>
                          <td colSpan={11} className="px-4 py-1.5 bg-slate-50 border-y border-slate-100">
                            <div className="flex items-center gap-2">
                              <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{label}</span>
                              {isCollapsed && (
                                <span className="text-[10px] text-slate-400 font-normal normal-case tracking-normal">{countFecha} movimiento{countFecha !== 1 ? 's' : ''}</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    }
                    if (collapsedDates.has(m.fecha)) return;
                    const cfg = TIPO_CONFIG[m.tipo] || TIPO_CONFIG.COMPRA;
                    const Icon = cfg.icon;
                    rows.push(
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
                      <td className="px-4 py-3 hidden md:table-cell">
                        {m.combustible_nombre
                          ? <CombustibleBadge nombre={m.combustible_nombre} />
                          : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-xs">
                        {m.tipo === 'DESPACHO'
                          ? <span className="text-purple-700 font-medium">{m.consumidor_origen_nombre || m.vehiculo_origen_chapa || 'Reserva'}</span>
                          : m.tipo === 'DEPOSITO'
                          ? <span className="text-teal-600">
                              {m.referencia
                                ? m.referencia
                                : m.tarjeta_alias
                                ? <span className="text-slate-500">{m.tarjeta_alias}</span>
                                : <span className="text-slate-300">—</span>}
                            </span>
                          : <span>{m.tarjeta_alias || m.tarjeta_id || '—'}</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-xs">
                        {m.consumidor_nombre || m.vehiculo_chapa
                          ? <span className="font-medium">{m.consumidor_nombre || m.vehiculo_chapa}</span>
                          : '—'
                        }
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs hidden md:table-cell">
                        {m.vehiculo_chapa || consumidores.find(c => c.id === m.consumidor_id)?.codigo_interno || '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700 font-medium whitespace-nowrap text-xs">
                        {m.litros != null ? `${Number(m.litros).toFixed(1)} L` : '—'}
                      </td>
                      {canVerPrecios && (
                        <td className="px-4 py-3 text-right text-slate-500 text-xs whitespace-nowrap hidden lg:table-cell">
                          {m.precio != null ? `$${Number(m.precio).toFixed(2)}` : '—'}
                        </td>
                      )}
                      {canVerPrecios && (
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {m.tipo !== 'DESPACHO' && m.monto != null ? (
                            <span className={`text-xs font-bold ${m.tipo === 'RECARGA' ? 'text-emerald-600' : 'text-slate-800'}`}>
                              {m.tipo === 'RECARGA' ? '+' : ''}{formatMonto(m.monto)}
                            </span>
                          ) : '—'}
                        </td>
                      )}
                      <td className="px-2 py-3 text-center">
                        {m.adjunto_url && (
                          <a href={m.adjunto_url} target="_blank" rel="noreferrer" title={m.adjunto_nombre || 'Ver adjunto'}
                            className="inline-flex text-slate-400 hover:text-sky-500 transition-colors">
                            <Paperclip className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </td>
                      <td className="px-2 py-3">
                        <MovimientoAcciones
                          movimiento={m}
                          canDelete={canDelete}
                          canWrite={canWrite}
                          onVerDetalle={setDetalleMovimiento}
                          onLog={setLogMovimiento}
                          onDetalle={mov => setConsumidorDetalleId(mov.consumidor_id)}
                          onEditar={setEditarMovimiento}
                          onEliminar={setDeleteId}
                        />
                      </td>
                    </tr>
                    );
                  });
                  return rows;
                })()}
              </tbody>
              {filteredByTab.length > 0 && (() => {
                const totalLitros = filteredByTab.reduce((s, m) => s + (Number(m.litros) || 0), 0);
                const totalMonto  = filteredByTab.filter(m => m.monto != null && m.tipo !== 'DESPACHO').reduce((s, m) => s + (Number(m.monto) || 0), 0);
                const detalles = [];
                const lC = filteredByTab.filter(m => m.tipo === 'COMPRA').reduce((s, m) => s + (Number(m.litros) || 0), 0);
                const lD = filteredByTab.filter(m => m.tipo === 'DESPACHO').reduce((s, m) => s + (Number(m.litros) || 0), 0);
                const lDep = filteredByTab.filter(m => m.tipo === 'DEPOSITO').reduce((s, m) => s + (Number(m.litros) || 0), 0);
                if (lC > 0)   detalles.push(`${lC.toFixed(1)} L comprados`);
                if (lD > 0)   detalles.push(`${lD.toFixed(1)} L despachados`);
                if (lDep > 0) detalles.push(`${lDep.toFixed(1)} L depositados`);
                // Desglose por combustible
                const porCombustible = {};
                filteredByTab.forEach(m => {
                  const k = m.combustible_nombre || 'Sin tipo';
                  porCombustible[k] = (porCombustible[k] || 0) + (Number(m.litros) || 0);
                });
                const combustibleEntries = Object.entries(porCombustible).sort((a, b) => b[1] - a[1]);
                const fmtL = n => n % 1 === 0 ? String(Math.round(n)) : n.toFixed(1);
                return (
                  <tfoot>
                    <tr className="bg-slate-100 border-t-2 border-slate-300">
                      <td colSpan={6} className="px-4 py-2.5 text-xs font-bold text-slate-700">
                        Total — {filteredByTab.length} registro{filteredByTab.length !== 1 ? 's' : ''}
                        {detalles.length > 1 && <span className="font-normal text-slate-500 ml-2">({detalles.join(' · ')})</span>}
                        {combustibleEntries.length > 1 && (
                          <span className="font-normal text-slate-400 ml-2">
                            · {combustibleEntries.map(([nom, l]) => `${nom}: ${fmtL(l)} L`).join(' · ')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs font-bold text-slate-800 whitespace-nowrap">
                        {totalLitros.toFixed(1)} L
                      </td>
                      {canVerPrecios && <td className="px-4 py-2.5 hidden lg:table-cell" />}
                      {canVerPrecios && (
                        <td className="px-4 py-2.5 text-right text-xs font-bold text-slate-800 whitespace-nowrap">
                          {totalMonto > 0 ? formatMonto(totalMonto) : '—'}
                        </td>
                      )}
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                );
              })()}
            </table>
          </div>

          {/* Paginación inferior */}
          {pageSize !== 0 && totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/50">
              <span className="text-xs text-slate-500">
                {`${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filteredByTab.length)} de ${filteredByTab.length}`}
              </span>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                  <ChevronLeft className="w-3.5 h-3.5" />
                </Button>
                <span className="px-2 text-xs text-slate-600 tabular-nums">{page} / {totalPages}</span>
                <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
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

      <MovimientoDetalle movimiento={detalleMovimiento} onClose={() => setDetalleMovimiento(null)} />

      <LogConsumidorModal
        movimiento={logMovimiento}
        todosMovimientos={movimientos}
        onClose={() => setLogMovimiento(null)}
      />

      <ConsumidorDetalleModal
        consumidorId={consumidorDetalleId}
        todosMovimientos={movimientos}
        onClose={() => setConsumidorDetalleId(null)}
      />

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
