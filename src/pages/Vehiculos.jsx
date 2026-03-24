import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Power, Trash2, Truck, Eye } from 'lucide-react';
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
  const [detailVehiculo, setDetailVehiculo] = useState(null);

  const movimientosUltimoMesByVehiculo = useMemo(() => {
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const sinceIso = since.toISOString().slice(0, 10);
    const map = new Map();

    vehiculos.forEach((v) => {
      const movs = movimientos
        .filter((m) => (m.vehiculo_chapa === v.chapa || m.vehiculo_origen_chapa === v.chapa) && (m.fecha || '') >= sinceIso)
        .sort((a, b) => `${b.fecha || ''}`.localeCompare(`${a.fecha || ''}`));

      const compras = movs.filter((m) => m.tipo === 'COMPRA' && m.vehiculo_chapa === v.chapa);
      const despachos = movs.filter((m) => m.tipo === 'DESPACHO' && (m.vehiculo_chapa === v.chapa || m.vehiculo_origen_chapa === v.chapa));
      const litrosComprados = compras.reduce((s, m) => s + Number(m.litros || 0), 0);
      const montoComprado = compras.reduce((s, m) => s + Number(m.monto || 0), 0);
      const litrosDespachados = despachos.reduce((s, m) => s + Number(m.litros || 0), 0);
      const comprasConOdo = compras.filter((m) => Number.isFinite(Number(m.odometro))).sort((a, b) => `${a.fecha || ''}`.localeCompare(`${b.fecha || ''}`));
      const kmRecorridos = comprasConOdo.length >= 2
        ? Number(comprasConOdo[comprasConOdo.length - 1].odometro) - Number(comprasConOdo[0].odometro)
        : 0;
      const kmPorLitro = litrosComprados > 0 && kmRecorridos > 0 ? kmRecorridos / litrosComprados : null;
      const costoPorKm = kmRecorridos > 0 ? montoComprado / kmRecorridos : null;

      map.set(v.chapa, {
        movs,
        compras: compras.length,
        despachos: despachos.length,
        litrosComprados,
        litrosDespachados,
        montoComprado,
        kmRecorridos,
        kmPorLitro,
        costoPorKm,
      });
    });

    return map;
  }, [movimientos, vehiculos]);

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
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDetailVehiculo(v)}><Eye className="w-3.5 h-3.5" /></Button>
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

      <Dialog open={!!detailVehiculo} onOpenChange={() => setDetailVehiculo(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Detalle de vehículo {detailVehiculo?.chapa}</DialogTitle>
          </DialogHeader>
          {detailVehiculo && (
            <div className="space-y-4">
              {(() => {
                const stats = movimientosUltimoMesByVehiculo.get(detailVehiculo.chapa) || { movs: [] };
                return (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <Card><CardContent className="p-3"><p className="text-slate-400">Compras (30d)</p><p className="font-semibold">{stats.compras || 0}</p></CardContent></Card>
                      <Card><CardContent className="p-3"><p className="text-slate-400">Despachos (30d)</p><p className="font-semibold">{stats.despachos || 0}</p></CardContent></Card>
                      <Card><CardContent className="p-3"><p className="text-slate-400">Km/L estimado</p><p className="font-semibold">{stats.kmPorLitro != null ? stats.kmPorLitro.toFixed(2) : '—'}</p></CardContent></Card>
                      <Card><CardContent className="p-3"><p className="text-slate-400">Costo/Km</p><p className="font-semibold">{stats.costoPorKm != null ? `$${stats.costoPorKm.toFixed(2)}` : '—'}</p></CardContent></Card>
                    </div>
                    <div className="overflow-auto border rounded-xl max-h-72">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 border-b">
                          <tr>
                            <th className="text-left px-3 py-2">Fecha</th>
                            <th className="text-left px-3 py-2">Tipo</th>
                            <th className="text-left px-3 py-2">Combustible</th>
                            <th className="text-right px-3 py-2">Litros</th>
                            <th className="text-right px-3 py-2">Monto</th>
                            <th className="text-right px-3 py-2">Odómetro</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stats.movs.map((m) => (
                            <tr key={m.id} className="border-b last:border-b-0">
                              <td className="px-3 py-2">{m.fecha}</td>
                              <td className="px-3 py-2">{m.tipo}</td>
                              <td className="px-3 py-2">{m.combustible_nombre || '—'}</td>
                              <td className="px-3 py-2 text-right">{m.litros ?? '—'}</td>
                              <td className="px-3 py-2 text-right">{m.monto ?? '—'}</td>
                              <td className="px-3 py-2 text-right">{m.odometro ?? '—'}</td>
                            </tr>
                          ))}
                          {stats.movs.length === 0 && (
                            <tr><td colSpan={6} className="text-center py-6 text-slate-400">Sin movimientos en los últimos 30 días</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
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
