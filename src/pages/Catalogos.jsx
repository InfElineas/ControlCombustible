import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
// Vehiculo needed for conductor assignment dropdown
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Pencil, Power, Trash2, CreditCard, Fuel, DollarSign, UserCheck, AlertTriangle } from 'lucide-react';
import StatusBadge from '@/components/ui-helpers/StatusBadge';
import ConfirmDialog from '@/components/ui-helpers/ConfirmDialog';
import { calcularSaldo, formatMonto } from '@/components/ui-helpers/SaldoUtils';

// ─── TARJETAS ────────────────────────────────────────────────────────────────
const emptyTarjeta = { id_tarjeta: '', alias: '', moneda: 'CUP', saldo_inicial: 0, umbral_alerta: '', activa: true };

function TabTarjetas() {
  const queryClient = useQueryClient();
  const { data: tarjetas = [] } = useQuery({ queryKey: ['tarjetas'], queryFn: () => base44.entities.Tarjeta.list() });
  const { data: movimientos = [] } = useQuery({ queryKey: ['movimientos'], queryFn: () => base44.entities.Movimiento.list('-created_date', 500) });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyTarjeta);
  const [confirmAction, setConfirmAction] = useState(null);

  const createMut = useMutation({ mutationFn: (d) => base44.entities.Tarjeta.create(d), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tarjetas'] }); toast.success('Tarjeta creada'); closeDialog(); } });
  const updateMut = useMutation({ mutationFn: ({ id, d }) => base44.entities.Tarjeta.update(id, d), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tarjetas'] }); toast.success('Tarjeta actualizada'); closeDialog(); } });
  const deleteMut = useMutation({ mutationFn: (id) => base44.entities.Tarjeta.delete(id), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tarjetas'] }); toast.success('Tarjeta eliminada'); setConfirmAction(null); } });

  const closeDialog = () => { setDialogOpen(false); setEditing(null); setForm(emptyTarjeta); };
  const openEdit = (t) => { setEditing(t); setForm({ id_tarjeta: t.id_tarjeta, alias: t.alias || '', moneda: t.moneda, saldo_inicial: t.saldo_inicial, umbral_alerta: t.umbral_alerta ?? '', activa: t.activa }); setDialogOpen(true); };

  const handleSave = () => {
    if (!form.id_tarjeta.trim()) { toast.error('Número de tarjeta requerido'); return; }
    if (!editing && tarjetas.some(t => t.id_tarjeta === form.id_tarjeta.trim())) { toast.error('Ya existe una tarjeta con ese número'); return; }
    const data = { ...form, saldo_inicial: parseFloat(form.saldo_inicial) || 0, umbral_alerta: form.umbral_alerta !== '' ? parseFloat(form.umbral_alerta) : null };
    editing ? updateMut.mutate({ id: editing.id, d: data }) : createMut.mutate(data);
  };

  const handleDelete = (t) => {
    if (movimientos.some(m => m.tarjeta_id === t.id)) { toast.error('Tiene movimientos. Solo puede desactivarla.'); return; }
    setConfirmAction({ id: t.id, title: 'Eliminar tarjeta', desc: `¿Eliminar "${t.alias || t.id_tarjeta}"?` });
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" className="gap-1.5 bg-sky-600 hover:bg-sky-700" onClick={() => { setForm(emptyTarjeta); setEditing(null); setDialogOpen(true); }}>
          <Plus className="w-4 h-4" /> Nueva tarjeta
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
                  <p className={`text-sm font-bold ${saldo < 0 ? 'text-red-600' : 'text-slate-800'}`}>{formatMonto(saldo, t.moneda)}</p>
                  <p className="text-[10px] text-slate-400">Saldo</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(t)}><Pencil className="w-3.5 h-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => updateMut.mutate({ id: t.id, d: { activa: !t.activa } })}><Power className={`w-3.5 h-3.5 ${t.activa ? 'text-emerald-500' : 'text-slate-300'}`} /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-red-500" onClick={() => handleDelete(t)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {tarjetas.length === 0 && <p className="text-sm text-slate-400 text-center py-10">No hay tarjetas</p>}
      </div>

      <Dialog open={dialogOpen} onOpenChange={closeDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Editar Tarjeta' : 'Nueva Tarjeta'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label className="text-xs text-slate-500">Número de tarjeta *</Label><Input value={form.id_tarjeta} onChange={e => setForm(f => ({ ...f, id_tarjeta: e.target.value }))} disabled={!!editing} className="mt-1" /></div>
            <div><Label className="text-xs text-slate-500">Alias</Label><Input value={form.alias} onChange={e => setForm(f => ({ ...f, alias: e.target.value }))} placeholder="Nombre descriptivo" className="mt-1" /></div>
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
              <div><Label className="text-xs text-slate-500">Saldo inicial</Label><Input type="number" step="0.01" value={form.saldo_inicial} onChange={e => setForm(f => ({ ...f, saldo_inicial: e.target.value }))} className="mt-1" /></div>
            </div>
            <div><Label className="text-xs text-slate-500">Umbral alerta (opcional)</Label><Input type="number" step="0.01" value={form.umbral_alerta} onChange={e => setForm(f => ({ ...f, umbral_alerta: e.target.value }))} placeholder="Saldo mínimo" className="mt-1" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
            <Button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending} className="bg-sky-600 hover:bg-sky-700">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)} title={confirmAction?.title} description={confirmAction?.desc} onConfirm={() => deleteMut.mutate(confirmAction.id)} destructive />
    </div>
  );
}

// ─── COMBUSTIBLES ─────────────────────────────────────────────────────────────
function TabCombustibles() {
  const queryClient = useQueryClient();
  const { data: combustibles = [] } = useQuery({ queryKey: ['combustibles'], queryFn: () => base44.entities.TipoCombustible.list() });
  const { data: movimientos = [] } = useQuery({ queryKey: ['movimientos'], queryFn: () => base44.entities.Movimiento.list('-created_date', 500) });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [nombre, setNombre] = useState('');
  const [confirmAction, setConfirmAction] = useState(null);

  const createMut = useMutation({ mutationFn: (d) => base44.entities.TipoCombustible.create(d), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['combustibles'] }); toast.success('Combustible creado'); closeDialog(); } });
  const updateMut = useMutation({ mutationFn: ({ id, d }) => base44.entities.TipoCombustible.update(id, d), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['combustibles'] }); toast.success('Actualizado'); closeDialog(); } });
  const deleteMut = useMutation({ mutationFn: (id) => base44.entities.TipoCombustible.delete(id), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['combustibles'] }); toast.success('Eliminado'); setConfirmAction(null); } });

  const closeDialog = () => { setDialogOpen(false); setEditing(null); setNombre(''); };

  const handleSave = () => {
    if (!nombre.trim()) { toast.error('Nombre requerido'); return; }
    if (!editing && combustibles.some(c => c.nombre.toLowerCase() === nombre.trim().toLowerCase())) { toast.error('Ya existe'); return; }
    editing ? updateMut.mutate({ id: editing.id, d: { nombre: nombre.trim() } }) : createMut.mutate({ nombre: nombre.trim(), activa: true });
  };

  const handleDelete = (c) => {
    if (movimientos.some(m => m.combustible_id === c.id)) { toast.error('Tiene movimientos. Solo puede desactivarlo.'); return; }
    setConfirmAction({ id: c.id, title: 'Eliminar combustible', desc: `¿Eliminar "${c.nombre}"?` });
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" className="gap-1.5 bg-sky-600 hover:bg-sky-700" onClick={() => { setNombre(''); setEditing(null); setDialogOpen(true); }}>
          <Plus className="w-4 h-4" /> Nuevo combustible
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
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => updateMut.mutate({ id: c.id, d: { activa: !c.activa } })}><Power className={`w-3.5 h-3.5 ${c.activa ? 'text-emerald-500' : 'text-slate-300'}`} /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-red-500" onClick={() => handleDelete(c)}><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {combustibles.length === 0 && <p className="text-sm text-slate-400 text-center py-10">No hay combustibles</p>}
      </div>

      <Dialog open={dialogOpen} onOpenChange={closeDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editing ? 'Editar' : 'Nuevo'} Combustible</DialogTitle></DialogHeader>
          <div className="py-2"><Label className="text-xs text-slate-500">Nombre *</Label><Input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Diesel" className="mt-1" /></div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
            <Button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending} className="bg-sky-600 hover:bg-sky-700">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)} title={confirmAction?.title} description={confirmAction?.desc} onConfirm={() => deleteMut.mutate(confirmAction.id)} destructive />
    </div>
  );
}

// ─── PRECIOS ──────────────────────────────────────────────────────────────────
function TabPrecios() {
  const queryClient = useQueryClient();
  const { data: precios = [] } = useQuery({ queryKey: ['precios'], queryFn: () => base44.entities.PrecioCombustible.list('-fecha_desde', 200) });
  const { data: combustibles = [] } = useQuery({ queryKey: ['combustibles'], queryFn: () => base44.entities.TipoCombustible.list() });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ combustible_id: '', precio_por_litro: '', fecha_desde: new Date().toISOString().slice(0, 10) });
  const [deleteId, setDeleteId] = useState(null);

  const createMut = useMutation({ mutationFn: (d) => base44.entities.PrecioCombustible.create(d), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['precios'] }); toast.success('Precio registrado'); setDialogOpen(false); } });
  const deleteMut = useMutation({ mutationFn: (id) => base44.entities.PrecioCombustible.delete(id), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['precios'] }); toast.success('Eliminado'); setDeleteId(null); } });

  const handleSave = () => {
    if (!form.combustible_id) { toast.error('Seleccione combustible'); return; }
    if (!form.precio_por_litro || parseFloat(form.precio_por_litro) <= 0) { toast.error('Precio > 0'); return; }
    if (!form.fecha_desde) { toast.error('Fecha requerida'); return; }
    const comb = combustibles.find(c => c.id === form.combustible_id);
    createMut.mutate({ ...form, precio_por_litro: parseFloat(form.precio_por_litro), combustible_nombre: comb?.nombre || '' });
  };

  const grouped = {};
  precios.forEach(p => { const k = p.combustible_nombre || p.combustible_id; if (!grouped[k]) grouped[k] = []; grouped[k].push(p); });

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" className="gap-1.5 bg-sky-600 hover:bg-sky-700" onClick={() => { setForm({ combustible_id: '', precio_por_litro: '', fecha_desde: new Date().toISOString().slice(0, 10) }); setDialogOpen(true); }}>
          <Plus className="w-4 h-4" /> Nuevo precio
        </Button>
      </div>

      {Object.keys(grouped).length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-10">No hay precios registrados</p>
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
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-red-500" onClick={() => setDeleteId(p.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
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
                <SelectContent>{combustibles.filter(c => c.activa).map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs text-slate-500">Precio por litro *</Label><Input type="number" step="0.01" min="0.01" value={form.precio_por_litro} onChange={e => setForm(f => ({ ...f, precio_por_litro: e.target.value }))} className="mt-1" /></div>
            <div><Label className="text-xs text-slate-500">Fecha desde *</Label><Input type="date" value={form.fecha_desde} onChange={e => setForm(f => ({ ...f, fecha_desde: e.target.value }))} className="mt-1" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={createMut.isPending} className="bg-sky-600 hover:bg-sky-700">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)} title="Eliminar precio" description="¿Eliminar este registro de precio?" onConfirm={() => deleteMut.mutate(deleteId)} destructive />
    </div>
  );
}

// ─── CONDUCTORES (inline, movido desde su propia página) ─────────────────────
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

const emptyForm = {
  nombre: '', ci: '', telefono: '', email: '',
  licencia_numero: '', licencia_categoria: '', licencia_vencimiento: '',
  vehiculo_asignado_id: '', vehiculo_asignado_chapa: '',
  area_centro: '', activo: true, observaciones: '',
};

function TabConductores() {
  const queryClient = useQueryClient();
  const { data: conductores = [] } = useQuery({ queryKey: ['conductores'], queryFn: () => base44.entities.Conductor.list() });
  const { data: vehiculos = [] } = useQuery({ queryKey: ['vehiculos'], queryFn: () => base44.entities.Vehiculo.list() });
  const { data: movimientos = [] } = useQuery({ queryKey: ['movimientos'], queryFn: () => base44.entities.Movimiento.list('-fecha', 1000) });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [confirmAction, setConfirmAction] = useState(null);
  const [historialConductorId, setHistorialConductorId] = useState(null);

  const vehiculosActivos = vehiculos.filter(v => v.activa);

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
  const openEdit = (c) => { setEditing(c); setForm({ ...emptyForm, ...c }); setDialogOpen(true); };
  const toggleActive = (c) => updateMut.mutate({ id: c.id, d: { activo: !c.activo } });

  const handleSave = () => {
    if (!form.nombre.trim()) { toast.error('Nombre requerido'); return; }
    const data = { ...form };
    if (data.vehiculo_asignado_id) {
      const v = vehiculos.find(v => v.id === data.vehiculo_asignado_id);
      data.vehiculo_asignado_chapa = v?.chapa || '';
    } else {
      data.vehiculo_asignado_chapa = '';
    }
    editing ? updateMut.mutate({ id: editing.id, d: data }) : createMut.mutate(data);
  };

  const alertasLicencia = conductores.filter(c => {
    const s = getLicenciaStatus(c.licencia_vencimiento);
    return s && s.tipo !== 'ok';
  });

  // Historial del conductor: vehículos usados y km según odómetros
  const historialConductor = React.useMemo(() => {
    const c = conductores.find(c => c.id === historialConductorId);
    if (!c) return null;
    const vehActual = vehiculos.find(v => v.id === c.vehiculo_asignado_id);
    // Movimientos del vehículo actual con odómetro
    const movsVeh = vehActual
      ? movimientos
          .filter(m => m.tipo === 'COMPRA' && m.consumidor_id === vehActual.id && m.odometro != null)
          .sort((a, b) => b.odometro - a.odometro)
      : [];
    const maxOdometro = movsVeh[0]?.odometro ?? null;
    const minOdometro = movsVeh[movsVeh.length - 1]?.odometro ?? null;
    const kmRecorridos = (maxOdometro != null && minOdometro != null) ? maxOdometro - minOdometro : null;
    return { conductor: c, vehActual, movsVeh, maxOdometro, kmRecorridos };
  }, [historialConductorId, conductores, vehiculos, movimientos]);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" className="gap-1.5 bg-sky-600 hover:bg-sky-700" onClick={() => { setForm(emptyForm); setEditing(null); setDialogOpen(true); }}>
          <Plus className="w-4 h-4" /> Nuevo conductor
        </Button>
      </div>

      {alertasLicencia.length > 0 && (
        <div className="space-y-1.5">
          {alertasLicencia.map(c => {
            const s = getLicenciaStatus(c.licencia_vencimiento);
            return (
              <div key={c.id} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs border ${s.color}`}>
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span className="font-semibold">{c.nombre}</span>
                <span>— Licencia {s.tipo === 'vencida' ? `vencida hace ${s.dias} días` : `vence en ${s.dias} días`}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="grid gap-3">
        {conductores.map(c => {
          const licStatus = getLicenciaStatus(c.licencia_vencimiento);
          const veh = vehiculos.find(v => v.id === c.vehiculo_asignado_id);
          return (
            <Card key={c.id} className={`border-0 shadow-sm ${!c.activo ? 'opacity-60' : ''}`}>
              <CardContent className="p-4 flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-sky-50 flex items-center justify-center shrink-0 mt-0.5">
                  <UserCheck className="w-4.5 h-4.5 text-sky-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-slate-800">{c.nombre}</span>
                    <Badge variant="outline" className={`text-[10px] ${c.activo ? 'border-emerald-200 text-emerald-700' : 'border-slate-200 text-slate-400'}`}>
                      {c.activo ? 'Activo' : 'Inactivo'}
                    </Badge>
                    {licStatus && licStatus.tipo !== 'ok' && (
                      <Badge variant="outline" className={`text-[10px] ${licStatus.color}`}>
                        <AlertTriangle className="w-2.5 h-2.5 mr-1" /> Lic. {licStatus.label}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-400">
                    {c.ci && <span>CI: {c.ci}</span>}
                    {c.telefono && <span>📞 {c.telefono}</span>}
                    {c.licencia_numero && <span>Lic: {c.licencia_numero}{c.licencia_categoria ? ` (Cat. ${c.licencia_categoria})` : ''}</span>}
                    {(veh || c.vehiculo_asignado_chapa) && (
                      <span className="font-medium text-slate-600">🚗 {veh?.alias || veh?.chapa || c.vehiculo_asignado_chapa}</span>
                    )}
                    {c.area_centro && <span>{c.area_centro}</span>}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="Ver historial" onClick={() => setHistorialConductorId(c.id)}>
                    <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}><Pencil className="w-3.5 h-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleActive(c)}><Power className={`w-3.5 h-3.5 ${c.activo ? 'text-emerald-500' : 'text-slate-300'}`} /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-300 hover:text-red-500" onClick={() => setConfirmAction({ id: c.id, title: 'Eliminar conductor', desc: `¿Eliminar a "${c.nombre}"?` })}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {conductores.length === 0 && <p className="text-sm text-slate-400 text-center py-10">No hay conductores registrados</p>}
      </div>

      {/* Dialog alta/edición */}
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
                <div><Label className="text-xs text-slate-500">CI / Documento</Label><Input value={form.ci} onChange={e => setForm(f => ({ ...f, ci: e.target.value }))} className="mt-1" /></div>
                <div><Label className="text-xs text-slate-500">Teléfono</Label><Input value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} className="mt-1" /></div>
                <div><Label className="text-xs text-slate-500">Email</Label><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="mt-1" /></div>
                <div><Label className="text-xs text-slate-500">Área/Centro</Label><Input value={form.area_centro} onChange={e => setForm(f => ({ ...f, area_centro: e.target.value }))} className="mt-1" /></div>
              </div>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Licencia de Conducir</p>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs text-slate-500">Número</Label><Input value={form.licencia_numero} onChange={e => setForm(f => ({ ...f, licencia_numero: e.target.value }))} className="mt-1" /></div>
                <div><Label className="text-xs text-slate-500">Categoría</Label><Input value={form.licencia_categoria} onChange={e => setForm(f => ({ ...f, licencia_categoria: e.target.value }))} placeholder="C, D..." className="mt-1" /></div>
                <div className="col-span-2">
                  <Label className="text-xs text-slate-500">Fecha Vencimiento</Label>
                  <Input type="date" value={form.licencia_vencimiento} onChange={e => setForm(f => ({ ...f, licencia_vencimiento: e.target.value }))} className="mt-1" />
                </div>
              </div>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Vehículo Asignado</p>
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
            <div>
              <Label className="text-xs text-slate-500">Observaciones</Label>
              <Input value={form.observaciones} onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} placeholder="Notas..." className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
            <Button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending} className="bg-sky-600 hover:bg-sky-700">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal historial del conductor */}
      <Dialog open={!!historialConductorId} onOpenChange={() => setHistorialConductorId(null)}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Ficha del Conductor</DialogTitle></DialogHeader>
          {historialConductor && (
            <div className="space-y-4 mt-2">
              <div>
                <p className="text-sm font-bold text-slate-800">{historialConductor.conductor.nombre}</p>
                {historialConductor.conductor.ci && <p className="text-xs text-slate-400">CI: {historialConductor.conductor.ci}</p>}
              </div>
              {/* Vehículo actual */}
              <div className="bg-sky-50 rounded-xl p-3">
                <p className="text-[10px] font-semibold text-sky-500 uppercase mb-1">Vehículo actual</p>
                {historialConductor.vehActual ? (
                  <>
                    <p className="text-sm font-semibold text-slate-700">
                      {historialConductor.vehActual.chapa}{historialConductor.vehActual.alias ? ` — ${historialConductor.vehActual.alias}` : ''}
                    </p>
                    <p className="text-xs text-slate-400">{historialConductor.vehActual.marca} {historialConductor.vehActual.modelo}</p>
                    {historialConductor.maxOdometro != null && (
                      <p className="text-xs text-slate-600 mt-1">Odómetro registrado: <b>{historialConductor.maxOdometro.toLocaleString()} km</b></p>
                    )}
                    {historialConductor.kmRecorridos != null && (
                      <p className="text-xs text-sky-700 font-semibold">Km recorridos (histórico): {historialConductor.kmRecorridos.toLocaleString()} km</p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-slate-400">Sin vehículo asignado</p>
                )}
              </div>
              {/* Historial de cargas */}
              {historialConductor.movsVeh.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase mb-2">Historial de cargas (vehículo actual)</p>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {historialConductor.movsVeh.slice(0, 20).map(m => (
                      <div key={m.id} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-50 last:border-0">
                        <span className="text-slate-500">{m.fecha}</span>
                        <span className="font-medium text-slate-700">{m.litros != null ? `${Number(m.litros).toFixed(1)} L` : '—'}</span>
                        <span className="text-slate-400">{m.odometro?.toLocaleString()} km</span>
                        {m.consumo_real != null && <span className="text-sky-600 font-medium">{m.consumo_real.toFixed(2)} km/L</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)} title={confirmAction?.title} description={confirmAction?.desc} onConfirm={() => deleteMut.mutate(confirmAction.id)} destructive />
    </div>
  );
}

// ─── PAGE ─────────────────────────────────────────────────────────────────────
export default function Catalogos() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Catálogos</h1>
        <p className="text-xs text-slate-400">Datos base del sistema: tarjetas, combustibles, precios y conductores</p>
      </div>
      <Tabs defaultValue="tarjetas">
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="tarjetas" className="gap-1 text-xs"><CreditCard className="w-3.5 h-3.5" /> Tarjetas</TabsTrigger>
          <TabsTrigger value="combustibles" className="gap-1 text-xs"><Fuel className="w-3.5 h-3.5" /> Combustibles</TabsTrigger>
          <TabsTrigger value="precios" className="gap-1 text-xs"><DollarSign className="w-3.5 h-3.5" /> Precios</TabsTrigger>
          <TabsTrigger value="conductores" className="gap-1 text-xs"><UserCheck className="w-3.5 h-3.5" /> Conductores</TabsTrigger>
        </TabsList>
        <TabsContent value="tarjetas" className="mt-4"><TabTarjetas /></TabsContent>
        <TabsContent value="combustibles" className="mt-4"><TabCombustibles /></TabsContent>
        <TabsContent value="precios" className="mt-4"><TabPrecios /></TabsContent>
        <TabsContent value="conductores" className="mt-4"><TabConductores /></TabsContent>
      </Tabs>
    </div>
  );
}