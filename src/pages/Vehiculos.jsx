import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import CombustibleBadge from '@/components/ui-helpers/CombustibleBadge';
import { toast } from "sonner";
import { Plus, Pencil, Power, Trash2, TrendingUp, AlertTriangle, Clock } from 'lucide-react';
import StatusBadge from '@/components/ui-helpers/StatusBadge';
import ConfirmDialog from '@/components/ui-helpers/ConfirmDialog';
import { computeVehiculoMonthlyStats, getMonthOptionsFromMovimientos } from '@/lib/fuel-analytics';

const ESTADOS_VEHICULO = ['Operativo', 'En mantenimiento', 'Fuera de servicio', 'Baja'];

const emptyForm = {
  chapa: '', alias: '', area_centro: '', activa: true,
  marca: '', modelo: '', anio: '', tipo_vehiculo: '',
  combustible_nombre: '', capacidad_tanque: '',
  indice_consumo_fabricante: '', indice_consumo_real: '',
  responsable: '', conductor: '', estado_vehiculo: 'Operativo', funcion: '',
};

export default function Vehiculos() {
  const queryClient = useQueryClient();
  const { data: vehiculos = [] } = useQuery({ queryKey: ['vehiculos'], queryFn: () => base44.entities.Vehiculo.list() });
  const { data: movimientos = [] } = useQuery({ queryKey: ['movimientos'], queryFn: () => base44.entities.Movimiento.list('-fecha', 5000), staleTime: 5 * 60_000 });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [mesFiltro, setMesFiltro] = useState('ALL');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [confirmAction, setConfirmAction] = useState(null);

  const opcionesMes = useMemo(() => getMonthOptionsFromMovimientos(movimientos), [movimientos]);

  const resumenParque = useMemo(() => {
    let totalLitros = 0;
    let sumConsumo = 0;
    let countConsumo = 0;
    let ultimaCargaFecha = '';
    const filas = [];

    vehiculos.forEach(v => {
      const stats = computeVehiculoMonthlyStats(v, movimientos, mesFiltro);
      totalLitros += stats.litrosMes;
      if (stats.consumoMes > 0) { sumConsumo += stats.consumoMes; countConsumo += 1; }
      if (stats.fechaUltimoAbastecimiento && stats.fechaUltimoAbastecimiento > ultimaCargaFecha)
        ultimaCargaFecha = stats.fechaUltimoAbastecimiento;

      const consumoEsperado = Number(v.indice_consumo_real) || 0;
      let desvPct = null;
      if (consumoEsperado > 0 && stats.consumoMes > 0)
        desvPct = ((stats.consumoMes - consumoEsperado) / consumoEsperado) * 100;

      filas.push({
        v,
        litrosMes: stats.litrosMes,
        consumoMes: stats.consumoMes,
        consumoEsperado,
        desvPct,
        ultimaCargaFecha: stats.fechaUltimoAbastecimiento || '',
        diasDesdeAbast: stats.diasDesdeUltimoAbast,
      });
    });

    filas.sort((a, b) => b.litrosMes - a.litrosMes);

    return {
      totalLitros,
      consumoPromedio: countConsumo > 0 ? sumConsumo / countConsumo : 0,
      ultimaCargaFecha,
      conActividad: filas.filter(f => f.litrosMes > 0),
      sinActividad: filas.filter(f => f.litrosMes === 0),
    };
  }, [vehiculos, movimientos, mesFiltro]);

  const createMut = useMutation({
    mutationFn: (d) => base44.entities.Vehiculo.create(d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['vehiculos'] }); toast.success('Vehículo creado'); closeDialog(); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, d }) => base44.entities.Vehiculo.update(id, d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['vehiculos'] }); toast.success('Vehículo actualizado'); closeDialog(); },
  });
  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.Vehiculo.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['vehiculos'] }); toast.success('Vehículo eliminado'); setConfirmAction(null); },
  });

  const closeDialog = () => { setDialogOpen(false); setEditing(null); setForm(emptyForm); };

  const openEdit = (v) => {
    setEditing(v);
    setForm({
      chapa: v.chapa, alias: v.alias || '', area_centro: v.area_centro || '', activa: v.activa,
      marca: v.marca || '', modelo: v.modelo || '', anio: v.anio || '',
      tipo_vehiculo: v.tipo_vehiculo || '', combustible_nombre: v.combustible_nombre || '',
      capacidad_tanque: v.capacidad_tanque || '', indice_consumo_fabricante: v.indice_consumo_fabricante || '',
      indice_consumo_real: v.indice_consumo_real || '', responsable: v.responsable || '',
      conductor: v.conductor || '', estado_vehiculo: v.estado_vehiculo || 'Operativo', funcion: v.funcion || '',
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.chapa.trim()) { toast.error('Chapa/matrícula requerida'); return; }
    if (!editing && vehiculos.some(v => v.chapa === form.chapa.trim())) {
      toast.error('Ya existe un vehículo con esa chapa'); return;
    }
    if (editing) {
      updateMut.mutate({ id: editing.id, d: form });
    } else {
      createMut.mutate(form);
    }
  };

  const handleDelete = (v) => {
    const tieneMovs = movimientos.some(m => m.vehiculo_chapa === v.chapa);
    if (tieneMovs) { toast.error('Tiene movimientos. Solo puede desactivarlo.'); return; }
    setConfirmAction({ id: v.id, title: 'Eliminar vehículo', desc: `¿Eliminar "${v.chapa}"?` });
  };

  const toggleActive = (v) => updateMut.mutate({ id: v.id, d: { activa: !v.activa } });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Vehículos</h1>
          <p className="text-sm text-slate-400">{vehiculos.length} registrados</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={mesFiltro} onValueChange={setMesFiltro}>
            <SelectTrigger className="h-8 w-48"><SelectValue placeholder="Mes" /></SelectTrigger>
            <SelectContent>
              {opcionesMes.map(opt => <SelectItem key={opt.key} value={opt.key}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" className="gap-1.5 bg-sky-600 hover:bg-sky-700" onClick={() => { setForm(emptyForm); setEditing(null); setDialogOpen(true); }}>
            <Plus className="w-4 h-4" /> Nuevo
          </Button>
        </div>
      </div>

      {/* Resumen del parque */}
      {vehiculos.length > 0 && (
        <div className="space-y-3">
          {/* KPIs agregados */}
          <div className="flex items-center gap-2 text-slate-600">
            <TrendingUp className="w-4 h-4 text-violet-500" />
            <span className="text-xs font-semibold uppercase tracking-wide">Resumen del parque</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-3">
                <p className="text-[11px] text-slate-400 uppercase tracking-wide">Litros del período</p>
                <p className="text-lg font-bold text-violet-700 mt-1">
                  {resumenParque.totalLitros > 0 ? `${resumenParque.totalLitros.toFixed(1)} L` : '—'}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">{resumenParque.conActividad.length} vehículos activos</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-3">
                <p className="text-[11px] text-slate-400 uppercase tracking-wide">Consumo prom. parque</p>
                <p className="text-lg font-bold text-slate-800 mt-1">
                  {resumenParque.consumoPromedio > 0 ? `${resumenParque.consumoPromedio.toFixed(2)} km/L` : '—'}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">sobre cargas con odómetro</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-3">
                <p className="text-[11px] text-slate-400 uppercase tracking-wide">Última carga (parque)</p>
                <p className="text-base font-bold text-slate-800 mt-1">
                  {resumenParque.ultimaCargaFecha || '—'}
                </p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-3">
                <p className="text-[11px] text-slate-400 uppercase tracking-wide">Sin actividad</p>
                <p className="text-lg font-bold text-slate-400 mt-1">{resumenParque.sinActividad.length}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">vehículos sin cargas</p>
              </CardContent>
            </Card>
          </div>

          {/* Tabla de ranking por vehículo */}
          {resumenParque.conActividad.length > 0 && (
            <Card className="border-0 shadow-sm">
              <CardContent className="p-0">
                <div className="px-4 py-3 border-b border-slate-100">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Ranking por consumo del período</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-[11px] text-slate-400 uppercase tracking-wide">
                        <th className="text-left px-4 py-2 font-medium">#</th>
                        <th className="text-left px-4 py-2 font-medium">Vehículo</th>
                        <th className="text-left px-4 py-2 font-medium hidden sm:table-cell">Combustible</th>
                        <th className="text-right px-4 py-2 font-medium">Litros</th>
                        <th className="text-right px-4 py-2 font-medium hidden md:table-cell">Consumo real</th>
                        <th className="text-right px-4 py-2 font-medium hidden md:table-cell">Eficiencia</th>
                        <th className="text-right px-4 py-2 font-medium">Días sin carga</th>
                        <th className="text-left px-4 py-2 font-medium hidden lg:table-cell">Conductor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resumenParque.conActividad.map((fila, idx) => {
                        const { v, litrosMes, consumoMes, consumoEsperado, desvPct, diasDesdeAbast } = fila;
                        const esTop = idx === 0;

                        let eficienciaColor = 'text-slate-400';
                        let eficienciaLabel = '—';
                        if (desvPct !== null) {
                          if (desvPct >= -10) { eficienciaColor = 'text-emerald-600'; eficienciaLabel = 'Normal'; }
                          else if (desvPct >= -25) { eficienciaColor = 'text-amber-600'; eficienciaLabel = 'Alerta'; }
                          else { eficienciaColor = 'text-red-600'; eficienciaLabel = 'Crítico'; }
                        }

                        const diasColor = diasDesdeAbast != null && diasDesdeAbast > 30
                          ? 'text-red-600 font-semibold'
                          : 'text-slate-600';

                        return (
                          <tr key={v.id} className={`border-b border-slate-50 hover:bg-slate-50/60 transition-colors ${esTop ? 'bg-violet-50/30' : ''}`}>
                            <td className="px-4 py-2.5 text-slate-400 font-mono">{idx + 1}</td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2">
                                {esTop && <span title="Más activo">⭐</span>}
                                <div>
                                  <p className="font-semibold text-slate-800">{v.chapa}</p>
                                  {v.alias && <p className="text-[11px] text-slate-400">{v.alias}</p>}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-2.5 hidden sm:table-cell">
                              {v.combustible_nombre
                                ? <CombustibleBadge nombre={v.combustible_nombre} />
                                : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-4 py-2.5 text-right font-semibold text-slate-800">
                              {litrosMes.toFixed(1)} L
                            </td>
                            <td className="px-4 py-2.5 text-right hidden md:table-cell">
                              {consumoMes > 0
                                ? <span className="text-slate-700">{consumoMes.toFixed(2)} km/L</span>
                                : <span className="text-slate-300">Sin datos</span>}
                              {consumoEsperado > 0 && (
                                <p className="text-[11px] text-slate-400">esp. {consumoEsperado} km/L</p>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right hidden md:table-cell">
                              {desvPct !== null ? (
                                <span className={`font-semibold ${eficienciaColor}`}>
                                  {eficienciaLabel}
                                  <span className="text-[11px] font-normal ml-1">({desvPct > 0 ? '+' : ''}{desvPct.toFixed(1)}%)</span>
                                </span>
                              ) : <span className="text-slate-300">—</span>}
                            </td>
                            <td className={`px-4 py-2.5 text-right ${diasColor}`}>
                              {diasDesdeAbast != null ? (
                                <span className="inline-flex items-center gap-1 justify-end">
                                  {diasDesdeAbast > 30 && <AlertTriangle className="w-3 h-3" />}
                                  {diasDesdeAbast}d
                                </span>
                              ) : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-4 py-2.5 hidden lg:table-cell text-slate-500 truncate max-w-[140px]">
                              {v.conductor || v.responsable || <span className="text-slate-300">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Vehículos sin actividad colapsados */}
                {resumenParque.sinActividad.length > 0 && (
                  <details className="border-t border-slate-100">
                    <summary className="px-4 py-2.5 text-[11px] text-slate-400 cursor-pointer hover:text-slate-600 flex items-center gap-1.5">
                      <Clock className="w-3 h-3" />
                      {resumenParque.sinActividad.length} vehículo(s) sin cargas en el período
                    </summary>
                    <div className="px-4 pb-3 flex flex-wrap gap-2">
                      {resumenParque.sinActividad.map(({ v, diasDesdeAbast }) => (
                        <div key={v.id} className="flex items-center gap-1.5 bg-slate-50 rounded-lg px-2.5 py-1.5 text-xs">
                          <span className="font-medium text-slate-600">{v.chapa}</span>
                          {diasDesdeAbast != null && (
                            <span className={`${diasDesdeAbast > 30 ? 'text-red-500' : 'text-slate-400'}`}>
                              {diasDesdeAbast}d sin carga
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {vehiculos.map(v => {
          const stats = computeVehiculoMonthlyStats(v, movimientos, mesFiltro);
          const consumoEsperado = Number(v.indice_consumo_real) || Number(v.indice_consumo_fabricante) || 0;
          const consumoAlerta = consumoEsperado > 0 && stats.consumoMes > 0
            && ((consumoEsperado - stats.consumoMes) / consumoEsperado) * 100 >= 20;
          const dias = stats.diasDesdeUltimoAbast;
          const diasStyle = dias == null ? 'bg-slate-50 text-slate-400'
            : dias > 30 ? 'bg-red-50 text-red-700'
            : dias > 14 ? 'bg-amber-50 text-amber-700'
            : 'bg-emerald-50 text-emerald-700';
          const estadoBorderColor = {
            'Operativo': 'border-emerald-200 text-emerald-700',
            'En mantenimiento': 'border-amber-200 text-amber-700',
            'Fuera de servicio': 'border-red-200 text-red-700',
            'Baja': 'border-slate-200 text-slate-500',
          }[v.estado_vehiculo] || 'border-slate-200 text-slate-500';
          return (
            <Card key={v.id} className={`border border-slate-200 shadow-sm ${!v.activa ? 'opacity-60' : ''}`}>
              <CardContent className="p-3 space-y-2">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h3 className="text-sm font-bold text-slate-800">{v.alias || v.chapa}</h3>
                      {consumoAlerta && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {v.alias ? v.chapa : [v.marca, v.modelo, v.anio].filter(Boolean).join(' ')}
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-end items-center gap-1 shrink-0">
                    {v.combustible_nombre && (
                      <CombustibleBadge nombre={v.combustible_nombre} />
                    )}
                    {v.estado_vehiculo && (
                      <Badge variant="outline" className={`text-[10px] ${estadoBorderColor}`}>{v.estado_vehiculo}</Badge>
                    )}
                  </div>
                </div>

                {/* Data grid 2×2 */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md bg-slate-50 p-2">
                    <p className="text-slate-400">Última carga</p>
                    {stats.ultimaCarga ? (
                      <>
                        <p className="font-semibold">{Number(stats.ultimaCarga.litros || 0).toFixed(1)} L{stats.ultimaCarga.precio ? ` · $${Number(stats.ultimaCarga.precio).toFixed(2)}` : ''}</p>
                        <p className="text-slate-500">{stats.ultimaCarga.fecha}</p>
                      </>
                    ) : <p className="text-slate-300 font-medium">Sin datos</p>}
                  </div>
                  <div className="rounded-md bg-slate-50 p-2">
                    <p className="text-slate-400">Litros (período)</p>
                    <p className="font-semibold">{stats.litrosMes > 0 ? `${stats.litrosMes.toFixed(1)} L` : '—'}</p>
                    {stats.odometroInicio != null && (
                      <p className="text-slate-500">{stats.odometroInicio.toLocaleString()} km</p>
                    )}
                  </div>
                  <div className="rounded-md bg-slate-50 p-2">
                    <p className="text-slate-400">Consumo real (últ.)</p>
                    {stats.consumoMes > 0
                      ? <p className={`font-semibold ${consumoAlerta ? 'text-amber-600' : 'text-slate-700'}`}>{stats.consumoMes.toFixed(2)} km/L</p>
                      : <p className="text-slate-300 font-medium">Sin datos</p>
                    }
                    {consumoEsperado > 0 && <p className="text-slate-400">ref: {consumoEsperado} km/L</p>}
                  </div>
                  <div className={`rounded-md p-2 ${diasStyle}`}>
                    <p className="opacity-70 text-[11px]">Días sin abast.</p>
                    <p className="font-bold text-sm">{dias != null ? `${dias}d atrás` : '—'}</p>
                    {v.capacidad_tanque && <p className="opacity-60 text-[11px]">🛢 {v.capacidad_tanque} L</p>}
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-0.5">
                  <p className="text-[11px] text-slate-400 truncate">
                    {v.conductor ? `👤 ${v.conductor}` : v.responsable ? `🏷 ${v.responsable}` : v.area_centro || ''}
                  </p>
                  <div className="flex gap-0.5 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(v)}><Pencil className="w-3 h-3" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleActive(v)}><Power className={`w-3 h-3 ${v.activa ? 'text-emerald-500' : 'text-slate-300'}`} /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-300 hover:text-red-500" onClick={() => handleDelete(v)}><Trash2 className="w-3 h-3" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {vehiculos.length === 0 && <p className="text-sm text-slate-400 text-center py-12">No hay vehículos</p>}
      </div>

      <Dialog open={dialogOpen} onOpenChange={closeDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Editar Vehículo' : 'Nuevo Vehículo'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">

            {/* Identificación */}
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Identificación</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <Label className="text-xs text-slate-500">Chapa/Matrícula *</Label>
                  <Input value={form.chapa} onChange={e => setForm(f => ({ ...f, chapa: e.target.value }))} disabled={!!editing} className="mt-1" placeholder="Ej: M-12345" />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <Label className="text-xs text-slate-500">Alias / Nombre</Label>
                  <Input value={form.alias} onChange={e => setForm(f => ({ ...f, alias: e.target.value }))} placeholder="Ej: Fuso Refrigerado" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-slate-500">Tipo de Vehículo</Label>
                  <Input value={form.tipo_vehiculo} onChange={e => setForm(f => ({ ...f, tipo_vehiculo: e.target.value }))} placeholder="Ej: Camión, Auto, Moto" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-slate-500">Área/Centro</Label>
                  <Input value={form.area_centro} onChange={e => setForm(f => ({ ...f, area_centro: e.target.value }))} placeholder="Departamento" className="mt-1" />
                </div>
              </div>
            </div>

            {/* Datos técnicos */}
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Datos Técnicos</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs text-slate-500">Marca</Label>
                  <Input value={form.marca} onChange={e => setForm(f => ({ ...f, marca: e.target.value }))} placeholder="Toyota" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-slate-500">Modelo</Label>
                  <Input value={form.modelo} onChange={e => setForm(f => ({ ...f, modelo: e.target.value }))} placeholder="Hilux" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-slate-500">Año</Label>
                  <Input type="number" value={form.anio} onChange={e => setForm(f => ({ ...f, anio: e.target.value }))} placeholder="2020" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-slate-500">Combustible</Label>
                  <Input value={form.combustible_nombre} onChange={e => setForm(f => ({ ...f, combustible_nombre: e.target.value }))} placeholder="Diesel, Gasolina…" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-slate-500">Capacidad Tanque (L)</Label>
                  <Input type="number" value={form.capacidad_tanque} onChange={e => setForm(f => ({ ...f, capacidad_tanque: e.target.value }))} placeholder="60" className="mt-1" />
                </div>
              </div>
            </div>

            {/* Consumo */}
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Índices de Consumo</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-slate-500">Fabricante (km/L)</Label>
                  <Input type="number" step="0.01" value={form.indice_consumo_fabricante} onChange={e => setForm(f => ({ ...f, indice_consumo_fabricante: e.target.value }))} placeholder="12.5" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-slate-500">Real del Titular (km/L)</Label>
                  <Input type="number" step="0.01" value={form.indice_consumo_real} onChange={e => setForm(f => ({ ...f, indice_consumo_real: e.target.value }))} placeholder="10.0" className="mt-1" />
                </div>
              </div>
            </div>

            {/* Operación */}
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Operación</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-slate-500">Responsable</Label>
                  <Input value={form.responsable} onChange={e => setForm(f => ({ ...f, responsable: e.target.value }))} placeholder="Nombre del responsable" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-slate-500">Conductor</Label>
                  <Input value={form.conductor} onChange={e => setForm(f => ({ ...f, conductor: e.target.value }))} placeholder="Conductor asignado" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-slate-500">Estado del Vehículo</Label>
                  <Select value={form.estado_vehiculo} onValueChange={v => setForm(f => ({ ...f, estado_vehiculo: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ESTADOS_VEHICULO.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-slate-500">Función</Label>
                  <Input value={form.funcion} onChange={e => setForm(f => ({ ...f, funcion: e.target.value }))} placeholder="Transporte, reparto…" className="mt-1" />
                </div>
              </div>
            </div>

          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
            <Button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending} className="bg-sky-600 hover:bg-sky-700">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmAction}
        onOpenChange={() => setConfirmAction(null)}
        title={confirmAction?.title}
        description={confirmAction?.desc}
        onConfirm={() => deleteMut.mutate(confirmAction.id)}
        destructive
      />
    </div>
  );
}
