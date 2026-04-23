import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Power, Trash2, User, AlertTriangle, CreditCard } from 'lucide-react';
import ConfirmDialog from '@/components/ui-helpers/ConfirmDialog';
import { computeChoferDelMes, getMonthOptionsFromMovimientos } from '@/lib/fuel-analytics';

const emptyForm = {
  nombre: '', ci: '', telefono: '', email: '',
  licencia_numero: '', licencia_categoria: '', licencia_vencimiento: '',
  vehiculo_asignado_id: '', vehiculo_asignado_chapa: '',
  area_centro: '', activo: true, observaciones: '',
};

function getLicenciaStatus(vencimiento) {
  if (!vencimiento) return null;
  const hoy = new Date();
  const vence = new Date(vencimiento);
  const diasRestantes = Math.floor((vence - hoy) / (1000 * 60 * 60 * 24));
  if (diasRestantes < 0) return { tipo: 'vencida', label: 'Vencida', dias: Math.abs(diasRestantes), color: 'bg-red-50 text-red-700 border-red-200' };
  if (diasRestantes <= 30) return { tipo: 'critico', label: `Vence en ${diasRestantes}d`, dias: diasRestantes, color: 'bg-red-50 text-red-700 border-red-200' };
  if (diasRestantes <= 90) return { tipo: 'alerta', label: `Vence en ${diasRestantes}d`, dias: diasRestantes, color: 'bg-amber-50 text-amber-700 border-amber-200' };
  return { tipo: 'ok', label: 'Vigente', dias: diasRestantes, color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
}

export default function Conductores() {
  const queryClient = useQueryClient();
  const { data: conductores = [] } = useQuery({ queryKey: ['conductores'], queryFn: () => base44.entities.Conductor.list() });
  const { data: vehiculos = [] } = useQuery({ queryKey: ['vehiculos'], queryFn: () => base44.entities.Vehiculo.list() });
  const { data: movimientos = [] } = useQuery({ queryKey: ['movimientos'], queryFn: () => base44.entities.Movimiento.list('-fecha', 1000) });
  const [mesFiltro, setMesFiltro] = useState('ALL');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [confirmAction, setConfirmAction] = useState(null);

  const vehiculosActivos = useMemo(() => vehiculos.filter(v => v.activa), [vehiculos]);
  const opcionesMes = useMemo(() => getMonthOptionsFromMovimientos(movimientos), [movimientos]);
  const choferDelMes = useMemo(
    () => computeChoferDelMes({ month: mesFiltro, movimientos, conductores }),
    [mesFiltro, movimientos, conductores],
  );

  const createMut = useMutation({
    mutationFn: (d) => base44.entities.Conductor.create(d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['conductores'] }); toast.success('Conductor creado'); closeDialog(); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, d }) => base44.entities.Conductor.update(id, d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['conductores'] }); toast.success('Conductor actualizado'); closeDialog(); },
  });
  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.Conductor.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['conductores'] }); toast.success('Conductor eliminado'); setConfirmAction(null); },
  });

  const closeDialog = () => { setDialogOpen(false); setEditing(null); setForm(emptyForm); };

  const openEdit = (c) => {
    setEditing(c);
    setForm({ ...emptyForm, ...c });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.nombre.trim()) { toast.error('Nombre requerido'); return; }
    const data = { ...form };
    // Sincronizar chapa al seleccionar vehículo
    if (data.vehiculo_asignado_id) {
      const v = vehiculos.find(v => v.id === data.vehiculo_asignado_id);
      data.vehiculo_asignado_chapa = v?.chapa || '';
    } else {
      data.vehiculo_asignado_chapa = '';
    }
    if (editing) {
      updateMut.mutate({ id: editing.id, d: data });
    } else {
      createMut.mutate(data);
    }
  };

  const toggleActive = (c) => updateMut.mutate({ id: c.id, d: { activo: !c.activo } });

  // Alertas de licencias
  const alertasLicencia = conductores.filter(c => {
    const s = getLicenciaStatus(c.licencia_vencimiento);
    return s && (s.tipo === 'vencida' || s.tipo === 'critico' || s.tipo === 'alerta');
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Conductores</h1>
          <p className="text-xs text-slate-400">{conductores.length} registrados</p>
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

      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <p className="text-[11px] text-slate-400 uppercase tracking-wide">Chofer del mes</p>
          {choferDelMes ? (
            <>
              <p className="text-lg font-bold text-slate-800">{choferDelMes.conductor.nombre}</p>
              <p className="text-xs text-slate-500">{choferDelMes.litros.toFixed(1)} L • {choferDelMes.movimientos} movimientos válidos</p>
            </>
          ) : (
            <p className="text-sm text-slate-400">Sin datos suficientes para cálculo en el período seleccionado.</p>
          )}
        </CardContent>
      </Card>

      {/* Alertas licencias */}
      {alertasLicencia.length > 0 && (
        <div className="space-y-2">
          {alertasLicencia.map(c => {
            const s = getLicenciaStatus(c.licencia_vencimiento);
            return (
              <div key={c.id} className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm border ${s.color}`}>
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span className="font-semibold">{c.nombre}</span>
                <span>— Licencia {s.tipo === 'vencida' ? `vencida hace ${s.dias} días` : `vence en ${s.dias} días`}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Lista de conductores */}
      <div className="grid gap-3">
        {conductores.map(c => {
          const licStatus = getLicenciaStatus(c.licencia_vencimiento);
          const veh = vehiculos.find(v => v.id === c.vehiculo_asignado_id);
          return (
            <Card key={c.id} className={`border-0 shadow-sm ${!c.activo ? 'opacity-60' : ''}`}>
              <CardContent className="p-4 flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center shrink-0 mt-0.5">
                  <User className="w-5 h-5 text-sky-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-slate-800">{c.nombre}</span>
                    <Badge variant="outline" className={`text-[10px] ${c.activo ? 'border-emerald-200 text-emerald-700' : 'border-slate-200 text-slate-400'}`}>
                      {c.activo ? 'Activo' : 'Inactivo'}
                    </Badge>
                    {licStatus && (
                      <Badge variant="outline" className={`text-[10px] ${licStatus.color}`}>
                        {licStatus.tipo !== 'ok' && <AlertTriangle className="w-2.5 h-2.5 mr-1" />}
                        Lic. {licStatus.label}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-400">
                    {c.ci && <span>CI: {c.ci}</span>}
                    {c.telefono && <span>📞 {c.telefono}</span>}
                    {c.licencia_numero && <span><CreditCard className="w-3 h-3 inline mr-0.5" />{c.licencia_numero} {c.licencia_categoria ? `(Cat. ${c.licencia_categoria})` : ''}</span>}
                    {(veh || c.vehiculo_asignado_chapa) && (
                      <span className="font-medium text-slate-600">🚗 {veh?.alias || c.vehiculo_asignado_chapa}</span>
                    )}
                    {c.area_centro && <span>{c.area_centro}</span>}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)}><Pencil className="w-3.5 h-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleActive(c)}><Power className={`w-3.5 h-3.5 ${c.activo ? 'text-emerald-500' : 'text-slate-300'}`} /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-red-500" onClick={() => setConfirmAction({ id: c.id, title: 'Eliminar conductor', desc: `¿Eliminar a "${c.nombre}"?` })}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {conductores.length === 0 && <p className="text-sm text-slate-400 text-center py-12">No hay conductores registrados</p>}
      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={closeDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Editar Conductor' : 'Nuevo Conductor'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">

            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Datos Personales</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label className="text-xs text-slate-500">Nombre completo *</Label>
                  <Input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Juan Pérez" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-slate-500">CI / Documento</Label>
                  <Input value={form.ci} onChange={e => setForm(f => ({ ...f, ci: e.target.value }))} placeholder="12345678" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-slate-500">Teléfono</Label>
                  <Input value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} placeholder="+53 5 000 0000" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-slate-500">Email</Label>
                  <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="conductor@empresa.cu" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-slate-500">Área/Centro</Label>
                  <Input value={form.area_centro} onChange={e => setForm(f => ({ ...f, area_centro: e.target.value }))} placeholder="Dpto. Transporte" className="mt-1" />
                </div>
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Licencia de Conducir</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-slate-500">Número de Licencia</Label>
                  <Input value={form.licencia_numero} onChange={e => setForm(f => ({ ...f, licencia_numero: e.target.value }))} placeholder="LIC-001234" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-slate-500">Categoría</Label>
                  <Input value={form.licencia_categoria} onChange={e => setForm(f => ({ ...f, licencia_categoria: e.target.value }))} placeholder="C, D, E..." className="mt-1" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-slate-500">Fecha de Vencimiento</Label>
                  <Input type="date" value={form.licencia_vencimiento} onChange={e => setForm(f => ({ ...f, licencia_vencimiento: e.target.value }))} className="mt-1" />
                  {form.licencia_vencimiento && (() => {
                    const s = getLicenciaStatus(form.licencia_vencimiento);
                    if (!s || s.tipo === 'ok') return null;
                    return (
                      <p className={`text-xs mt-1 flex items-center gap-1 ${s.tipo === 'vencida' || s.tipo === 'critico' ? 'text-red-500' : 'text-amber-500'}`}>
                        <AlertTriangle className="w-3 h-3" /> {s.tipo === 'vencida' ? `Licencia vencida hace ${s.dias} días` : `Vence en ${s.dias} días`}
                      </p>
                    );
                  })()}
                </div>
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Asignación de Vehículo</p>
              <div>
                <Label className="text-xs text-slate-500">Vehículo asignado</Label>
                <Select value={form.vehiculo_asignado_id || 'none'} onValueChange={v => setForm(f => ({ ...f, vehiculo_asignado_id: v === 'none' ? '' : v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Sin asignación" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin asignación</SelectItem>
                    {vehiculosActivos.map(v => (
                      <SelectItem key={v.id} value={v.id}>{v.chapa}{v.alias ? ` — ${v.alias}` : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs text-slate-500">Observaciones</Label>
              <Input value={form.observaciones} onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} placeholder="Notas adicionales..." className="mt-1" />
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
