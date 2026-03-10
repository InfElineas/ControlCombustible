import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Power, Trash2, Fuel } from 'lucide-react';
import StatusBadge from '@/components/ui-helpers/StatusBadge';
import ConfirmDialog from '@/components/ui-helpers/ConfirmDialog';

export default function Combustibles() {
  const queryClient = useQueryClient();
  const { data: combustibles = [] } = useQuery({ queryKey: ['combustibles'], queryFn: () => base44.entities.TipoCombustible.list() });
  const { data: movimientos = [] } = useQuery({ queryKey: ['movimientos'], queryFn: () => base44.entities.Movimiento.list('-created_date') });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [nombre, setNombre] = useState('');
  const [confirmAction, setConfirmAction] = useState(null);

  const createMut = useMutation({
    mutationFn: (d) => base44.entities.TipoCombustible.create(d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['combustibles'] }); toast.success('Combustible creado'); closeDialog(); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, d }) => base44.entities.TipoCombustible.update(id, d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['combustibles'] }); toast.success('Actualizado'); closeDialog(); },
  });
  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.TipoCombustible.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['combustibles'] }); toast.success('Eliminado'); setConfirmAction(null); },
  });

  const closeDialog = () => { setDialogOpen(false); setEditing(null); setNombre(''); };

  const handleSave = () => {
    if (!nombre.trim()) { toast.error('Nombre requerido'); return; }
    if (!editing && combustibles.some(c => c.nombre.toLowerCase() === nombre.trim().toLowerCase())) {
      toast.error('Ya existe'); return;
    }
    if (editing) {
      updateMut.mutate({ id: editing.id, d: { nombre: nombre.trim() } });
    } else {
      createMut.mutate({ nombre: nombre.trim(), activa: true });
    }
  };

  const handleDelete = (c) => {
    const tieneMovs = movimientos.some(m => m.combustible_id === c.id);
    if (tieneMovs) { toast.error('Tiene movimientos. Solo puede desactivarlo.'); return; }
    setConfirmAction({ id: c.id, title: 'Eliminar combustible', desc: `¿Eliminar "${c.nombre}"?` });
  };

  const toggleActive = (c) => updateMut.mutate({ id: c.id, d: { activa: !c.activa } });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Tipos de Combustible</h1>
          <p className="text-sm text-slate-400">{combustibles.length} registrados</p>
        </div>
        <Button size="sm" className="gap-1.5 bg-sky-600 hover:bg-sky-700" onClick={() => { setNombre(''); setEditing(null); setDialogOpen(true); }}>
          <Plus className="w-4 h-4" /> Nuevo
        </Button>
      </div>

      <div className="grid gap-3">
        {combustibles.map(c => (
          <Card key={c.id} className={`border-0 shadow-sm ${!c.activa ? 'opacity-60' : ''}`}>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                <Fuel className="w-5 h-5 text-amber-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-700">{c.nombre}</span>
                  <StatusBadge active={c.activa} />
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(c); setNombre(c.nombre); setDialogOpen(true); }}><Pencil className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleActive(c)}><Power className={`w-3.5 h-3.5 ${c.activa ? 'text-emerald-500' : 'text-slate-300'}`} /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-red-500" onClick={() => handleDelete(c)}><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {combustibles.length === 0 && <p className="text-sm text-slate-400 text-center py-12">No hay combustibles</p>}
      </div>

      <Dialog open={dialogOpen} onOpenChange={closeDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editing ? 'Editar' : 'Nuevo'} Combustible</DialogTitle></DialogHeader>
          <div className="py-2">
            <Label className="text-xs text-slate-500">Nombre *</Label>
            <Input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Diesel" className="mt-1" />
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