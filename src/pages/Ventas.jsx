import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { useUserRole } from '@/components/ui-helpers/useUserRole';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import * as SelectPrimitive from '@radix-ui/react-select';
import VentaEstadoBadge, { ESTADOS_VENTA as ESTADOS, LEGACY_ESTADO, normalizeEstado } from '@/components/ui-helpers/VentaEstadoBadge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import ConfirmDialog from '@/components/ui-helpers/ConfirmDialog';
import { formatMonto } from '@/components/ui-helpers/SaldoUtils';
import {
  Droplets, Plus, Users, Fuel, Clock, CheckCircle2, Check,
  X, XCircle, Loader2, Pencil, Trash2, Search, BadgeDollarSign,
  PackageCheck, ShieldAlert, Upload, Banknote, ListFilter,
  CalendarDays, UserCircle2, TrendingUp, AlertTriangle,
} from 'lucide-react';


function WorkerAvatar({ nombre }) {
  const initials = nombre
    ? nombre.trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase()
    : '?';
  const colors = [
    'from-sky-500 to-blue-600', 'from-violet-500 to-purple-600',
    'from-rose-500 to-pink-600', 'from-amber-500 to-orange-500',
    'from-emerald-500 to-teal-600', 'from-indigo-500 to-blue-600',
  ];
  const idx = nombre ? nombre.charCodeAt(0) % colors.length : 0;
  return (
    <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${colors[idx]} flex items-center justify-center shrink-0 shadow-sm`}>
      <span className="text-[10px] font-bold text-white">{initials}</span>
    </div>
  );
}

// ── Calcula stock disponible de un tanque (stock real − reservas pendientes) ──
// DESPACHOs generados automáticamente por bonificaciones no representan
// entradas físicas al tanque — se excluyen del cálculo de stock.
const ES_BON = m => m.tipo === 'DESPACHO' && (m.referencia || '').startsWith('Bonificación combustible:');

function useStockDisponible(tanqueId, combustibleId, movimientos, ventasPendientes, consumidores) {
  return useMemo(() => {
    if (!tanqueId || !combustibleId) return null;
    const tanque = consumidores.find(c => c.id === tanqueId);
    if (!tanque) return null;

    const litrosIniciales = tanque.litros_iniciales ?? 0;
    const movsTanque = movimientos.filter(m => m.combustible_id === combustibleId);

    const entradas = movsTanque
      .filter(m => (m.tipo === 'COMPRA' || m.tipo === 'DEPOSITO' || m.tipo === 'DESPACHO') && m.consumidor_id === tanqueId && !ES_BON(m))
      .reduce((s, m) => s + (m.litros || 0), 0);

    const salidas = movsTanque
      .filter(m => m.tipo === 'DESPACHO' && m.consumidor_origen_id === tanqueId)
      .reduce((s, m) => s + (m.litros || 0), 0);

    const stockReal = litrosIniciales + entradas - salidas;

    const reservadas = ventasPendientes
      .filter(v => v.tanque_origen_id === tanqueId && v.combustible_id === combustibleId)
      .reduce((s, v) => s + (v.litros || 0), 0);

    return Math.max(stockReal - reservadas, 0);
  }, [tanqueId, combustibleId, movimientos, ventasPendientes, consumidores]);
}

function calcStockTanque(tanque, combustibleNombre, combustibleId, movimientos, ventasPendientes, tarjetas) {
  if (!tanque || !combustibleNombre) return null;

  const esSurtidor = tanque.categoria === 'surtidor';
  const ini = (() => {
    const v = Number(tanque.litros_iniciales) || 0;
    if (v <= 0) return 0;
    if (tanque.combustible_id && combustibleId) return tanque.combustible_id === combustibleId ? v : 0;
    if (tanque.combustible_nombre) return tanque.combustible_nombre.toLowerCase() === combustibleNombre.toLowerCase() ? v : 0;
    return v;
  })();

  let stockReal;
  if (esSurtidor) {
    const tarjetaVinculadaId = tanque.datos_tanque?.tarjeta_vinculada_id;
    const entradas = movimientos
      .filter(m => (m.tipo === 'COMPRA' || m.tipo === 'DESPACHO' || m.tipo === 'DEPOSITO') && m.consumidor_id === tanque.id && !ES_BON(m))
      .reduce((s, m) => s + (m.litros || 0), 0);
    const salidasDespacho = movimientos
      .filter(m => m.tipo === 'DESPACHO' && m.consumidor_origen_id === tanque.id
        && (!m.combustible_id || m.combustible_id === combustibleId))
      .reduce((s, m) => s + (m.litros || 0), 0);
    const salidasCompra = tarjetaVinculadaId
      ? movimientos.filter(m => m.tipo === 'COMPRA' && m.tarjeta_id === tarjetaVinculadaId
          && (!m.combustible_id || m.combustible_id === combustibleId))
          .reduce((s, m) => s + (m.litros || 0), 0)
      : 0;
    stockReal = ini + entradas - salidasDespacho - salidasCompra;
  } else {
    const entradas = movimientos
      .filter(m => (m.tipo === 'COMPRA' || m.tipo === 'DEPOSITO' || m.tipo === 'DESPACHO')
        && m.consumidor_id === tanque.id
        && (m.combustible_nombre === combustibleNombre || m.combustible_id === combustibleId)
        && !ES_BON(m))
      .reduce((s, m) => s + (m.litros || 0), 0);
    const salidas = movimientos
      .filter(m => m.tipo === 'DESPACHO' && m.consumidor_origen_id === tanque.id
        && (!m.combustible_id || m.combustible_id === combustibleId))
      .reduce((s, m) => s + (m.litros || 0), 0);
    stockReal = ini + entradas - salidas;
  }

  const reservadas = ventasPendientes
    .filter(v => v.tanque_origen_id === tanque.id && v.combustible_id === combustibleId)
    .reduce((s, v) => s + (v.litros || 0), 0);

  return { stock: Math.max(stockReal - reservadas, 0), stockReal };
}

const esTanqueBonificacion = c =>
  c.categoria === 'surtidor' ||
  (c.categoria === 'deposito' && (
    (c.tipo_consumidor_nombre || '').toLowerCase().match(/tanque|reserva|iso|almac|surtidor/) ||
    (c.nombre || '').toLowerCase().match(/reserva|deposito|depósito|refinería|logist/)
  ));

// ── Formulario nueva bonificación ────────────────────────────────────────────

const emptyForm = {
  beneficiario_id: '', tanque_origen_id: '', combustible_id: '',
  litros: '', referencia: '', fecha_venta: new Date().toISOString().slice(0, 10),
};

function FormBonificacion({ onClose, ventasPendientes, ventasRaw = [] }) {
  const qc = useQueryClient();
  const { user, canVerPrecios } = useUserRole();
  const [form, setForm] = useState(emptyForm);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const { data: beneficiarios = [] } = useQuery({ queryKey: ['beneficiarios'], queryFn: () => base44.entities.Beneficiario.list('nombre') });
  const { data: consumidores  = [] } = useQuery({ queryKey: ['consumidores'],  queryFn: () => base44.entities.Consumidor.list() });
  const { data: combustibles  = [] } = useQuery({ queryKey: ['combustibles'],  queryFn: () => base44.entities.TipoCombustible.list() });
  const { data: preciosDespacho = [] } = useQuery({ queryKey: ['precios-despacho'], queryFn: () => base44.entities.PrecioDespachoTipo.list('-fecha_desde', 200) });
  const { data: movimientos   = [] } = useQuery({ queryKey: ['movimientos'],   queryFn: () => base44.entities.Movimiento.list('-fecha', 5000), staleTime: 5 * 60_000 });

  const tanques = consumidores.filter(esTanqueBonificacion);

  const combDisponibles = useMemo(() => {
    if (!form.tanque_origen_id) return combustibles.filter(c => c.activa !== false);
    const tanque = consumidores.find(c => c.id === form.tanque_origen_id);
    if (tanque?.combustible_id) return combustibles.filter(c => c.activa !== false && c.id === tanque.combustible_id);
    const admitidos = tanque?.datos_tanque?.combustibles_admitidos ?? [];
    if (!admitidos.length) return combustibles.filter(c => c.activa !== false);
    return combustibles.filter(c => c.activa !== false && admitidos.some(a => a === c.nombre || a === c.id));
  }, [form.tanque_origen_id, consumidores, combustibles]);

  const precioVigente = useMemo(() => {
    if (!form.combustible_id || !form.fecha_venta) return null;
    const fecha = form.fecha_venta;
    const combId = form.combustible_id;
    const candidatos = preciosDespacho
      .filter(p => p.fecha_desde <= fecha)
      .sort((a, b) => b.fecha_desde.localeCompare(a.fecha_desde));
    return candidatos.find(p => p.combustible_id === combId)
        ?? candidatos.find(p => !p.combustible_id)
        ?? null;
  }, [form.combustible_id, form.fecha_venta, preciosDespacho]);

  const montoCalculado = precioVigente && form.litros ? parseFloat(form.litros) * precioVigente.precio_por_litro : null;
  const stockDisponible = useStockDisponible(form.tanque_origen_id, form.combustible_id, movimientos, ventasPendientes, consumidores);
  const stockInsuficiente = stockDisponible !== null && form.litros && parseFloat(form.litros) > stockDisponible;

  const crearMut = useMutation({
    mutationFn: async (data) => {
      const { data: result, error } = await supabase
        .from('venta_trabajador')
        .insert(data)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ventas'] });
      toast.success('Bonificación registrada');
      onClose();
    },
    onError: (e) => toast.error(e.message ?? 'Error al guardar'),
  });

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.beneficiario_id) { toast.error('Seleccione un trabajador'); return; }
    if (!form.tanque_origen_id) { toast.error('Seleccione el tanque de origen'); return; }
    if (!form.combustible_id) { toast.error('Seleccione el combustible'); return; }
    const litros = parseFloat(form.litros);
    if (!litros || litros <= 0) { toast.error('Ingrese los litros'); return; }
    if (!precioVigente) { toast.error('No hay precio de despacho configurado para este combustible'); return; }
    if (stockDisponible !== null && litros > stockDisponible) {
      toast.error(`Stock insuficiente. Disponible: ${stockDisponible.toFixed(1)} L`);
      return;
    }
    const ben = beneficiarios.find(b => b.id === form.beneficiario_id);
    const tanque = consumidores.find(c => c.id === form.tanque_origen_id);
    const comb = combustibles.find(c => c.id === form.combustible_id);
    const nums = ventasRaw
      .map(v => parseInt((v.numero_factura || '').slice(1), 10))
      .filter(n => !isNaN(n) && n > 0);
    const nextNum = nums.length > 0 ? Math.max(...nums) + 1 : 1;
    crearMut.mutate({
      beneficiario_id:     form.beneficiario_id,
      beneficiario_nombre: ben.nombre,
      beneficiario_ci:     ben.ci ?? null,
      beneficiario_area:   ben.area ?? null,
      tanque_origen_id:    form.tanque_origen_id,
      tanque_origen_nombre: tanque.nombre,
      combustible_id:      form.combustible_id,
      combustible_nombre:  comb.nombre,
      litros,
      precio_por_litro:    precioVigente.precio_por_litro,
      monto:               montoCalculado,
      moneda:              precioVigente.moneda,
      estado:              'PENDIENTE',
      fecha_venta:         form.fecha_venta,
      registrado_por:      user?.id ?? null,
      referencia:          form.referencia || null,
      numero_factura:      `C${nextNum}`,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Fecha */}
      <div className="space-y-1">
        <Label className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
          <CalendarDays className="w-3 h-3" /> Fecha *
        </Label>
        <Input type="date" className="h-9 text-sm" value={form.fecha_venta}
          onChange={e => set('fecha_venta', e.target.value)} />
      </div>

      {/* Trabajador */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-2">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
          <UserCircle2 className="w-3 h-3" /> Trabajador
        </p>
        <Select value={form.beneficiario_id} onValueChange={v => set('beneficiario_id', v)}>
          <SelectTrigger className="h-9 text-sm bg-white">
            <SelectValue placeholder="Seleccionar trabajador…" />
          </SelectTrigger>
          <SelectContent>
            {beneficiarios.filter(b => b.activo !== false).map(b => (
              <SelectPrimitive.Item
                key={b.id}
                value={b.id}
                className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
              >
                <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                  <SelectPrimitive.ItemIndicator>
                    <Check className="h-4 w-4" />
                  </SelectPrimitive.ItemIndicator>
                </span>
                {/* Solo el nombre va dentro de ItemText → es lo que aparece en el trigger */}
                <SelectPrimitive.ItemText>{b.nombre}</SelectPrimitive.ItemText>
                {/* CI y área quedan fuera de ItemText → solo visibles en el dropdown */}
                {(b.ci || b.area) && (
                  <span className="ml-1.5 text-[11px] text-slate-400 truncate">
                    {[b.ci, b.area].filter(Boolean).join(' · ')}
                  </span>
                )}
              </SelectPrimitive.Item>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Combustible */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-2">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
          <Fuel className="w-3 h-3" /> Combustible
        </p>
        <Select value={form.tanque_origen_id} onValueChange={v => {
            set('tanque_origen_id', v);
            const tq = consumidores.find(c => c.id === v);
            // 1. Combustible directo del tanque
            if (tq?.combustible_id) {
              set('combustible_id', tq.combustible_id);
              return;
            }
            // 2. Lista de admitidos en datos_tanque
            const admitidos = tq?.datos_tanque?.combustibles_admitidos ?? [];
            let disp;
            if (admitidos.length) {
              disp = combustibles.filter(c => c.activa !== false && admitidos.some(a => a === c.nombre || a === c.id));
            } else {
              const nombreTq = (tq?.nombre || '').toLowerCase();
              const porNombre = combustibles.filter(c => c.activa !== false && nombreTq.includes((c.nombre || '').toLowerCase()));
              disp = porNombre.length ? porNombre : combustibles.filter(c => c.activa !== false);
            }
            set('combustible_id', disp.length === 1 ? disp[0].id : '');
          }}>
          <SelectTrigger className="h-9 text-sm bg-white overflow-hidden [&>span]:truncate [&>span]:flex-1 [&>span]:min-w-0"><SelectValue placeholder="Tanque de origen…" /></SelectTrigger>
          <SelectContent>
            {tanques.map(t => (
              <SelectItem key={t.id} value={t.id} className="text-sm">{t.nombre}{t.codigo_interno ? ` · ${t.codigo_interno}` : ''}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="grid grid-cols-2 gap-2">
          <Select value={form.combustible_id} onValueChange={v => set('combustible_id', v)} disabled={!form.tanque_origen_id}>
            <SelectTrigger className="h-9 text-sm bg-white"><SelectValue placeholder="Tipo…" /></SelectTrigger>
            <SelectContent>
              {combDisponibles.map(c => (
                <SelectItem key={c.id} value={c.id} className="text-sm">{c.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="number" min="0.1" step="0.1" placeholder="Litros…" className="h-9 text-sm bg-white"
            value={form.litros} onChange={e => set('litros', e.target.value)} />
        </div>

        {/* Stock */}
        {stockDisponible !== null && form.combustible_id && (
          <div className={`rounded-lg px-3 py-1.5 text-xs flex items-center gap-2 ${
            stockInsuficiente
              ? 'bg-red-50 border border-red-200 text-red-700'
              : 'bg-white border border-slate-200 text-slate-500'
          }`}>
            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${stockInsuficiente ? 'bg-red-400' : 'bg-emerald-400'}`} />
            Stock disponible: <strong className="ml-0.5">{stockDisponible.toFixed(1)} L</strong>
            {stockInsuficiente && (
              <span className="ml-auto font-semibold flex items-center gap-1 text-red-600">
                <ShieldAlert className="w-3 h-3" /> Insuficiente
              </span>
            )}
          </div>
        )}
      </div>

      {/* Precio calculado */}
      {canVerPrecios && precioVigente && form.litros && montoCalculado != null && (
        <div className="rounded-xl bg-gradient-to-r from-violet-50 to-purple-50 border border-violet-100 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-violet-600">
            <BadgeDollarSign className="w-4 h-4" />
            <span>{Number(precioVigente.precio_por_litro).toFixed(2)} {precioVigente.moneda}/L</span>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-violet-400">Monto total</p>
            <p className="text-base font-bold text-violet-700">{formatMonto(montoCalculado)} <span className="text-xs font-normal">{precioVigente.moneda}</span></p>
          </div>
        </div>
      )}
      {form.combustible_id && !precioVigente && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700 flex items-center gap-2">
          <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
          Sin precio de despacho configurado. Configure en Finanzas → Precios de despacho.
        </div>
      )}

      {/* Referencia */}
      <div className="space-y-1">
        <Label className="text-xs text-slate-500">Referencia (opcional)</Label>
        <Input className="h-9 text-sm" placeholder="Nota u observación…" value={form.referencia}
          onChange={e => set('referencia', e.target.value)} />
      </div>

      <div className="flex gap-2 justify-end pt-1">
        <Button type="button" variant="ghost" size="sm" className="h-9 text-sm" onClick={onClose}>Cancelar</Button>
        <Button type="submit" size="sm" className="h-9 text-sm bg-rose-600 hover:bg-rose-700" disabled={crearMut.isPending || !precioVigente}>
          {crearMut.isPending
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />Guardando…</>
            : <><Plus className="w-3.5 h-3.5 mr-1.5" />Registrar bonificación</>}
        </Button>
      </div>
    </form>
  );
}

// ── Panel de gestión de beneficiarios ─────────────────────────────────────────

const emptyBen = { nombre: '', ci: '', area: '', observaciones: '' };

function PanelBeneficiarios({ onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(emptyBen);
  const [editId, setEditId] = useState(null);
  const [search, setSearch] = useState('');
  const [toDelete, setToDelete] = useState(null);
  const [importRows, setImportRows]     = useState(null);
  const [selected, setSelected]         = useState(new Set());
  const [importSearch, setImportSearch] = useState('');
  const [importing, setImporting]       = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const { data: beneficiarios = [], isLoading } = useQuery({
    queryKey: ['beneficiarios'],
    queryFn: () => base44.entities.Beneficiario.list('nombre'),
  });

  const ciExistentes = useMemo(() => new Set(beneficiarios.map(b => b.ci).filter(Boolean)), [beneficiarios]);

  function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target.result);
        const all = Array.isArray(json) ? json : [];
        const rows = all.map((r, idx) => {
          const ci     = (r['CI'] ?? '').toString().trim() || null;
          const nombre = (r['Nombre y Apellidos'] || '').trim();
          const esActivo = (r['Estado'] ?? '').toLowerCase().includes('activ');
          const duplicado = ci && ciExistentes.has(ci);
          const areaBruta = (r['Departamento'] ?? '').trim();
          const area = /^baja[s]?$/i.test(areaBruta) ? null : areaBruta || null;
          return { idx, nombre, ci, area, esActivo, duplicado };
        }).filter(r => r.nombre);
        const presel = new Set(rows.filter(r => r.esActivo && !r.duplicado).map(r => r.idx));
        setImportRows(rows);
        setSelected(presel);
        setImportSearch('');
      } catch {
        toast.error('No se pudo leer el archivo JSON');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function toggleRow(idx) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  }

  function toggleAll(visibleRows) {
    const allSelected = visibleRows.every(r => selected.has(r.idx));
    setSelected(prev => {
      const next = new Set(prev);
      visibleRows.forEach(r => allSelected ? next.delete(r.idx) : next.add(r.idx));
      return next;
    });
  }

  async function confirmImport() {
    const toInsert = importRows.filter(r => selected.has(r.idx) && !r.duplicado);
    if (!toInsert.length) { toast.error('Selecciona al menos un trabajador sin CI duplicado'); return; }
    setImporting(true);
    const CHUNK = 100;
    let inserted = 0;
    try {
      for (let i = 0; i < toInsert.length; i += CHUNK) {
        const chunk = toInsert.slice(i, i + CHUNK).map(r => ({
          nombre: r.nombre, ci: r.ci, area: r.area, activo: true,
        }));
        const { error } = await supabase.from('beneficiario').insert(chunk);
        if (error) throw error;
        inserted += chunk.length;
      }
      toast.success(`${inserted} trabajadores importados`);
      qc.invalidateQueries({ queryKey: ['beneficiarios'] });
      setImportRows(null);
      setSelected(new Set());
    } catch (err) {
      toast.error(err.message ?? 'Error al importar');
    }
    setImporting(false);
  }

  const crearMut = useMutation({
    mutationFn: d => editId ? base44.entities.Beneficiario.update(editId, d) : base44.entities.Beneficiario.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['beneficiarios'] });
      setForm(emptyBen);
      setEditId(null);
      toast.success(editId ? 'Actualizado' : 'Trabajador registrado');
    },
    onError: () => toast.error('Error al guardar'),
  });

  const deleteMut = useMutation({
    mutationFn: id => base44.entities.Beneficiario.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['beneficiarios'] }); setToDelete(null); toast.success('Eliminado'); },
    onError: () => toast.error('No se puede eliminar — tiene bonificaciones asociadas'),
  });

  function handleSave(e) {
    e.preventDefault();
    if (!form.nombre.trim()) { toast.error('El nombre es obligatorio'); return; }
    crearMut.mutate({ nombre: form.nombre.trim(), ci: form.ci || null, area: form.area || null, observaciones: form.observaciones || null, activo: true });
  }

  function openEdit(b) { setForm({ nombre: b.nombre, ci: b.ci ?? '', area: b.area ?? '', observaciones: b.observaciones ?? '' }); setEditId(b.id); }
  function cancelEdit() { setForm(emptyBen); setEditId(null); }

  const filtered = beneficiarios.filter(b =>
    !search || b.nombre.toLowerCase().includes(search.toLowerCase()) || (b.ci ?? '').includes(search)
  );

  return (
    <div className="space-y-4">

      {/* Preview de importación */}
      {importRows && (() => {
        const filtrados = importRows.filter(r =>
          !importSearch ||
          r.nombre.toLowerCase().includes(importSearch.toLowerCase()) ||
          (r.ci ?? '').includes(importSearch)
        );
        const seleccionados = importRows.filter(r => selected.has(r.idx) && !r.duplicado);
        return (
          <div className="border border-sky-200 bg-gradient-to-b from-sky-50 to-white rounded-xl p-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-sky-700 flex items-center gap-1.5">
                <Upload className="w-3.5 h-3.5" /> Selecciona los trabajadores a importar
              </p>
              <button
                className="text-[10px] text-slate-400 hover:text-slate-600 px-1.5 py-0.5 rounded hover:bg-slate-100"
                onClick={() => { setImportRows(null); setSelected(new Set()); }}>
                ✕ Cerrar
              </button>
            </div>

            <div className="grid grid-cols-4 gap-1.5 text-[10px]">
              {[
                { label: 'Total',      value: importRows.length,                        cls: 'bg-slate-100 text-slate-600' },
                { label: 'Activos',    value: importRows.filter(r => r.esActivo).length, cls: 'bg-emerald-100 text-emerald-700' },
                { label: 'Bajas',      value: importRows.filter(r => !r.esActivo).length, cls: 'bg-slate-100 text-slate-500' },
                { label: 'Duplicados', value: importRows.filter(r => r.duplicado).length, cls: 'bg-amber-100 text-amber-700' },
              ].map(k => (
                <div key={k.label} className={`rounded-lg px-2 py-1.5 text-center ${k.cls}`}>
                  <div className="font-bold text-sm leading-none">{k.value}</div>
                  <div className="mt-0.5 opacity-70">{k.label}</div>
                </div>
              ))}
            </div>

            <div className="relative">
              <Search className="absolute left-2.5 top-2 w-3 h-3 text-slate-400" />
              <Input className="h-7 text-xs pl-7" placeholder="Buscar nombre o CI…"
                value={importSearch} onChange={e => setImportSearch(e.target.value)} />
            </div>

            <div className="max-h-52 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg bg-white text-xs">
              <div className="px-2.5 py-1.5 flex gap-2 items-center bg-slate-50 sticky top-0 border-b border-slate-200">
                <input type="checkbox"
                  checked={filtrados.length > 0 && filtrados.every(r => selected.has(r.idx) || r.duplicado)}
                  onChange={() => toggleAll(filtrados.filter(r => !r.duplicado))}
                  className="w-3 h-3 rounded" />
                <span className="text-slate-500 font-medium text-[10px]">Seleccionar todos ({filtrados.filter(r => !r.duplicado).length})</span>
              </div>
              {filtrados.map(r => (
                <div key={r.idx} className={`px-2.5 py-1.5 flex gap-2 items-center transition-colors ${r.duplicado ? 'opacity-40' : 'hover:bg-slate-50'}`}>
                  <input type="checkbox"
                    checked={selected.has(r.idx)}
                    disabled={r.duplicado}
                    onChange={() => toggleRow(r.idx)}
                    className="w-3 h-3 rounded shrink-0" />
                  <span className={`w-4 h-4 shrink-0 rounded-full flex items-center justify-center text-[8px] font-bold ${r.esActivo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                    {r.esActivo ? 'A' : 'B'}
                  </span>
                  <span className="text-slate-400 w-20 shrink-0 truncate font-mono text-[10px]">{r.ci ?? '—'}</span>
                  <span className="text-slate-700 flex-1 truncate">{r.nombre}</span>
                  <span className="text-slate-400 truncate max-w-20 text-[10px]">{r.area ?? '—'}</span>
                  {r.duplicado && <span className="text-[9px] bg-amber-100 text-amber-600 px-1 rounded shrink-0">CI existe</span>}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-0.5">
              <span className="text-[10px] text-slate-500">
                <strong className="text-slate-700">{seleccionados.length}</strong> seleccionados para importar
              </span>
              <Button type="button" size="sm" className="h-7 text-xs bg-sky-600 hover:bg-sky-700 text-white gap-1.5"
                onClick={confirmImport} disabled={importing || seleccionados.length === 0}>
                {importing
                  ? <><Loader2 className="w-3 h-3 animate-spin" />Importando…</>
                  : <><Upload className="w-3 h-3" />Importar {seleccionados.length}</>}
              </Button>
            </div>
          </div>
        );
      })()}

      {/* Formulario trabajador */}
      <form onSubmit={handleSave} className="rounded-xl border border-slate-200 p-3 space-y-3 bg-slate-50/60">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-700">{editId ? 'Editar trabajador' : 'Nuevo trabajador'}</p>
          {!editId && (
            <label className="cursor-pointer">
              <input type="file" accept=".json" className="hidden" onChange={handleImportFile} />
              <span className="inline-flex items-center gap-1 text-[10px] text-sky-600 hover:text-sky-800 font-semibold bg-sky-50 hover:bg-sky-100 px-2 py-1 rounded-lg transition-colors">
                <Upload className="w-3 h-3" /> Importar JSON
              </span>
            </label>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2 space-y-1">
            <Label className="text-xs text-slate-500">Nombre completo *</Label>
            <Input className="h-8 text-sm" value={form.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Nombre completo…" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">CI</Label>
            <Input className="h-8 text-sm" value={form.ci} onChange={e => set('ci', e.target.value)} placeholder="Carnet de identidad" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">Área / Departamento</Label>
            <Input className="h-8 text-sm" value={form.area} onChange={e => set('area', e.target.value)} placeholder="Área…" />
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          {editId && <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={cancelEdit}>Cancelar</Button>}
          <Button type="submit" size="sm" className="h-8 text-sm" disabled={crearMut.isPending}>
            {crearMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
            {editId ? 'Guardar cambios' : 'Agregar trabajador'}
          </Button>
        </div>
      </form>

      {/* Buscador */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
        <Input className="h-9 text-sm pl-8" placeholder="Buscar por nombre o CI…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>
      ) : (
        <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              <Users className="w-7 h-7 mx-auto mb-2 text-slate-200" />
              Sin trabajadores registrados.
            </div>
          ) : filtered.map(b => (
            <div key={b.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 transition-colors group">
              <WorkerAvatar nombre={b.nombre} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate leading-tight">{b.nombre}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{[b.ci, b.area].filter(Boolean).join(' · ') || 'Sin datos adicionales'}</p>
              </div>
              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-300 hover:text-sky-600 hover:bg-sky-50" onClick={() => openEdit(b)}>
                  <Pencil className="w-3 h-3" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-300 hover:text-red-500 hover:bg-red-50" onClick={() => setToDelete(b)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {toDelete && (
        <ConfirmDialog open title="Eliminar trabajador"
          description={`¿Eliminar a ${toDelete.nombre}? Solo es posible si no tiene bonificaciones asociadas.`}
          onConfirm={() => deleteMut.mutate(toDelete.id)}
          onCancel={() => setToDelete(null)}
          loading={deleteMut.isPending} />
      )}
    </div>
  );
}

// ── Fila de bonificación ──────────────────────────────────────────────────────

function VentaRow({ v, canOperar, canDelete, canEditar, onCambiarEstado, onDelete, onEdit, loading, stockInsuficiente }) {
  const { canVerPrecios } = useUserRole();
  const fmtL = n => (n % 1 === 0 ? String(Math.round(n)) : n.toFixed(1));
  const [editEstado, setEditEstado] = useState(false);
  const isCancelado = v.estado === 'CANCELADO' || v.estado === 'ANULADO';
  const estadoNormalizado = normalizeEstado(v.estado);
  const isTerminal = estadoNormalizado === 'PAGADO_FINALIZADO' || estadoNormalizado === 'CANCELADO';
  const estadosSiguientes = isTerminal ? [] :
    estadoNormalizado === 'PENDIENTE'
      ? ESTADOS.filter(e => e.value !== 'PENDIENTE')
      : ESTADOS.filter(e => e.value === 'PAGADO_FINALIZADO' || e.value === 'CANCELADO');
  const puedeEditar = canOperar && !isTerminal;

  return (
    <div className={`flex items-start gap-3 px-4 py-3.5 hover:bg-slate-50/70 transition-colors ${isCancelado ? 'opacity-50' : ''}`}>
      <WorkerAvatar nombre={v.beneficiario_nombre} />

      <div className="flex-1 min-w-0 space-y-1">
        {/* Nombre + estado */}
        <div className="flex items-center gap-2 flex-wrap">
          {v.numero_factura && (
            <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md leading-none">{v.numero_factura}</span>
          )}
          <span className="text-sm font-semibold text-slate-800 leading-tight">{v.beneficiario_nombre}</span>
          {v.beneficiario_ci && (
            <span className="text-[10px] text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded-md leading-none">{v.beneficiario_ci}</span>
          )}
          {/* Badge editable */}
          {puedeEditar && editEstado ? (
            <div className="flex items-center gap-1">
              <Select value={estadoNormalizado} onValueChange={val => { onCambiarEstado(val); setEditEstado(false); }}>
                <SelectTrigger className="h-6 text-[10px] w-36 px-2 py-0 overflow-hidden [&>span]:truncate [&>span]:flex-1 [&>span]:min-w-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {estadosSiguientes.map(e => (
                    <SelectItem key={e.value} value={e.value} className="text-xs">{e.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button onClick={() => setEditEstado(false)} className="text-slate-300 hover:text-slate-600 shrink-0">
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => puedeEditar && setEditEstado(true)}
              title={puedeEditar ? 'Cambiar estado' : undefined}
              className={puedeEditar ? 'hover:opacity-70 transition-opacity' : 'cursor-default'}
            >
              <VentaEstadoBadge estado={v.estado} />
            </button>
          )}
        </div>

        {/* Área */}
        {v.beneficiario_area && (
          <p className="text-[10px] text-slate-400 leading-none">{v.beneficiario_area}</p>
        )}

        {/* Detalles */}
        <div className="flex items-center gap-1.5 flex-wrap text-xs text-slate-500 pt-0.5">
          <span className="flex items-center gap-1">
            <CalendarDays className="w-3 h-3 text-slate-300" />
            {v.fecha_venta}
          </span>
          <span className="text-slate-200">·</span>
          <span className="flex items-center gap-1">
            <Fuel className="w-3 h-3 text-amber-400" />
            <strong className="text-slate-700">{fmtL(v.litros)} L</strong> {v.combustible_nombre}
          </span>
          {canVerPrecios && (
            <>
              <span className="text-slate-200">·</span>
              <span className="flex items-center gap-1">
                <Banknote className="w-3 h-3 text-emerald-400" />
                <strong className="text-slate-700">{formatMonto(v.monto)}</strong>
                <span className="text-slate-400">{v.moneda}</span>
              </span>
            </>
          )}
          {v.tanque_origen_nombre && (
            <>
              <span className="text-slate-200">·</span>
              <span className="text-slate-400">desde {v.tanque_origen_nombre}</span>
            </>
          )}
          {stockInsuficiente && !isTerminal && (
            <>
              <span className="text-slate-200">·</span>
              <span className="text-red-600 flex items-center gap-0.5 font-semibold">
                <AlertTriangle className="w-2.5 h-2.5" /> Sin stock
              </span>
            </>
          )}
        </div>
      </div>

      {/* Acciones */}
      {(canEditar || canDelete) && (
        <div className="shrink-0 flex gap-0.5">
          {canEditar && (
            <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-200 hover:text-sky-600 hover:bg-sky-50"
              onClick={onEdit} disabled={loading} title="Editar bonificación">
              <Pencil className="w-3.5 h-3.5" />
            </Button>
          )}
          {canDelete && (
            <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-200 hover:text-red-600 hover:bg-red-50"
              onClick={onDelete} disabled={loading} title="Eliminar registro">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Formulario edición de bonificación ───────────────────────────────────────

function FormEditBonificacion({ venta, onClose }) {
  const qc = useQueryClient();
  const esPendiente = venta.estado === 'PENDIENTE';
  const [form, setForm] = useState({
    fecha_venta:      venta.fecha_venta,
    beneficiario_id:  venta.beneficiario_id,
    tanque_origen_id: venta.tanque_origen_id,
    combustible_id:   venta.combustible_id,
    litros:           String(venta.litros),
    precio_por_litro: String(venta.precio_por_litro),
    referencia:       venta.referencia ?? '',
    numero_factura:   venta.numero_factura ?? '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const { data: beneficiarios = [] } = useQuery({ queryKey: ['beneficiarios'], queryFn: () => base44.entities.Beneficiario.list('nombre') });
  const { data: consumidores  = [] } = useQuery({ queryKey: ['consumidores'],  queryFn: () => base44.entities.Consumidor.list() });
  const { data: combustibles  = [] } = useQuery({ queryKey: ['combustibles'],  queryFn: () => base44.entities.TipoCombustible.list() });

  const tanques = useMemo(() => consumidores.filter(c =>
    c.categoria === 'surtidor' ||
    (c.categoria === 'deposito' && (
      (c.tipo_consumidor_nombre || '').toLowerCase().match(/tanque|reserva|iso|almac|surtidor/) ||
      (c.nombre || '').toLowerCase().match(/reserva|deposito|depósito|refinería|logist/)
    ))
  ), [consumidores]);

  const monto = useMemo(() => {
    const l = parseFloat(form.litros);
    const p = parseFloat(form.precio_por_litro);
    return isNaN(l) || isNaN(p) ? null : +(l * p).toFixed(4);
  }, [form.litros, form.precio_por_litro]);

  const editarMut = useMutation({
    mutationFn: async (payload) => {
      const { error } = await supabase.from('venta_trabajador').update(payload).eq('id', venta.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ventas'] });
      qc.invalidateQueries({ queryKey: ['movimientos'] });
      toast.success('Bonificación actualizada');
      onClose();
    },
    onError: (e) => toast.error(e.message ?? 'Error al actualizar'),
  });

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.beneficiario_id) { toast.error('Seleccione un trabajador'); return; }
    if (!form.tanque_origen_id) { toast.error('Seleccione el tanque de origen'); return; }
    if (!form.combustible_id)   { toast.error('Seleccione el combustible'); return; }
    const litros = parseFloat(form.litros);
    const precio = parseFloat(form.precio_por_litro);
    if (isNaN(litros) || litros <= 0) { toast.error('Litros inválido'); return; }
    if (isNaN(precio) || precio <= 0) { toast.error('Precio inválido'); return; }

    const ben    = beneficiarios.find(b => b.id === form.beneficiario_id);
    const tanque = consumidores.find(c => c.id === form.tanque_origen_id);
    const comb   = combustibles.find(c => c.id === form.combustible_id);

    editarMut.mutate({
      fecha_venta:          form.fecha_venta,
      beneficiario_id:      form.beneficiario_id,
      beneficiario_nombre:  ben?.nombre   ?? venta.beneficiario_nombre,
      beneficiario_ci:      ben?.ci       ?? null,
      beneficiario_area:    ben?.area     ?? null,
      tanque_origen_id:     form.tanque_origen_id,
      tanque_origen_nombre: tanque?.nombre ?? venta.tanque_origen_nombre,
      combustible_id:       form.combustible_id,
      combustible_nombre:   comb?.nombre  ?? venta.combustible_nombre,
      litros,
      precio_por_litro:     precio,
      monto:                litros * precio,
      referencia:           form.referencia || null,
      numero_factura:       form.numero_factura || null,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-1">
      {/* Fecha */}
      <div className="space-y-1">
        <Label className="text-xs text-slate-500">Fecha *</Label>
        <Input type="date" className="h-9 text-sm" value={form.fecha_venta}
          onChange={e => set('fecha_venta', e.target.value)} required />
      </div>

      {/* Trabajador */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-2">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
          <UserCircle2 className="w-3 h-3" /> Trabajador
        </p>
        <Select value={form.beneficiario_id} onValueChange={v => set('beneficiario_id', v)} disabled={!esPendiente}>
          <SelectTrigger className="h-9 text-sm bg-white">
            <SelectValue placeholder="Seleccionar trabajador…" />
          </SelectTrigger>
          <SelectContent>
            {beneficiarios.filter(b => b.activo !== false).map(b => (
              <SelectPrimitive.Item
                key={b.id} value={b.id}
                className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
              >
                <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                  <SelectPrimitive.ItemIndicator><Check className="h-4 w-4" /></SelectPrimitive.ItemIndicator>
                </span>
                <SelectPrimitive.ItemText>{b.nombre}</SelectPrimitive.ItemText>
                {(b.ci || b.area) && (
                  <span className="ml-1.5 text-[11px] text-slate-400 truncate">{[b.ci, b.area].filter(Boolean).join(' · ')}</span>
                )}
              </SelectPrimitive.Item>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Combustible */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-2">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
          <Fuel className="w-3 h-3" /> Combustible
        </p>
        {/* Tanque */}
        <Select value={form.tanque_origen_id} onValueChange={v => {
          set('tanque_origen_id', v);
          const tq = consumidores.find(c => c.id === v);
          const admitidos = tq?.datos_tanque?.combustibles_admitidos ?? [];
          let disp;
          if (admitidos.length) {
            disp = combustibles.filter(c => c.activa !== false && admitidos.some(a => a === c.nombre || a === c.id));
          } else {
            const nombreTq = (tq?.nombre || '').toLowerCase();
            const porNombre = combustibles.filter(c => c.activa !== false && nombreTq.includes((c.nombre || '').toLowerCase()));
            disp = porNombre.length ? porNombre : combustibles.filter(c => c.activa !== false);
          }
          if (disp.length === 1) set('combustible_id', disp[0].id);
        }} disabled={!esPendiente}>
          <SelectTrigger className="h-9 text-sm bg-white overflow-hidden [&>span]:truncate [&>span]:flex-1 [&>span]:min-w-0">
            <SelectValue placeholder="Tanque de origen…" />
          </SelectTrigger>
          <SelectContent>
            {tanques.map(c => (
              <SelectItem key={c.id} value={c.id} className="text-sm">{c.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Combustible + Litros */}
        <div className="grid grid-cols-2 gap-2">
          <Select value={form.combustible_id} onValueChange={v => set('combustible_id', v)} disabled={!esPendiente}>
            <SelectTrigger className="h-9 text-sm bg-white">
              <SelectValue placeholder="Tipo…" />
            </SelectTrigger>
            <SelectContent>
              {combustibles.filter(c => c.activa !== false).map(c => (
                <SelectItem key={c.id} value={c.id} className="text-sm">{c.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="number" min="0.1" step="0.1" placeholder="Litros…"
            className="h-9 text-sm bg-white" value={form.litros}
            onChange={e => set('litros', e.target.value)} disabled={!esPendiente} />
        </div>

        {/* Precio */}
        <div className="flex items-center gap-2">
          <div className="flex-1 space-y-1">
            <Label className="text-[10px] text-slate-400">Precio por litro</Label>
            <Input type="number" min="0.0001" step="0.0001" className="h-8 text-xs bg-white"
              value={form.precio_por_litro} onChange={e => set('precio_por_litro', e.target.value)} disabled={!esPendiente} />
          </div>
          {monto !== null && (
            <div className="flex-1 space-y-1">
              <Label className="text-[10px] text-slate-400">Monto total</Label>
              <div className="h-8 px-3 rounded-md border border-slate-200 bg-slate-100 flex items-center text-sm font-semibold text-emerald-700">
                {formatMonto(monto)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Número de factura */}
      <div className="space-y-1">
        <Label className="text-xs text-slate-500">Número de factura</Label>
        <Input className="h-9 text-sm font-mono" placeholder="C1, C2…"
          value={form.numero_factura} onChange={e => set('numero_factura', e.target.value)} />
      </div>

      {/* Referencia */}
      <div className="space-y-1">
        <Label className="text-xs text-slate-500">Referencia (opcional)</Label>
        <Input className="h-9 text-sm" placeholder="Nota u observación…"
          value={form.referencia} onChange={e => set('referencia', e.target.value)} />
      </div>

      {!esPendiente && (
        <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Estado <strong>{venta.estado}</strong> — los campos financieros son inmutables. Solo se puede modificar fecha y referencia.
        </p>
      )}

      <div className="flex gap-2 justify-end pt-1">
        <Button type="button" variant="ghost" size="sm" className="h-9 text-sm" onClick={onClose}>Cancelar</Button>
        <Button type="submit" size="sm" className="h-9 text-sm bg-sky-600 hover:bg-sky-700" disabled={editarMut.isPending}>
          {editarMut.isPending ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />Guardando…</> : 'Guardar cambios'}
        </Button>
      </div>
    </form>
  );
}

// ── Config filtros de estado para historial ───────────────────────────────────

const FILTRO_ESTADOS = [
  { value: 'all',               label: 'Todos' },
  { value: 'PENDIENTE',         label: 'Pendiente' },
  { value: 'ENTREGADO',         label: 'Entregado' },
  { value: 'PAGADO_FINALIZADO', label: 'Pagado' },
  { value: 'CANCELADO',         label: 'Cancelado' },
];

// ── Página principal ──────────────────────────────────────────────────────────

export default function Ventas() {
  const qc = useQueryClient();
  const { user, canVerVentas, canRegistrarVentas, canCobrarVentas, canGestionarBeneficiarios, canManageFinanzas, isSuperAdmin, isCajero, canVerPrecios } = useUserRole();
  const canEditar = isSuperAdmin || isCajero;

  const [showFormVenta, setShowFormVenta] = useState(false);
  const [showBeneficiarios, setShowBeneficiarios] = useState(false);
  const [toEliminar, setToEliminar] = useState(null);
  const [toEditar, setToEditar] = useState(null);
  const [toCobrar, setToCobrar] = useState(null);
  const [precioVentaInput, setPrecioVentaInput] = useState('');
  const [filtroMes, setFiltroMes] = useState(new Date().toISOString().slice(0, 7));
  const [filtroBen, setFiltroBen] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('PENDIENTE');

  const { data: ventasRaw = [], isLoading } = useQuery({
    queryKey: ['ventas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('venta_trabajador')
        .select('*')
        .order('fecha_venta', { ascending: false })
        .order('created_date', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const { data: movimientos = [] } = useQuery({ queryKey: ['movimientos'], queryFn: () => base44.entities.Movimiento.list('-fecha', 5000), staleTime: 5 * 60_000 });
  const { data: consumidores = [] } = useQuery({ queryKey: ['consumidores'], queryFn: () => base44.entities.Consumidor.list() });
  const { data: combustibles = [] } = useQuery({ queryKey: ['combustibles'], queryFn: () => base44.entities.TipoCombustible.list(), staleTime: 5 * 60_000 });
  const { data: tarjetas = [] } = useQuery({ queryKey: ['tarjetas'], queryFn: () => base44.entities.Tarjeta.list(), staleTime: 5 * 60_000 });

  const ventasPendientes = ventasRaw.filter(v => v.estado === 'PENDIENTE');

  const stockTanques = useMemo(() => {
    const tanques = consumidores.filter(esTanqueBonificacion)
      .filter(t => !(t.nombre || '').toLowerCase().match(/refiner[íi]a/));
    return tanques.flatMap(t => {
      const combsDelTanque = t.combustible_id
        ? combustibles.filter(c => c.id === t.combustible_id)
        : (() => {
            const admitidos = t.datos_tanque?.combustibles_admitidos ?? [];
            if (admitidos.length) return combustibles.filter(c => admitidos.some(a => a === c.nombre || a === c.id));
            return combustibles.filter(c => c.activa !== false);
          })();
      return combsDelTanque.map(c => ({
        tanqueId: t.id,
        tanqueNombre: t.nombre,
        codigoInterno: t.codigo_interno || null,
        combustibleId: c.id,
        combustibleNombre: c.nombre,
        ...calcStockTanque(t, c.nombre, c.id, movimientos, ventasPendientes, tarjetas),
      }));
    });
  }, [consumidores, combustibles, movimientos, ventasPendientes, tarjetas]);

  const eliminarMut = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('venta_trabajador').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ventas'] });
      toast.success('Registro eliminado');
      setToEliminar(null);
    },
    onError: (e) => toast.error(e.message ?? 'Error al eliminar'),
  });

  const transicionMut = useMutation({
    mutationFn: async ({ venta, nuevoEstado, precio_venta_unitario }) => {
      const updates = { estado: nuevoEstado };
      // Crear DESPACHO al entregar, o al pagar directamente desde PENDIENTE (entrega+cobro simultáneo)
      const needsDespacho = nuevoEstado === 'ENTREGADO' ||
        (nuevoEstado === 'PAGADO_FINALIZADO' && venta.estado === 'PENDIENTE');
      if (needsDespacho) {
        updates.fecha_retiro = new Date().toISOString().slice(0, 10);
        const logistConsumidor = consumidores.find(c =>
          (c.nombre || '').toLowerCase().includes('logist') && c.combustible_id === venta.combustible_id
        ) ?? consumidores.find(c =>
          (c.nombre || '').toLowerCase().includes('logist') &&
          (c.combustible_nombre || '').toLowerCase() === (venta.combustible_nombre || '').toLowerCase()
        ) ?? consumidores.find(c => (c.nombre || '').toLowerCase().includes('logist'));
        const { data: mov, error: movErr } = await supabase
          .from('movimiento')
          .insert({
            tipo: 'DESPACHO',
            fecha: updates.fecha_retiro,
            consumidor_origen_id: venta.tanque_origen_id,
            consumidor_origen_nombre: venta.tanque_origen_nombre,
            vehiculo_origen_chapa: venta.tanque_origen_nombre,
            vehiculo_origen_alias: venta.tanque_origen_nombre,
            consumidor_id: logistConsumidor?.id ?? null,
            consumidor_nombre: logistConsumidor?.nombre ?? 'Uso Logístico',
            vehiculo_chapa: logistConsumidor?.codigo_interno ?? null,
            vehiculo_alias: logistConsumidor?.nombre ?? null,
            combustible_id: venta.combustible_id,
            combustible_nombre: venta.combustible_nombre,
            litros: venta.litros,
            precio: venta.precio_por_litro,
            monto: venta.monto,
            referencia: `Bonificación combustible: ${venta.beneficiario_nombre}${venta.beneficiario_ci ? ' CI:' + venta.beneficiario_ci : ''}`,
          })
          .select('id')
          .single();
        if (movErr) throw movErr;
        updates.movimiento_id = mov.id;
      }
      if (nuevoEstado === 'PAGADO_FINALIZADO') {
        updates.fecha_pago = new Date().toISOString().slice(0, 10);
        updates.cobrado_por = user?.id ?? null;
        if (precio_venta_unitario) {
          updates.precio_venta_unitario = precio_venta_unitario;
          updates.monto = +(precio_venta_unitario * venta.litros).toFixed(4);
        }
      }
      // Al cancelar: limpiar la referencia al movimiento antes de borrarlo
      const movToDelete = (nuevoEstado === 'CANCELADO' && venta.movimiento_id) ? venta.movimiento_id : null;
      if (movToDelete) updates.movimiento_id = null;
      const { error } = await supabase
        .from('venta_trabajador')
        .update(updates)
        .eq('id', venta.id);
      if (error) throw error;
      // Borrar el DESPACHO generado — el stock vuelve al tanque origen
      if (movToDelete) {
        const { error: delErr } = await supabase.from('movimiento').delete().eq('id', movToDelete);
        if (delErr) throw delErr;
      }
    },
    onSuccess: (_, { nuevoEstado }) => {
      qc.invalidateQueries({ queryKey: ['ventas'] });
      qc.invalidateQueries({ queryKey: ['movimientos'] });
      const msgs = {
        ENTREGADO:         'Marcado como entregado — se registró el despacho',
        PAGADO_FINALIZADO: 'Pagado y finalizado — despacho registrado',
        CANCELADO:         'Bonificación cancelada',
        PENDIENTE:         'Revertido a pendiente',
      };
      toast.success(msgs[nuevoEstado] ?? 'Estado actualizado');
    },
    onError: (e) => {
      qc.invalidateQueries({ queryKey: ['ventas'] });
      qc.invalidateQueries({ queryKey: ['movimientos'] });
      toast.error(e.message ?? 'Error al actualizar');
    },
  });

  const ventasHistorialBase = useMemo(() => {
    return ventasRaw.filter(v => {
      if (filtroMes && !v.fecha_venta.startsWith(filtroMes)) return false;
      if (filtroBen && !(v.beneficiario_nombre ?? '').toLowerCase().includes(filtroBen.toLowerCase())) return false;
      return true;
    });
  }, [ventasRaw, filtroMes, filtroBen]);

  const ventasHistorial = useMemo(() => {
    if (filtroEstado === 'all') return ventasHistorialBase;
    return ventasHistorialBase.filter(v => normalizeEstado(v.estado) === filtroEstado);
  }, [ventasHistorialBase, filtroEstado]);

  const kpis = useMemo(() => {
    const mes = ventasRaw.filter(v => v.fecha_venta.startsWith(filtroMes));
    return {
      total:      mes.length,
      pendientes: mes.filter(v => v.estado === 'PENDIENTE').length,
      litros:     mes.reduce((s, v) => s + (v.litros || 0), 0),
      monto:      mes.filter(v => v.estado !== 'CANCELADO' && v.estado !== 'ANULADO').reduce((s, v) => s + (v.monto || 0), 0),
    };
  }, [ventasRaw, filtroMes]);

  const ventasBloqueadas = useMemo(() =>
    ventasHistorialBase.filter(v => {
      if (normalizeEstado(v.estado) !== 'PENDIENTE') return false;
      const ts = stockTanques.find(t => t.tanqueId === v.tanque_origen_id && t.combustibleId === v.combustible_id);
      return ts != null && ts.stockReal !== undefined && ts.stockReal < v.litros;
    }), [ventasHistorialBase, stockTanques]);

  if (!canVerVentas) {
    return (
      <div className="py-20 text-center space-y-3">
        <Droplets className="w-10 h-10 text-slate-300 mx-auto" />
        <p className="text-slate-400 text-sm">Acceso restringido.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center shadow-md">
            <Droplets className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 leading-tight">Bonificación de Combustible</h1>
            <p className="text-xs text-slate-400 mt-0.5">Beneficio laboral de combustible al personal</p>
          </div>
        </div>
        <div className="flex gap-2">
          {canGestionarBeneficiarios && (
            <Button size="sm" variant="outline" className="h-9 text-sm gap-1.5" onClick={() => setShowBeneficiarios(true)}>
              <Users className="w-4 h-4" /> Trabajadores
            </Button>
          )}
          {canRegistrarVentas && (
            <Button size="sm" className="h-9 text-sm gap-1.5 bg-rose-600 hover:bg-rose-700 shadow-sm" onClick={() => setShowFormVenta(true)}>
              <Plus className="w-4 h-4" /> Nueva bonificación
            </Button>
          )}
        </div>
      </div>

      {/* Selector de mes + KPIs */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
          <Input type="month" className="h-8 text-xs w-36" value={filtroMes}
            onChange={e => setFiltroMes(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Bonificaciones', value: kpis.total,                    icon: ListFilter, iconCls: 'text-slate-600 bg-slate-100 dark:bg-slate-700',  valueCls: '' },
            { label: 'Pendientes',     value: kpis.pendientes,               icon: Clock,      iconCls: kpis.pendientes > 0 ? 'text-amber-600 bg-amber-50 dark:bg-amber-900/40' : 'text-slate-500 bg-slate-100 dark:bg-slate-700', valueCls: kpis.pendientes > 0 ? 'text-amber-700 dark:text-amber-400' : '' },
            { label: 'Litros',         value: `${kpis.litros.toFixed(1)} L`, icon: Fuel,       iconCls: 'text-sky-600 bg-sky-50 dark:bg-sky-900/40',       valueCls: 'text-sky-700 dark:text-sky-400' },
            ...(canVerPrecios ? [{ label: 'Monto total', value: formatMonto(kpis.monto), icon: TrendingUp, iconCls: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/40', valueCls: 'text-emerald-700 dark:text-emerald-400' }] : []),
          ].map(k => {
            const Icon = k.icon;
            return (
              <Card key={k.label} className="border-0 shadow-sm">
                <CardContent className="p-3 flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${k.iconCls}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide">{k.label}</p>
                    <p className={`text-sm font-bold truncate ${k.valueCls || 'text-slate-800 dark:text-slate-100'}`}>{k.value}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Stock por tanque */}
      {stockTanques.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Fuel className="w-3 h-3" /> Stock disponible para bonificación
          </p>
          <div className="flex flex-wrap gap-2">
            {stockTanques.map(t => {
              const s = t.stock ?? 0;
              const color = s <= 30 ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/30 dark:border-red-800 dark:text-red-400'
                : s <= 100 ? 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/30 dark:border-amber-800 dark:text-amber-400'
                : 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-400';
              const dot = s <= 30 ? 'bg-red-400' : s <= 100 ? 'bg-amber-400' : 'bg-emerald-400';
              const fmtL = n => (n % 1 === 0 ? String(Math.round(n)) : n.toFixed(1));
              return (
                <div key={`${t.tanqueId}-${t.combustibleId}`}
                  className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-medium ${color}`}>
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
                  <span className="truncate max-w-[120px]">{t.tanqueNombre}{t.codigoInterno ? ` · ${t.codigoInterno}` : ''}</span>
                  <span className="opacity-60">·</span>
                  <span>{t.combustibleNombre}</span>
                  <span className="opacity-60">·</span>
                  <span className="font-bold tabular-nums">{fmtL(s)} L</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {ventasBloqueadas.length > 0 && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-red-700">
              {ventasBloqueadas.length === 1
                ? '1 bonificación bloqueada'
                : `${ventasBloqueadas.length} bonificaciones bloqueadas`} por stock insuficiente
            </p>
            <p className="text-xs text-red-400 mt-0.5 truncate">
              {ventasBloqueadas.map(b => `${b.beneficiario_nombre} (${b.litros} L)`).join(' · ')}
            </p>
            <p className="text-xs text-red-300 mt-1">Registra una COMPRA para el tanque de origen y podrás procesar estas bonificaciones.</p>
          </div>
        </div>
      )}

      <Card className="border border-slate-100 shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="px-4 pt-3 pb-0 border-b border-slate-200 dark:border-slate-700">
          {/* Tabs por estado */}
          <div className="flex gap-0.5 flex-wrap">
            {FILTRO_ESTADOS.map(fe => {
              const count = fe.value === 'all'
                ? ventasHistorialBase.length
                : ventasHistorialBase.filter(v => normalizeEstado(v.estado) === fe.value).length;
              const isActive = filtroEstado === fe.value;
              return (
                <button key={fe.value} onClick={() => setFiltroEstado(fe.value)}
                  className={`px-3 py-2 text-xs font-medium rounded-t border-b-2 transition-colors -mb-px ${
                    isActive
                      ? 'border-rose-500 text-rose-600 dark:text-rose-400 bg-white dark:bg-slate-900'
                      : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}>
                  {fe.label}
                  {count > 0 && (
                    <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-normal ${
                      isActive ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                    }`}>{count}</span>
                  )}
                </button>
              );
            })}
          </div>
          {/* Búsqueda */}
          <div className="flex gap-2 items-center py-2.5">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <Input
              className="h-8 text-sm border-0 shadow-none p-0 focus-visible:ring-0 flex-1 bg-transparent placeholder:text-slate-300"
              placeholder="Buscar trabajador…"
              value={filtroBen} onChange={e => setFiltroBen(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-12 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>
          ) : ventasHistorial.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10">
              {filtroEstado !== 'all' ? `Sin bonificaciones con estado "${FILTRO_ESTADOS.find(e => e.value === filtroEstado)?.label}".` : 'Sin bonificaciones en este período.'}
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {ventasHistorial.map(v => (
                <VentaRow key={v.id} v={v}
                  canOperar={canManageFinanzas || isCajero}
                  canDelete={isSuperAdmin}
                  canEditar={canEditar}
                  stockInsuficiente={stockTanques.some(t =>
                    t.tanqueId === v.tanque_origen_id &&
                    t.combustibleId === v.combustible_id &&
                    t.stockReal !== undefined && t.stockReal < v.litros
                  )}
                  onCambiarEstado={(nuevoEstado) => {
                    const needsDespacho = nuevoEstado === 'ENTREGADO' ||
                      (nuevoEstado === 'PAGADO_FINALIZADO' && v.estado === 'PENDIENTE');
                    if (needsDespacho) {
                      const ts = stockTanques.find(t =>
                        t.tanqueId === v.tanque_origen_id && t.combustibleId === v.combustible_id
                      );
                      if (ts && ts.stockReal !== undefined && ts.stockReal < v.litros) {
                        toast.error(
                          `Sin stock en "${ts.tanqueNombre}": disponible ${Math.max(0, ts.stockReal).toFixed(1)} L — necesita ${v.litros} L. Registra una COMPRA para reponer.`
                        );
                        return;
                      }
                    }
                    if (nuevoEstado === 'PAGADO_FINALIZADO') {
                      setPrecioVentaInput(v.precio_por_litro ? String(v.precio_por_litro) : '');
                      setToCobrar(v);
                    } else {
                      transicionMut.mutate({ venta: v, nuevoEstado });
                    }
                  }}
                  onDelete={() => setToEliminar(v)}
                  onEdit={() => setToEditar(v)}
                  loading={transicionMut.isPending}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal nueva bonificación */}
      <Dialog open={showFormVenta} onOpenChange={setShowFormVenta}>
        <DialogContent className="max-w-md overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center shrink-0">
                <Droplets className="w-3.5 h-3.5 text-white" />
              </div>
              Registrar bonificación de combustible
            </DialogTitle>
          </DialogHeader>
          <FormBonificacion onClose={() => setShowFormVenta(false)} ventasPendientes={ventasPendientes} ventasRaw={ventasRaw} />
        </DialogContent>
      </Dialog>

      {/* Modal trabajadores */}
      <Dialog open={showBeneficiarios} onOpenChange={setShowBeneficiarios}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="text-base flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                <Users className="w-3.5 h-3.5 text-slate-500" />
              </div>
              Trabajadores beneficiarios
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto min-h-0 pr-1">
            <PanelBeneficiarios onClose={() => setShowBeneficiarios(false)} />
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal editar bonificación */}
      <Dialog open={!!toEditar} onOpenChange={open => { if (!open) setToEditar(null); }}>
        <DialogContent className="max-w-md overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center shrink-0">
                <Pencil className="w-3.5 h-3.5 text-white" />
              </div>
              Editar bonificación
            </DialogTitle>
          </DialogHeader>
          {toEditar && <FormEditBonificacion venta={toEditar} onClose={() => setToEditar(null)} />}
        </DialogContent>
      </Dialog>

      {/* Dialog cobro con precio de venta */}
      <Dialog open={!!toCobrar} onOpenChange={open => { if (!open) setToCobrar(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              Registrar cobro
            </DialogTitle>
          </DialogHeader>
          {toCobrar && (
            <div className="space-y-4 py-1">
              <p className="text-sm text-slate-600">
                <span className="font-medium">{toCobrar.beneficiario_nombre}</span> — {toCobrar.litros} L de {toCobrar.combustible_nombre}
              </p>
              <div>
                <Label className="text-xs text-slate-500 font-medium block mb-1">Precio de venta / L</Label>
                <Input
                  type="number"
                  step="0.0001"
                  min="0"
                  placeholder="Ej: 30.0000"
                  className="h-9 text-sm"
                  value={precioVentaInput}
                  onChange={e => setPrecioVentaInput(e.target.value)}
                  autoFocus
                />
                {precioVentaInput && !isNaN(+precioVentaInput) && +precioVentaInput > 0 && (
                  <p className="text-xs text-emerald-700 mt-1 font-medium">
                    Monto: {formatMonto(+precioVentaInput * toCobrar.litros)} {toCobrar.moneda}
                  </p>
                )}
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setToCobrar(null)}>Cancelar</Button>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={transicionMut.isPending || !precioVentaInput || isNaN(+precioVentaInput) || +precioVentaInput <= 0}
              onClick={() => {
                transicionMut.mutate({
                  venta: toCobrar,
                  nuevoEstado: 'PAGADO_FINALIZADO',
                  precio_venta_unitario: +precioVentaInput,
                });
                setToCobrar(null);
              }}
            >
              {transicionMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar cobro'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar eliminación */}
      {toEliminar && (
        <ConfirmDialog open
          title="Eliminar bonificación"
          description={`¿Eliminar definitivamente el registro de ${toEliminar.litros} L a ${toEliminar.beneficiario_nombre}? Esta acción no se puede deshacer.`}
          onConfirm={() => eliminarMut.mutate(toEliminar.id)}
          onCancel={() => setToEliminar(null)}
          loading={eliminarMut.isPending}
        />
      )}

    </div>
  );
}
