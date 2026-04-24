import React, { useState } from 'react';
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
import { Plus, Trash2, DollarSign } from 'lucide-react';
import { formatMonto } from '@/components/ui-helpers/SaldoUtils';
import ConfirmDialog from '@/components/ui-helpers/ConfirmDialog';

export default function Precios() {
  const queryClient = useQueryClient();
  const { data: precios = [] } = useQuery({ queryKey: ['precios'], queryFn: () => base44.entities.PrecioCombustible.list('-fecha_desde', 200) });
  const { data: combustibles = [] } = useQuery({ queryKey: ['combustibles'], queryFn: () => base44.entities.TipoCombustible.list() });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ combustible_id: '', precio_por_litro: '', fecha_desde: new Date().toISOString().slice(0, 10) });
  const [deleteId, setDeleteId] = useState(null);

  const createMut = useMutation({
    mutationFn: (d) => base44.entities.PrecioCombustible.create(d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['precios'] }); toast.success('Precio registrado'); setDialogOpen(false); },
  });
  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.PrecioCombustible.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['precios'] }); toast.success('Eliminado'); setDeleteId(null); },
  });

  const handleSave = () => {
    if (!form.combustible_id) { toast.error('Seleccione combustible'); return; }
    if (!form.precio_por_litro || parseFloat(form.precio_por_litro) <= 0) { toast.error('Precio > 0'); return; }
    if (!form.fecha_desde) { toast.error('Fecha requerida'); return; }
    const comb = combustibles.find(c => c.id === form.combustible_id);
    createMut.mutate({
      ...form,
      precio_por_litro: parseFloat(form.precio_por_litro),
      combustible_nombre: comb?.nombre || '',
    });
  };

  // Agrupar por combustible
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const nombreCombustible = (precio) => {
    const combById = combustibles.find(c => c.id === precio.combustible_id);
    if (combById?.nombre) return combById.nombre;

    if (precio.combustible_nombre) {
      const nombreNormalizado = String(precio.combustible_nombre).trim();
      const combByNombre = combustibles.find(c => c.nombre?.toLowerCase() === nombreNormalizado.toLowerCase());
      if (combByNombre?.nombre) return combByNombre.nombre;
      if (!UUID_RE.test(nombreNormalizado)) return nombreNormalizado;
    }

    const combPorNombreComoId = combustibles.find(c => c.id === precio.combustible_nombre);
    return combPorNombreComoId?.nombre || precio.combustible_id || 'Sin combustible';
  };

  const grouped = {};
  precios.forEach(p => {
    const key = nombreCombustible(p);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(p);
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Precios</h1>
          <p className="text-sm text-slate-400">Historial de precios por combustible</p>
        </div>
        <Button size="sm" className="gap-1.5 bg-sky-600 hover:bg-sky-700" onClick={() => { setForm({ combustible_id: '', precio_por_litro: '', fecha_desde: new Date().toISOString().slice(0, 10) }); setDialogOpen(true); }}>
          <Plus className="w-4 h-4" /> Nuevo precio
        </Button>
      </div>

      {Object.keys(grouped).length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-12">No hay precios registrados</p>
      ) : (
        Object.entries(grouped).map(([nombre, items]) => (
          <Card key={nombre} className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <DollarSign className="w-4 h-4 text-emerald-500" />
                <span className="text-sm font-semibold text-slate-700">{nombre}</span>
                <Badge variant="outline" className="text-xs">{items.length} precios</Badge>
              </div>
              <div className="space-y-2">
                {items.sort((a, b) => b.fecha_desde.localeCompare(a.fecha_desde)).map((p, i) => (
                  <div key={p.id} className={`flex items-center justify-between py-2 ${i > 0 ? 'border-t border-slate-50' : ''}`}>
                    <div>
                      <span className="text-sm font-medium text-slate-700">{formatMonto(p.precio_por_litro)}/L</span>
                      <span className="text-xs text-slate-400 ml-2">desde {p.fecha_desde}</span>
                      {i === 0 && <Badge className="ml-2 bg-emerald-50 text-emerald-700 text-[10px]">Vigente</Badge>}
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-red-500" onClick={() => setDeleteId(p.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Nuevo Precio</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs text-slate-500">Combustible *</Label>
              <Select value={form.combustible_id} onValueChange={v => setForm(f => ({ ...f, combustible_id: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  {combustibles.filter(c => c.activa).map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Precio por litro *</Label>
              <Input type="number" step="0.01" min="0.01" value={form.precio_por_litro} onChange={e => setForm(f => ({ ...f, precio_por_litro: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Fecha desde *</Label>
              <Input type="date" value={form.fecha_desde} onChange={e => setForm(f => ({ ...f, fecha_desde: e.target.value }))} className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={createMut.isPending} className="bg-sky-600 hover:bg-sky-700">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title="Eliminar precio"
        description="¿Eliminar este registro de precio?"
        onConfirm={() => deleteMut.mutate(deleteId)}
        destructive
      />
    </div>
  );
}
