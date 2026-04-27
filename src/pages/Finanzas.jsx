import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { useUserRole } from '@/components/ui-helpers/useUserRole';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { calcularSaldo, formatMonto } from '@/components/ui-helpers/SaldoUtils';
import {
  CreditCard, TrendingUp, AlertTriangle, Plus, Pencil, Trash2,
  RefreshCw, DollarSign, Fuel, ChevronDown, ChevronUp, Loader2,
  WalletCards,
} from 'lucide-react';

// ── helpers ─────────────────────────────────────────────────────────────────

const MONEDAS = ['USD', 'CUP', 'MLC', 'EUR'];

function emptyTarjeta() {
  return { id_tarjeta: '', alias: '', moneda: 'USD', saldo_inicial: 0, umbral_alerta: null, activa: true };
}

function emptyPrecio() {
  return { combustible_id: '', precio_por_litro: '', fecha_desde: new Date().toISOString().slice(0, 10), fecha_hasta: '' };
}

function SaldoBadge({ saldo, umbral }) {
  const alerta = umbral != null && saldo <= umbral;
  if (alerta) {
    return (
      <span className="inline-flex items-center gap-1 text-amber-700 font-semibold text-sm">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
        {formatMonto(saldo)}
      </span>
    );
  }
  return (
    <span className={`text-sm font-semibold ${saldo < 0 ? 'text-red-600' : 'text-slate-800'}`}>
      {formatMonto(saldo)}
    </span>
  );
}

// ── Tab Tarjetas ─────────────────────────────────────────────────────────────

function TarjetasTab({ canManageFinanzas, canDelete }) {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState(null); // null | { mode: 'create'|'edit'|'recargar', data }
  const [form, setForm] = useState(emptyTarjeta());
  const [recargaForm, setRecargaForm] = useState({ monto: '', fecha: new Date().toISOString().slice(0, 10), referencia: '' });
  const [expandedId, setExpandedId] = useState(null);

  const { data: tarjetas = [] } = useQuery({ queryKey: ['tarjetas'], queryFn: () => base44.entities.Tarjeta.list() });
  const { data: movimientos = [] } = useQuery({ queryKey: ['movimientos'], queryFn: () => base44.entities.Movimiento.list('-fecha', 2000) });

  const tarjetasConSaldo = useMemo(() =>
    tarjetas.map(t => ({ ...t, saldoActual: calcularSaldo(t, movimientos) }))
      .sort((a, b) => (a.alias || a.id_tarjeta).localeCompare(b.alias || b.id_tarjeta)),
    [tarjetas, movimientos]
  );

  const totales = useMemo(() => ({
    activas: tarjetasConSaldo.filter(t => t.activa !== false).length,
    saldo: tarjetasConSaldo.filter(t => t.activa !== false).reduce((s, t) => s + t.saldoActual, 0),
    alertas: tarjetasConSaldo.filter(t => t.umbral_alerta != null && t.saldoActual <= t.umbral_alerta).length,
  }), [tarjetasConSaldo]);

  const saveMut = useMutation({
    mutationFn: async (data) => {
      if (dialog?.mode === 'edit') {
        const { error } = await supabase.from('tarjeta').update(data).eq('id', dialog.data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('tarjeta').insert(data);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tarjetas'] });
      toast.success(dialog?.mode === 'edit' ? 'Tarjeta actualizada' : 'Tarjeta creada');
      setDialog(null);
    },
    onError: () => toast.error('Error al guardar tarjeta'),
  });

  const deleteMut = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('tarjeta').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tarjetas'] }); toast.success('Tarjeta eliminada'); },
    onError: () => toast.error('Error al eliminar'),
  });

  const recargaMut = useMutation({
    mutationFn: async ({ tarjeta, monto, fecha, referencia }) => {
      const { error } = await supabase.from('movimiento').insert({
        fecha,
        tipo: 'RECARGA',
        tarjeta_id: tarjeta.id,
        tarjeta_alias: tarjeta.alias || tarjeta.id_tarjeta,
        monto: parseFloat(monto),
        referencia: referencia || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['movimientos'] });
      qc.invalidateQueries({ queryKey: ['tarjetas'] });
      toast.success('Recarga registrada');
      setDialog(null);
    },
    onError: () => toast.error('Error al registrar la recarga'),
  });

  function openCreate() {
    setForm(emptyTarjeta());
    setDialog({ mode: 'create' });
  }

  function openEdit(t) {
    setForm({ id_tarjeta: t.id_tarjeta, alias: t.alias || '', moneda: t.moneda || 'USD', saldo_inicial: t.saldo_inicial || 0, umbral_alerta: t.umbral_alerta ?? '', activa: t.activa !== false });
    setDialog({ mode: 'edit', data: t });
  }

  function openRecargar(t) {
    setRecargaForm({ monto: '', fecha: new Date().toISOString().slice(0, 10), referencia: '' });
    setDialog({ mode: 'recargar', data: t });
  }

  function handleSave() {
    if (!form.id_tarjeta.trim()) { toast.error('El número/código de tarjeta es requerido'); return; }
    if (!form.alias.trim()) { toast.error('El alias es requerido'); return; }
    const payload = {
      id_tarjeta: form.id_tarjeta.trim(),
      alias: form.alias.trim(),
      moneda: form.moneda,
      saldo_inicial: parseFloat(form.saldo_inicial) || 0,
      umbral_alerta: form.umbral_alerta !== '' && form.umbral_alerta != null ? parseFloat(form.umbral_alerta) : null,
      activa: form.activa,
    };
    saveMut.mutate(payload);
  }

  function handleRecargar() {
    const monto = parseFloat(recargaForm.monto);
    if (!recargaForm.monto || isNaN(monto) || monto <= 0) { toast.error('El monto debe ser mayor a 0'); return; }
    if (!recargaForm.fecha) { toast.error('La fecha es requerida'); return; }
    recargaMut.mutate({ tarjeta: dialog.data, monto, fecha: recargaForm.fecha, referencia: recargaForm.referencia });
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Tarjetas activas', value: totales.activas, icon: CreditCard, color: 'text-sky-600 bg-sky-50' },
          { label: 'Saldo total',      value: formatMonto(totales.saldo), icon: DollarSign, color: 'text-emerald-600 bg-emerald-50' },
          { label: 'En alerta',        value: totales.alertas, icon: AlertTriangle, color: totales.alertas > 0 ? 'text-amber-600 bg-amber-50' : 'text-slate-400 bg-slate-50' },
        ].map(k => (
          <Card key={k.label} className="border-0 shadow-sm">
            <CardContent className="p-3 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${k.color}`}>
                <k.icon className="w-4.5 h-4.5 w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wide leading-tight">{k.label}</p>
                <p className="text-sm font-bold text-slate-800 leading-tight">{k.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Lista */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-700">
            {tarjetasConSaldo.length} tarjeta{tarjetasConSaldo.length !== 1 ? 's' : ''}
          </CardTitle>
          {canManageFinanzas && (
            <Button size="sm" onClick={openCreate} className="h-7 text-xs gap-1.5 bg-sky-600 hover:bg-sky-700">
              <Plus className="w-3.5 h-3.5" /> Nueva tarjeta
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-slate-100">
            {tarjetasConSaldo.map(t => {
              const isExpanded = expandedId === t.id;
              const movsTarjeta = movimientos.filter(m => m.tarjeta_id === t.id).slice(0, 5);
              return (
                <div key={t.id}>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${t.activa !== false ? 'bg-sky-100' : 'bg-slate-100'}`}>
                      <CreditCard className={`w-4 h-4 ${t.activa !== false ? 'text-sky-600' : 'text-slate-400'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-slate-800 truncate">{t.alias || t.id_tarjeta}</span>
                        <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{t.id_tarjeta}</span>
                        <Badge variant="outline" className="text-[10px] py-0 px-1.5">{t.moneda}</Badge>
                        {t.activa === false && <Badge variant="outline" className="text-[10px] py-0 px-1.5 text-slate-400">Inactiva</Badge>}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <SaldoBadge saldo={t.saldoActual} umbral={t.umbral_alerta} />
                        {t.umbral_alerta != null && (
                          <span className="text-[10px] text-slate-400">Umbral: {formatMonto(t.umbral_alerta)}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {canManageFinanzas && (
                        <Button
                          size="sm" variant="outline"
                          className="h-7 text-xs gap-1 border-emerald-200 text-emerald-700 hover:bg-emerald-50 px-2.5"
                          onClick={() => openRecargar(t)}
                        >
                          <RefreshCw className="w-3 h-3" /> Recargar
                        </Button>
                      )}
                      {canManageFinanzas && (
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(t)}>
                          <Pencil className="w-3 h-3 text-slate-400" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteMut.mutate(t.id)}>
                          <Trash2 className="w-3 h-3 text-slate-400 hover:text-red-500" />
                        </Button>
                      )}
                      <Button
                        size="icon" variant="ghost" className="h-7 w-7"
                        onClick={() => setExpandedId(isExpanded ? null : t.id)}
                      >
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                      </Button>
                    </div>
                  </div>

                  {/* Últimos movimientos expandidos */}
                  {isExpanded && (
                    <div className="bg-slate-50/60 border-t border-slate-100 px-4 py-3">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-2">Últimos movimientos</p>
                      {movsTarjeta.length === 0 ? (
                        <p className="text-xs text-slate-400">Sin movimientos registrados</p>
                      ) : (
                        <div className="space-y-1.5">
                          {movsTarjeta.map(m => (
                            <div key={m.id} className="flex items-center gap-3 text-xs">
                              <span className="text-slate-400 tabular-nums w-20 shrink-0">{m.fecha}</span>
                              <Badge variant="outline" className={`text-[10px] py-0 px-1.5 shrink-0 ${
                                m.tipo === 'RECARGA' ? 'border-emerald-200 text-emerald-700' :
                                m.tipo === 'COMPRA'  ? 'border-orange-200 text-orange-700' :
                                'border-purple-200 text-purple-700'
                              }`}>{m.tipo}</Badge>
                              <span className={`font-medium ml-auto tabular-nums ${m.tipo === 'RECARGA' ? 'text-emerald-600' : 'text-orange-600'}`}>
                                {m.tipo === 'RECARGA' ? '+' : '-'}{formatMonto(m.monto)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {tarjetasConSaldo.length === 0 && (
              <div className="py-12 text-center text-sm text-slate-400">No hay tarjetas registradas</div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Dialog crear/editar tarjeta */}
      <Dialog open={dialog?.mode === 'create' || dialog?.mode === 'edit'} onOpenChange={open => !open && setDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">{dialog?.mode === 'edit' ? 'Editar tarjeta' : 'Nueva tarjeta'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <Label className="text-xs text-slate-500">Alias / Nombre *</Label>
              <Input className="mt-1" value={form.alias} onChange={e => setForm(f => ({ ...f, alias: e.target.value }))} placeholder="Tarjeta Flota Principal" />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Número / Código *</Label>
              <Input className="mt-1" value={form.id_tarjeta} onChange={e => setForm(f => ({ ...f, id_tarjeta: e.target.value }))} placeholder="9240069992278321" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-slate-500">Moneda</Label>
                <Select value={form.moneda} onValueChange={v => setForm(f => ({ ...f, moneda: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{MONEDAS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-500">Saldo inicial</Label>
                <Input type="number" step="0.01" min="0" className="mt-1" value={form.saldo_inicial} onChange={e => setForm(f => ({ ...f, saldo_inicial: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Umbral de alerta ($)</Label>
              <Input type="number" step="0.01" min="0" className="mt-1" value={form.umbral_alerta ?? ''} onChange={e => setForm(f => ({ ...f, umbral_alerta: e.target.value }))} placeholder="Ej: 100 — deja vacío para desactivar" />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.activa} onCheckedChange={v => setForm(f => ({ ...f, activa: v }))} />
              <Label className="text-xs text-slate-600">Tarjeta activa</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialog(null)}>Cancelar</Button>
            <Button size="sm" onClick={handleSave} disabled={saveMut.isPending} className="bg-sky-600 hover:bg-sky-700">
              {saveMut.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              {dialog?.mode === 'edit' ? 'Guardar cambios' : 'Crear tarjeta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog recargar */}
      <Dialog open={dialog?.mode === 'recargar'} onOpenChange={open => !open && setDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-emerald-600" />
              Recargar — {dialog?.data?.alias || dialog?.data?.id_tarjeta}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
              <span className="text-xs text-slate-500">Saldo actual</span>
              <SaldoBadge saldo={dialog?.data?.saldoActual ?? 0} umbral={dialog?.data?.umbral_alerta} />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Monto a recargar *</Label>
              <Input type="number" step="0.01" min="0.01" className="mt-1" value={recargaForm.monto} onChange={e => setRecargaForm(f => ({ ...f, monto: e.target.value }))} placeholder="0.00" autoFocus />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Fecha</Label>
              <Input type="date" className="mt-1" value={recargaForm.fecha} onChange={e => setRecargaForm(f => ({ ...f, fecha: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Referencia (opcional)</Label>
              <Input className="mt-1" value={recargaForm.referencia} onChange={e => setRecargaForm(f => ({ ...f, referencia: e.target.value }))} placeholder="Nro. de comprobante, transferencia..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialog(null)}>Cancelar</Button>
            <Button size="sm" onClick={handleRecargar} disabled={recargaMut.isPending} className="bg-emerald-600 hover:bg-emerald-700">
              {recargaMut.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Registrar recarga
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Tab Precios ──────────────────────────────────────────────────────────────

function PreciosTab({ canManageFinanzas }) {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState(null);
  const [form, setForm] = useState(emptyPrecio());

  const { data: precios = [] } = useQuery({ queryKey: ['precios'], queryFn: () => base44.entities.PrecioCombustible.list('-fecha_desde', 500) });
  const { data: combustibles = [] } = useQuery({ queryKey: ['combustibles'], queryFn: () => base44.entities.TipoCombustible.list() });

  const preciosPorComb = useMemo(() => {
    const map = {};
    combustibles.forEach(c => { map[c.id] = { nombre: c.nombre, activa: c.activa, precios: [] }; });
    precios.forEach(p => {
      if (map[p.combustible_id]) map[p.combustible_id].precios.push(p);
    });
    return Object.entries(map)
      .filter(([, v]) => v.activa !== false || v.precios.length > 0)
      .sort((a, b) => a[1].nombre.localeCompare(b[1].nombre));
  }, [combustibles, precios]);

  const saveMut = useMutation({
    mutationFn: async (data) => {
      if (dialog?.mode === 'edit') {
        const { error } = await supabase.from('precio_combustible').update(data).eq('id', dialog.data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('precio_combustible').insert(data);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['precios'] });
      toast.success(dialog?.mode === 'edit' ? 'Precio actualizado' : 'Precio creado');
      setDialog(null);
    },
    onError: () => toast.error('Error al guardar precio'),
  });

  const deleteMut = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('precio_combustible').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['precios'] }); toast.success('Precio eliminado'); },
    onError: () => toast.error('Error al eliminar'),
  });

  function openCreate(combustibleId = '') {
    setForm({ ...emptyPrecio(), combustible_id: combustibleId });
    setDialog({ mode: 'create' });
  }

  function openEdit(p) {
    setForm({ combustible_id: p.combustible_id, precio_por_litro: p.precio_por_litro, fecha_desde: p.fecha_desde, fecha_hasta: p.fecha_hasta || '' });
    setDialog({ mode: 'edit', data: p });
  }

  function handleSave() {
    if (!form.combustible_id) { toast.error('Seleccione el tipo de combustible'); return; }
    const precio = parseFloat(form.precio_por_litro);
    if (!form.precio_por_litro || isNaN(precio) || precio <= 0) { toast.error('El precio debe ser mayor a 0'); return; }
    if (!form.fecha_desde) { toast.error('La fecha desde es requerida'); return; }
    saveMut.mutate({
      combustible_id: form.combustible_id,
      precio_por_litro: precio,
      fecha_desde: form.fecha_desde,
      fecha_hasta: form.fecha_hasta || null,
    });
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">Precios vigentes y anteriores por tipo de combustible</p>
        {canManageFinanzas && (
          <Button size="sm" onClick={() => openCreate()} className="h-7 text-xs gap-1.5 bg-sky-600 hover:bg-sky-700">
            <Plus className="w-3.5 h-3.5" /> Nuevo precio
          </Button>
        )}
      </div>

      {preciosPorComb.map(([combId, grupo]) => {
        const vigente = grupo.precios.find(p => p.fecha_desde <= today && (!p.fecha_hasta || p.fecha_hasta >= today));
        return (
          <Card key={combId} className="border-0 shadow-sm">
            <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <Fuel className="w-4 h-4 text-slate-400" />
                <CardTitle className="text-sm font-semibold text-slate-700">{grupo.nombre}</CardTitle>
                {vigente ? (
                  <Badge className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-50">
                    Vigente: $ {Number(vigente.precio_por_litro).toFixed(2)} / L
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] text-slate-400">Sin precio vigente</Badge>
                )}
              </div>
              {canManageFinanzas && (
                <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-slate-500" onClick={() => openCreate(combId)}>
                  <Plus className="w-3 h-3" /> Agregar
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {grupo.precios.length === 0 ? (
                <p className="px-4 pb-3 text-xs text-slate-400">Sin precios registrados</p>
              ) : (
                <div className="divide-y divide-slate-50">
                  {grupo.precios.map(p => {
                    const esVigente = p.fecha_desde <= today && (!p.fecha_hasta || p.fecha_hasta >= today);
                    return (
                      <div key={p.id} className={`flex items-center gap-3 px-4 py-2.5 ${esVigente ? 'bg-emerald-50/40' : ''}`}>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-semibold text-slate-800 tabular-nums">
                            $ {Number(p.precio_por_litro).toFixed(2)} / L
                          </span>
                          <span className="text-xs text-slate-400 ml-3">
                            Desde: {p.fecha_desde}
                            {p.fecha_hasta ? ` · Hasta: ${p.fecha_hasta}` : ' · Sin fecha de cierre'}
                          </span>
                        </div>
                        {esVigente && <Badge className="text-[10px] bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-0">Vigente</Badge>}
                        {canManageFinanzas && (
                          <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => openEdit(p)}>
                            <Pencil className="w-3 h-3 text-slate-400" />
                          </Button>
                        )}
                        {canManageFinanzas && (
                          <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => deleteMut.mutate(p.id)}>
                            <Trash2 className="w-3 h-3 text-slate-400 hover:text-red-500" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {preciosPorComb.length === 0 && (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-12 text-center text-sm text-slate-400">
            No hay tipos de combustible registrados
          </CardContent>
        </Card>
      )}

      {/* Dialog */}
      <Dialog open={!!dialog} onOpenChange={open => !open && setDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">{dialog?.mode === 'edit' ? 'Editar precio' : 'Nuevo precio'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <Label className="text-xs text-slate-500">Tipo de combustible *</Label>
              <Select value={form.combustible_id} onValueChange={v => setForm(f => ({ ...f, combustible_id: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  {combustibles.filter(c => c.activa !== false).map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Precio por litro ($ / L) *</Label>
              <Input type="number" step="0.001" min="0.001" className="mt-1" value={form.precio_por_litro} onChange={e => setForm(f => ({ ...f, precio_por_litro: e.target.value }))} placeholder="0.00" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-slate-500">Vigente desde *</Label>
                <Input type="date" className="mt-1" value={form.fecha_desde} onChange={e => setForm(f => ({ ...f, fecha_desde: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-slate-500">Hasta (opcional)</Label>
                <Input type="date" className="mt-1" value={form.fecha_hasta} onChange={e => setForm(f => ({ ...f, fecha_hasta: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialog(null)}>Cancelar</Button>
            <Button size="sm" onClick={handleSave} disabled={saveMut.isPending} className="bg-sky-600 hover:bg-sky-700">
              {saveMut.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              {dialog?.mode === 'edit' ? 'Guardar cambios' : 'Crear precio'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Página principal ─────────────────────────────────────────────────────────

export default function Finanzas() {
  const { isSuperAdmin, isEconomico, canManageFinanzas, canDelete } = useUserRole();
  const [tab, setTab] = useState('tarjetas');

  if (!canManageFinanzas) {
    return (
      <div className="py-20 text-center space-y-3">
        <WalletCards className="w-10 h-10 text-slate-300 mx-auto" />
        <p className="text-slate-400 text-sm">Acceso restringido. Solo roles económico y superadmin.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm">
          <WalletCards className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Finanzas</h1>
          <p className="text-xs text-slate-400">Gestión de tarjetas, saldos y precios de combustible</p>
        </div>
      </div>

      <div className="flex gap-0.5 border-b border-slate-200 dark:border-slate-700">
        {[
          { value: 'tarjetas', label: 'Tarjetas y saldos', icon: <CreditCard className="w-3.5 h-3.5" /> },
          { value: 'precios',  label: 'Precios de combustible', icon: <TrendingUp className="w-3.5 h-3.5" /> },
        ].map(({ value: v, label, icon }) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t border-b-2 transition-colors -mb-px ${
              tab === v
                ? 'border-emerald-500 text-emerald-700 dark:text-emerald-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            {icon}{label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === 'tarjetas' && <TarjetasTab canManageFinanzas={canManageFinanzas} canDelete={canDelete} />}
        {tab === 'precios'  && <PreciosTab  canManageFinanzas={canManageFinanzas} />}
      </div>
    </div>
  );
}
