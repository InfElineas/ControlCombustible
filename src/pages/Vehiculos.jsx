import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Power, Trash2, Truck } from 'lucide-react';
import StatusBadge from '@/components/ui-helpers/StatusBadge';
import ConfirmDialog from '@/components/ui-helpers/ConfirmDialog';

const emptyForm = { chapa: '', alias: '', area_centro: '', odometro_inicial: '', activa: true };

export default function Vehiculos() {
  const queryClient = useQueryClient();
  const { data: vehiculos = [] } = useQuery({ queryKey: ['vehiculos'], queryFn: () => base44.entities.Vehiculo.list() });
  const { data: movimientos = [] } = useQuery({ queryKey: ['movimientos'], queryFn: () => base44.entities.Movimiento.list('-created_date') });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [confirmAction, setConfirmAction] = useState(null);

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
      chapa: v.chapa,
      alias: v.alias || '',
      area_centro: v.area_centro || '',
      odometro_inicial: v.odometro_inicial ?? '',
      activa: v.activa,
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.chapa.trim()) { toast.error('Chapa/matrícula requerida'); return; }
    if (form.odometro_inicial !== '' && (Number.isNaN(Number(form.odometro_inicial)) || Number(form.odometro_inicial) < 0)) {
      toast.error('La lectura inicial de odómetro debe ser un número mayor o igual a 0');
      return;
    }
    if (!editing && vehiculos.some(v => v.chapa === form.chapa.trim())) {
      toast.error('Ya existe un vehículo con esa chapa'); return;
    }
    const payload = {
      ...form,
      odometro_inicial: form.odometro_inicial === '' ? 0 : Number(form.odometro_inicial),
    };
    if (editing) {
      updateMut.mutate({ id: editing.id, d: payload });
    } else {
      createMut.mutate(payload);
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
        <Button size="sm" className="gap-1.5 bg-sky-600 hover:bg-sky-700" onClick={() => { setForm(emptyForm); setEditing(null); setDialogOpen(true); }}>
          <Plus className="w-4 h-4" /> Nuevo
        </Button>
      </div>

      <div className="grid gap-3">
        {vehiculos.map(v => (
          <Card key={v.id} className={`border-0 shadow-sm ${!v.activa ? 'opacity-60' : ''}`}>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
                <Truck className="w-5 h-5 text-violet-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-700">{v.chapa}</span>
                  <StatusBadge active={v.activa} />
                </div>
                <p className="text-xs text-slate-400 truncate">
                  {v.alias || 'Sin alias'}
                  {v.area_centro ? ` · ${v.area_centro}` : ''}
                  {v.odometro_inicial != null ? ` · Odómetro inicial: ${v.odometro_inicial} km` : ''}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(v)}><Pencil className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleActive(v)}><Power className={`w-3.5 h-3.5 ${v.activa ? 'text-emerald-500' : 'text-slate-300'}`} /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-red-500" onClick={() => handleDelete(v)}><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {vehiculos.length === 0 && <p className="text-sm text-slate-400 text-center py-12">No hay vehículos</p>}
      </div>

      <Dialog open={dialogOpen} onOpenChange={closeDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Editar Vehículo' : 'Nuevo Vehículo'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs text-slate-500">Chapa/Matrícula *</Label>
              <Input value={form.chapa} onChange={e => setForm(f => ({ ...f, chapa: e.target.value }))} disabled={!!editing} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Alias</Label>
              <Input value={form.alias} onChange={e => setForm(f => ({ ...f, alias: e.target.value }))} placeholder="Ej: Fuso Refrigerado" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Área/Centro</Label>
              <Input value={form.area_centro} onChange={e => setForm(f => ({ ...f, area_centro: e.target.value }))} placeholder="Departamento o centro" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Lectura inicial de odómetro (km)</Label>
              <Input
                type="number"
                min="0"
                step="1"
                value={form.odometro_inicial}
                onChange={e => setForm(f => ({ ...f, odometro_inicial: e.target.value }))}
                placeholder="0"
                className="mt-1"
              />
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
