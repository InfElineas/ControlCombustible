import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Power, Trash2, CreditCard } from 'lucide-react';
import StatusBadge from '@/components/ui-helpers/StatusBadge';
import ConfirmDialog from '@/components/ui-helpers/ConfirmDialog';
import { calcularSaldo, formatMonto } from '@/components/ui-helpers/SaldoUtils';

const emptyForm = { id_tarjeta: '', alias: '', moneda: 'CUP', saldo_inicial: 0, umbral_alerta: '', activa: true };

export default function Tarjetas() {
  const queryClient = useQueryClient();
  const { data: tarjetas = [] } = useQuery({ queryKey: ['tarjetas'], queryFn: () => base44.entities.Tarjeta.list() });
  const { data: movimientos = [] } = useQuery({ queryKey: ['movimientos'], queryFn: () => base44.entities.Movimiento.list('-created_date') });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [confirmAction, setConfirmAction] = useState(null);

  const createMut = useMutation({
    mutationFn: (d) => base44.entities.Tarjeta.create(d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tarjetas'] }); toast.success('Tarjeta creada'); closeDialog(); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, d }) => base44.entities.Tarjeta.update(id, d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tarjetas'] }); toast.success('Tarjeta actualizada'); closeDialog(); },
  });
  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.Tarjeta.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tarjetas'] }); toast.success('Tarjeta eliminada'); setConfirmAction(null); },
  });

  const closeDialog = () => { setDialogOpen(false); setEditing(null); setForm(emptyForm); };

  const openEdit = (t) => {
    setEditing(t);
    setForm({ id_tarjeta: t.id_tarjeta, alias: t.alias || '', moneda: t.moneda, saldo_inicial: t.saldo_inicial, umbral_alerta: t.umbral_alerta ?? '', activa: t.activa });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.id_tarjeta.trim()) { toast.error('Número de tarjeta requerido'); return; }
    if (!editing && tarjetas.some(t => t.id_tarjeta === form.id_tarjeta.trim())) {
      toast.error('Ya existe una tarjeta con ese número'); return;
    }
    const data = { ...form, saldo_inicial: parseFloat(form.saldo_inicial) || 0, umbral_alerta: form.umbral_alerta !== '' ? parseFloat(form.umbral_alerta) : null };
    if (editing) {
      updateMut.mutate({ id: editing.id, d: data });
    } else {
      createMut.mutate(data);
    }
  };

  const handleDelete = (t) => {
    const tieneMovs = movimientos.some(m => m.tarjeta_id === t.id);
    if (tieneMovs) {
      toast.error('Tiene movimientos. Solo puede desactivarla.'); return;
    }
    setConfirmAction({ id: t.id, title: 'Eliminar tarjeta', desc: `¿Eliminar "${t.alias || t.id_tarjeta}"?` });
  };

  const toggleActive = (t) => {
    updateMut.mutate({ id: t.id, d: { activa: !t.activa } });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Tarjetas</h1>
          <p className="text-sm text-slate-400">{tarjetas.length} registradas</p>
        </div>
        <Button size="sm" className="gap-1.5 bg-sky-600 hover:bg-sky-700" onClick={() => { setForm(emptyForm); setEditing(null); setDialogOpen(true); }}>
          <Plus className="w-4 h-4" /> Nueva
        </Button>
      </div>

      <div className="grid gap-3">
        {tarjetas.map(t => {
          const saldo = calcularSaldo(t, movimientos);
          return (
            <Card key={t.id} className={`border-0 shadow-sm ${!t.activa ? 'opacity-60' : ''}`}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center shrink-0">
                  <CreditCard className="w-5 h-5 text-sky-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-700 truncate">{t.alias || t.id_tarjeta}</span>
                    <StatusBadge active={t.activa} />
                  </div>
                  <p className="text-xs text-slate-400 truncate">{t.id_tarjeta} · {t.moneda}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-bold ${saldo < 0 ? 'text-red-600' : 'text-slate-800'}`}>
                    {formatMonto(saldo, t.moneda)}
                  </p>
                  <p className="text-[10px] text-slate-400">Saldo</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(t)}><Pencil className="w-3.5 h-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleActive(t)}><Power className={`w-3.5 h-3.5 ${t.activa ? 'text-emerald-500' : 'text-slate-300'}`} /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-red-500" onClick={() => handleDelete(t)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {tarjetas.length === 0 && <p className="text-sm text-slate-400 text-center py-12">No hay tarjetas</p>}
      </div>

      <Dialog open={dialogOpen} onOpenChange={closeDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Editar Tarjeta' : 'Nueva Tarjeta'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs text-slate-500">Número de tarjeta *</Label>
              <Input value={form.id_tarjeta} onChange={e => setForm(f => ({ ...f, id_tarjeta: e.target.value }))} disabled={!!editing} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Alias</Label>
              <Input value={form.alias} onChange={e => setForm(f => ({ ...f, alias: e.target.value }))} placeholder="Nombre descriptivo" className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-slate-500">Moneda</Label>
                <Select value={form.moneda} onValueChange={v => setForm(f => ({ ...f, moneda: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CUP">CUP</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="MLC">MLC</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-500">Saldo inicial</Label>
                <Input type="number" step="0.01" value={form.saldo_inicial} onChange={e => setForm(f => ({ ...f, saldo_inicial: e.target.value }))} className="mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Umbral alerta (opcional)</Label>
              <Input type="number" step="0.01" value={form.umbral_alerta} onChange={e => setForm(f => ({ ...f, umbral_alerta: e.target.value }))} placeholder="Saldo mínimo" className="mt-1" />
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