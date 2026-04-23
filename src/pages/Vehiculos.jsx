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
import { toast } from "sonner";
import { Plus, Pencil, Power, Trash2, Truck } from 'lucide-react';
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
  const { data: movimientos = [] } = useQuery({ queryKey: ['movimientos'], queryFn: () => base44.entities.Movimiento.list('-created_date', 500) });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [mesFiltro, setMesFiltro] = useState('ALL');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [confirmAction, setConfirmAction] = useState(null);

  const opcionesMes = useMemo(() => getMonthOptionsFromMovimientos(movimientos), [movimientos]);

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

      <div className="grid gap-3">
        {vehiculos.map(v => {
          const stats = computeVehiculoMonthlyStats(v, movimientos, mesFiltro);
          const estadoColor = {
            'Operativo': 'bg-emerald-50 text-emerald-700 border-emerald-200',
            'En mantenimiento': 'bg-amber-50 text-amber-700 border-amber-200',
            'Fuera de servicio': 'bg-red-50 text-red-700 border-red-200',
            'Baja': 'bg-slate-100 text-slate-500 border-slate-200',
          }[v.estado_vehiculo] || 'bg-slate-100 text-slate-500 border-slate-200';
          return (
            <Card key={v.id} className={`border-0 shadow-sm ${!v.activa ? 'opacity-60' : ''}`}>
              <CardContent className="p-4 flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center shrink-0 mt-0.5">
                  <Truck className="w-5 h-5 text-violet-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-slate-800">{v.chapa}</span>
                    {v.alias && <span className="text-sm text-slate-500">{v.alias}</span>}
                    <StatusBadge active={v.activa} />
                    {v.estado_vehiculo && (
                      <Badge variant="outline" className={`text-[10px] ${estadoColor}`}>{v.estado_vehiculo}</Badge>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-400">
                    {(v.marca || v.modelo) && <span>{[v.marca, v.modelo, v.anio].filter(Boolean).join(' ')}</span>}
                    {v.tipo_vehiculo && <span>{v.tipo_vehiculo}</span>}
                    {v.combustible_nombre && <span>⛽ {v.combustible_nombre}</span>}
                    {v.capacidad_tanque && <span>🛢 {v.capacidad_tanque} L</span>}
                    {v.indice_consumo_real && <span>📊 {v.indice_consumo_real} km/L (real)</span>}
                    {v.conductor && <span>👤 {v.conductor}</span>}
                    {v.responsable && <span>🏷 {v.responsable}</span>}
                    {v.funcion && <span className="truncate max-w-xs">{v.funcion}</span>}
                  </div>
                  <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 text-[11px] text-slate-600">
                    <span><b>Litros del mes:</b> {stats.litrosMes ? `${stats.litrosMes.toFixed(1)} L` : 'Sin datos'}</span>
                    <span><b>Consumo del mes:</b> {stats.consumoMes ? stats.consumoMes.toFixed(2) : 'No disponible'}</span>
                    <span><b>Odómetro inicio:</b> {stats.odometroInicio != null ? `${stats.odometroInicio.toLocaleString()} km` : 'No disponible'}</span>
                    <span><b>Última carga:</b> {stats.ultimaCarga?.fecha || 'Sin datos'}</span>
                    <span><b>Fecha último abast.:</b> {stats.fechaUltimoAbastecimiento || 'Sin datos'}</span>
                    <span><b>Días desde abast.:</b> {stats.diasDesdeUltimoAbast != null ? `${stats.diasDesdeUltimoAbast} días` : 'Sin datos'}</span>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(v)}><Pencil className="w-3.5 h-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleActive(v)}><Power className={`w-3.5 h-3.5 ${v.activa ? 'text-emerald-500' : 'text-slate-300'}`} /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-red-500" onClick={() => handleDelete(v)}><Trash2 className="w-3.5 h-3.5" /></Button>
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
