import React, { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUserRole } from '@/components/ui-helpers/useUserRole';
import { computeChoferDelMes, getMonthOptionsFromMovimientos } from '@/lib/fuel-analytics';
import TiposConsumidorPanel, { IconoComp } from '@/components/configuracion/TiposConsumidorPanel';
import ConsumidorForm from '@/components/consumidores/ConsumidorForm';
import ConfirmDialog from '@/components/ui-helpers/ConfirmDialog';
import StatusBadge from '@/components/ui-helpers/StatusBadge';
import CombustibleBadge from '@/components/ui-helpers/CombustibleBadge';
import { formatMonto } from '@/components/ui-helpers/SaldoUtils';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Plus, Pencil, Power, Trash2, UserCheck, AlertTriangle, CreditCard,
  Fuel, DollarSign, ListTree, ChevronDown, ChevronUp, Loader2, Trophy,
  Settings, Search, Users, Warehouse, MapPin,
} from 'lucide-react';

const emptyConsumidorForm = {
  tipo_consumidor_id: '', tipo_consumidor_nombre: '',
  nombre: '', codigo_interno: '',
  combustible_id: '', combustible_nombre: '',
  activo: true, responsable: '', conductor: '', conductor_id: '',
  ayudante: '', ayudante_id: '',
  funcion: '', observaciones: '',
  litros_iniciales: 0,
  datos_vehiculo: {}, datos_tanque: {}, datos_equipo: {},
};

function getLicenciaStatus(vencimiento) {
  if (!vencimiento) return null;
  const hoy = new Date();
  const vence = new Date(vencimiento);
  const dias = Math.floor((vence - hoy) / (1000 * 60 * 60 * 24));
  if (dias < 0)   return { tipo: 'vencida', label: 'Vencida',           dias: Math.abs(dias), color: 'bg-red-50 text-red-700 border-red-200' };
  if (dias <= 30) return { tipo: 'critico', label: `Vence en ${dias}d`, dias,                 color: 'bg-red-50 text-red-700 border-red-200' };
  if (dias <= 90) return { tipo: 'alerta',  label: `Vence en ${dias}d`, dias,                 color: 'bg-amber-50 text-amber-700 border-amber-200' };
  return { tipo: 'ok', label: 'Vigente', dias, color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
}

const emptyConductorForm = {
  nombre: '', ci: '', telefono: '', email: '',
  licencia_numero: '', licencia_categoria: '', licencia_vencimiento: '',
  vehiculo_asignado_id: '', vehiculo_asignado_chapa: '',
  area_centro: '', activo: true, observaciones: '',
};

// ── TAB CONSUMIDORES ──────────────────────────────────────────────────────────

function ConsumidorRow({ c, tipos, canWrite, canDelete, onEdit, onToggle, onDelete }) {
  const tipo = tipos.find(t => t.id === c.tipo_consumidor_id);
  return (
    <Card className={`border-0 shadow-sm ${!c.activo ? 'opacity-60' : ''}`}>
      <CardContent className="p-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-sky-50 flex items-center justify-center shrink-0">
          <IconoComp icono={tipo?.icono} className="w-4 h-4 text-sky-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-700 truncate">{c.nombre}</span>
            {c.codigo_interno && <span className="font-mono text-xs text-slate-500">{c.codigo_interno}</span>}
            <StatusBadge active={c.activo !== false} />
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {c.tipo_consumidor_nombre || tipo?.nombre || '—'}
            </Badge>
            {c.combustible_nombre && <CombustibleBadge nombre={c.combustible_nombre} />}
            {c.responsable && <span className="text-[11px] text-slate-400 truncate">{c.responsable}</span>}
            {c.datos_vehiculo?.estado_vehiculo && c.datos_vehiculo.estado_vehiculo !== 'Operativo' && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-200 text-amber-700">
                {c.datos_vehiculo.estado_vehiculo}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          {canWrite  && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(c)}><Pencil className="w-3.5 h-3.5" /></Button>}
          {canWrite  && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onToggle(c)}><Power className={`w-3.5 h-3.5 ${c.activo !== false ? 'text-emerald-500' : 'text-slate-300'}`} /></Button>}
          {canDelete && <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-red-500" onClick={() => onDelete(c)}><Trash2 className="w-3.5 h-3.5" /></Button>}
        </div>
      </CardContent>
    </Card>
  );
}

function TabConsumidores({ canWrite, canDelete }) {
  const qc = useQueryClient();
  const { data: consumidores = [], isLoading } = useQuery({ queryKey: ['consumidores'],    queryFn: () => base44.entities.Consumidor.list() });
  const { data: tipos        = []             } = useQuery({ queryKey: ['tipos_consumidor'], queryFn: () => base44.entities.TipoConsumidor.list() });
  const { data: combustibles = []             } = useQuery({ queryKey: ['combustibles'],     queryFn: () => base44.entities.TipoCombustible.list() });
  const { data: conductores  = []             } = useQuery({ queryKey: ['conductores'],      queryFn: () => base44.entities.Conductor.list() });
  const { data: tarjetas     = []             } = useQuery({ queryKey: ['tarjetas'],         queryFn: () => base44.entities.Tarjeta.list() });

  const [tabTipo, setTabTipo]       = useState('all');
  const [filterActivo, setFilter]   = useState('activos');
  const [search, setSearch]         = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing]       = useState(null);
  const [form, setForm]             = useState(emptyConsumidorForm);
  const [confirmDel, setConfirmDel] = useState(null);

  const createMut = useMutation({
    mutationFn: d => base44.entities.Consumidor.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['consumidores'] }); toast.success('Consumidor creado'); closeDialog(); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, d }) => base44.entities.Consumidor.update(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['consumidores'] }); toast.success('Actualizado'); closeDialog(); },
  });
  const deleteMut = useMutation({
    mutationFn: id => base44.entities.Consumidor.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['consumidores'] }); toast.success('Eliminado'); setConfirmDel(null); },
  });

  const closeDialog = () => { setDialogOpen(false); setEditing(null); setForm(emptyConsumidorForm); };

  const openEdit = c => {
    setEditing(c);
    setForm({
      tipo_consumidor_id: c.tipo_consumidor_id || '',
      tipo_consumidor_nombre: c.tipo_consumidor_nombre || '',
      nombre: c.nombre || '',
      codigo_interno: c.codigo_interno || '',
      combustible_id: c.combustible_id || '',
      combustible_nombre: c.combustible_nombre || '',
      activo: c.activo !== false,
      responsable: c.responsable || '',
      conductor: c.conductor || '',
      conductor_id: c.conductor_id || '',
      ayudante: c.ayudante || '',
      ayudante_id: c.ayudante_id || '',
      funcion: c.funcion || '',
      observaciones: c.observaciones || '',
      litros_iniciales: Number.isFinite(Number(c.litros_iniciales)) ? Number(c.litros_iniciales) : 0,
      datos_vehiculo: c.datos_vehiculo || {},
      datos_tanque: c.datos_tanque || {},
      datos_equipo: c.datos_equipo || {},
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.tipo_consumidor_id)   { toast.error('Seleccione un tipo de consumidor'); return; }
    if (!form.nombre.trim())        { toast.error('Nombre requerido'); return; }
    if (!form.combustible_id)       { toast.error('Combustible principal requerido'); return; }
    const tipoNombre = (form.tipo_consumidor_nombre || '').toLowerCase();
    if (tipoNombre.includes('veh') && !form.codigo_interno?.trim()) { toast.error('Chapa / Código interno requerido para vehículos'); return; }
    if (tipoNombre.includes('veh') && !form.responsable?.trim())    { toast.error('Responsable requerido para vehículos'); return; }
    if (form.litros_iniciales === '' || Number.isNaN(Number(form.litros_iniciales)) || Number(form.litros_iniciales) < 0) {
      toast.error('Litros iniciales inválidos'); return;
    }
    const { conductor_id, ayudante_id, ayudante, ...baseForm } = form;
    const payload = {
      ...baseForm,
      litros_iniciales: Number(form.litros_iniciales),
      ...(conductor_id    ? { conductor_id }                    : {}),
      ...(form.conductor  ? { conductor: form.conductor }       : {}),
      ...(ayudante_id     ? { ayudante_id }                     : {}),
      ...(ayudante        ? { ayudante }                        : {}),
    };
    editing ? updateMut.mutate({ id: editing.id, d: payload }) : createMut.mutate(payload);
  };

  const toggleActivo = c => updateMut.mutate({ id: c.id, d: { activo: !c.activo } });

  // Mostrar solo consumidores (vehículos, equipos, autorizo) — no depósitos ni surtidores
  const esConsumidor = (c) => {
    if (c.categoria) return c.categoria === 'consumidor';
    const n = (c.tipo_consumidor_nombre || '').toLowerCase();
    return !n.includes('tanque') && !n.includes('reserva') && !n.includes('surtidor');
  };

  const applyFilters = (list) => list.filter(c => {
    if (filterActivo === 'activos'   && !c.activo) return false;
    if (filterActivo === 'inactivos' &&  c.activo) return false;
    if (search && !`${c.nombre} ${c.codigo_interno || ''} ${c.tipo_consumidor_nombre || ''}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Solo mostrar sub-pestañas de tipos que tengan al menos un consumidor real
  const tiposIdsConDatos = useMemo(
    () => new Set(consumidores.filter(esConsumidor).map(c => c.tipo_consumidor_id)),
    [consumidores],
  );
  const tiposConsumidor = useMemo(
    () => tipos.filter(t => t.activo !== false && tiposIdsConDatos.has(t.id)),
    [tipos, tiposIdsConDatos],
  );

  const consumidoresReales = useMemo(
    () => applyFilters(consumidores.filter(esConsumidor)),
    [consumidores, filterActivo, search],
  );
  const filteredByTab = useMemo(
    () => tabTipo === 'all' ? consumidoresReales : consumidoresReales.filter(c => c.tipo_consumidor_id === tabTipo),
    [consumidoresReales, tabTipo],
  );
  const tabCounts = useMemo(() => {
    const map = {};
    consumidoresReales.forEach(c => { map[c.tipo_consumidor_id] = (map[c.tipo_consumidor_id] || 0) + 1; });
    return map;
  }, [consumidoresReales]);

  return (
    <div className="space-y-4">
      {/* Barra de acciones */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="pl-8 h-8 text-sm w-44" />
          </div>
          <div className="flex gap-0.5 rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-800/60">
            {[['all', 'Todos'], ['activos', 'Activos'], ['inactivos', 'Inactivos']].map(([v, label]) => (
              <button key={v} onClick={() => setFilter(v)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${filterActivo === v ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-800 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {canWrite && (
          <Button size="sm" className="gap-1.5 bg-sky-600 hover:bg-sky-700"
            onClick={() => { setForm(emptyConsumidorForm); setEditing(null); setDialogOpen(true); }}>
            <Plus className="w-3.5 h-3.5" /> Nuevo
          </Button>
        )}
      </div>

      {/* Sub-tabs por tipo */}
      <div className="flex gap-0.5 flex-wrap border-b border-slate-200 dark:border-slate-700">
        <button onClick={() => setTabTipo('all')}
          className={`px-3 py-2 text-xs font-medium rounded-t border-b-2 transition-colors -mb-px ${tabTipo === 'all' ? 'border-sky-500 text-sky-700 dark:text-sky-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}>
          Todos
          <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${tabTipo === 'all' ? 'bg-sky-100 dark:bg-sky-900/60 text-sky-600' : 'bg-slate-100 text-slate-500'}`}>
            {consumidoresReales.length}
          </span>
        </button>
        {tiposConsumidor.map(t => (
          <button key={t.id} onClick={() => setTabTipo(t.id)}
            className={`px-3 py-2 text-xs font-medium rounded-t border-b-2 transition-colors -mb-px ${tabTipo === t.id ? 'border-sky-500 text-sky-700 dark:text-sky-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}>
            {t.nombre}
            {tabCounts[t.id] > 0 && (
              <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${tabTipo === t.id ? 'bg-sky-100 text-sky-600' : 'bg-slate-100 text-slate-500'}`}>
                {tabCounts[t.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="grid gap-2">
        {isLoading && <p className="text-sm text-slate-400 text-center py-8">Cargando...</p>}
        {!isLoading && filteredByTab.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-8">No hay consumidores en esta categoría</p>
        )}
        {filteredByTab.map(c => (
          <ConsumidorRow key={c.id} c={c} tipos={tipos} canWrite={canWrite} canDelete={canDelete}
            onEdit={openEdit} onToggle={toggleActivo} onDelete={setConfirmDel} />
        ))}
      </div>

      {/* Dialog crear/editar */}
      <Dialog open={dialogOpen} onOpenChange={closeDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar consumidor' : 'Nuevo consumidor'}</DialogTitle>
          </DialogHeader>
          <ConsumidorForm
            form={form} setForm={setForm}
            tipos={tipos} combustibles={combustibles}
            editingTipo={editing?.tipo_consumidor_nombre}
            conductores={conductores} tarjetas={tarjetas}
          />
          <DialogFooter className="mt-4">
            <Button variant="outline" size="sm" onClick={closeDialog}>Cancelar</Button>
            <Button size="sm" onClick={handleSave} disabled={createMut.isPending || updateMut.isPending} className="bg-sky-600 hover:bg-sky-700">
              {(createMut.isPending || updateMut.isPending) && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!confirmDel} onOpenChange={() => setConfirmDel(null)}
        title="Eliminar consumidor" description={`¿Eliminar "${confirmDel?.nombre}"? Esta acción no se puede deshacer.`}
        onConfirm={() => deleteMut.mutate(confirmDel.id)} destructive />
    </div>
  );
}

// ── TAB CONDUCTORES ───────────────────────────────────────────────────────────

function TabConductores({ canDelete }) {
  const qc = useQueryClient();
  const { data: conductores = []  } = useQuery({ queryKey: ['conductores'],  queryFn: () => base44.entities.Conductor.list() });
  const { data: consumidores = []  } = useQuery({ queryKey: ['consumidores'], queryFn: () => base44.entities.Consumidor.list() });
  const { data: movimientos = []   } = useQuery({ queryKey: ['movimientos'],  queryFn: () => base44.entities.Movimiento.list('-fecha', 1000) });

  const [dialogOpen, setDialogOpen]             = useState(false);
  const [editing, setEditing]                   = useState(null);
  const [form, setForm]                         = useState(emptyConductorForm);
  const [confirmAction, setConfirmAction]       = useState(null);
  const [historialId, setHistorialId]           = useState(null);
  const [mesFiltro, setMesFiltro]               = useState('ALL');

  const vehiculosActivos = useMemo(
    () => consumidores.filter(c => c.activo !== false && (c.tipo_consumidor_nombre || '').toLowerCase().includes('veh')),
    [consumidores],
  );

  const opcionesMes  = useMemo(() => getMonthOptionsFromMovimientos(movimientos), [movimientos]);
  const choferDelMes = useMemo(
    () => computeChoferDelMes({ month: mesFiltro, movimientos, conductores }),
    [mesFiltro, movimientos, conductores],
  );

  const createMut = useMutation({
    mutationFn: (d) => base44.entities.Conductor.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['conductores'] }); toast.success('Conductor creado'); closeDialog(); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, d }) => base44.entities.Conductor.update(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['conductores'] }); toast.success('Conductor actualizado'); closeDialog(); },
  });
  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.Conductor.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['conductores'] }); toast.success('Conductor eliminado'); setConfirmAction(null); },
  });

  const closeDialog  = () => { setDialogOpen(false); setEditing(null); setForm(emptyConductorForm); };
  const openEdit     = (c) => { setEditing(c); setForm({ ...emptyConductorForm, ...c }); setDialogOpen(true); };
  const toggleActive = (c) => updateMut.mutate({ id: c.id, d: { activo: !c.activo } });

  const handleSave = () => {
    if (!form.nombre.trim()) { toast.error('Nombre requerido'); return; }
    const data = { ...form };
    if (data.vehiculo_asignado_id) {
      const v = consumidores.find(v => v.id === data.vehiculo_asignado_id);
      data.vehiculo_asignado_chapa = v?.codigo_interno || v?.nombre || '';
    } else {
      data.vehiculo_asignado_id    = null;
      data.vehiculo_asignado_chapa = '';
    }
    editing ? updateMut.mutate({ id: editing.id, d: data }) : createMut.mutate(data);
  };

  const alertasLicencia = conductores.filter(c => {
    const s = getLicenciaStatus(c.licencia_vencimiento);
    return s && s.tipo !== 'ok';
  });

  const historialData = useMemo(() => {
    const c = conductores.find(c => c.id === historialId);
    if (!c) return null;
    const vehActual = consumidores.find(v => v.id === c.vehiculo_asignado_id);
    const movsVeh = vehActual
      ? movimientos
          .filter(m => ['COMPRA', 'DESPACHO'].includes(m.tipo) && m.consumidor_id === vehActual.id && m.odometro != null)
          .sort((a, b) => b.odometro - a.odometro)
      : [];
    const maxOdo = movsVeh[0]?.odometro ?? null;
    const minOdo = movsVeh[movsVeh.length - 1]?.odometro ?? null;
    return { c, vehActual, movsVeh, maxOdo, kmRecorridos: (maxOdo != null && minOdo != null) ? maxOdo - minOdo : null };
  }, [historialId, conductores, consumidores, movimientos]);

  return (
    <div className="space-y-4">
      {/* Chofer del mes */}
      <div className="flex items-center gap-3">
        <Card className="flex-1 border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
              <Trophy className="w-5 h-5 text-amber-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">Chofer del mes</p>
              {choferDelMes ? (
                <>
                  <p className="text-sm font-bold text-slate-800 truncate">{choferDelMes.conductor.nombre}</p>
                  <p className="text-xs text-slate-400">{choferDelMes.litros.toFixed(1)} L · {choferDelMes.movimientos} movimientos</p>
                </>
              ) : (
                <p className="text-sm text-slate-400">Sin datos para el período</p>
              )}
            </div>
          </CardContent>
        </Card>
        <div className="flex items-center gap-2 shrink-0">
          <Select value={mesFiltro} onValueChange={setMesFiltro}>
            <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Mes" /></SelectTrigger>
            <SelectContent>
              {opcionesMes.map(o => <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" className="gap-1.5 bg-sky-600 hover:bg-sky-700 shrink-0"
            onClick={() => { setForm(emptyConductorForm); setEditing(null); setDialogOpen(true); }}>
            <Plus className="w-4 h-4" /> Nuevo
          </Button>
        </div>
      </div>

      {/* Alertas licencias */}
      {alertasLicencia.length > 0 && (
        <div className="space-y-1.5">
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

      {/* Lista */}
      <div className="grid gap-3">
        {conductores.map(c => {
          const licStatus = getLicenciaStatus(c.licencia_vencimiento);
          const veh = consumidores.find(v => v.id === c.vehiculo_asignado_id);
          return (
            <Card key={c.id} className={`border-0 shadow-sm ${!c.activo ? 'opacity-60' : ''}`}>
              <CardContent className="p-4 flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center shrink-0 mt-0.5">
                  <UserCheck className="w-5 h-5 text-sky-600" />
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
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-400">
                    {c.ci       && <span>CI: {c.ci}</span>}
                    {c.telefono && <span>📞 {c.telefono}</span>}
                    {c.licencia_numero && <span>Lic: {c.licencia_numero}{c.licencia_categoria ? ` (Cat. ${c.licencia_categoria})` : ''}</span>}
                    {(veh || c.vehiculo_asignado_chapa) && (
                      <span className="font-medium text-slate-600">🚗 {veh ? (veh.codigo_interno || veh.nombre) : c.vehiculo_asignado_chapa}</span>
                    )}
                    {c.area_centro && <span>{c.area_centro}</span>}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-8 w-8" title="Ficha" onClick={() => setHistorialId(c.id)}>
                    <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleActive(c)}>
                    <Power className={`w-3.5 h-3.5 ${c.activo ? 'text-emerald-500' : 'text-slate-300'}`} />
                  </Button>
                  {canDelete && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-red-500"
                      onClick={() => setConfirmAction({ id: c.id, title: 'Eliminar conductor', desc: `¿Eliminar a "${c.nombre}"?` })}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {conductores.length === 0 && <p className="text-sm text-slate-400 text-center py-12">No hay conductores registrados</p>}
      </div>

      {/* Dialog crear/editar */}
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
                  <Label className="text-xs text-slate-500">Área / Centro</Label>
                  <Input value={form.area_centro} onChange={e => setForm(f => ({ ...f, area_centro: e.target.value }))} placeholder="Dpto. Transporte" className="mt-1" />
                </div>
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Licencia de Conducir</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-slate-500">Número</Label>
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
                      <p className={`text-xs mt-1 flex items-center gap-1 ${s.tipo !== 'alerta' ? 'text-red-500' : 'text-amber-500'}`}>
                        <AlertTriangle className="w-3 h-3" />
                        {s.tipo === 'vencida' ? `Vencida hace ${s.dias} días` : `Vence en ${s.dias} días`}
                      </p>
                    );
                  })()}
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
                    <SelectItem key={v.id} value={v.id}>{v.codigo_interno ? `${v.codigo_interno} — ${v.nombre}` : v.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs text-slate-500">Observaciones</Label>
              <Input value={form.observaciones} onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} placeholder="Notas adicionales..." className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
            <Button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending} className="bg-sky-600 hover:bg-sky-700">
              {(createMut.isPending || updateMut.isPending) && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ficha del conductor */}
      <Dialog open={!!historialId} onOpenChange={() => setHistorialId(null)}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Ficha del Conductor</DialogTitle></DialogHeader>
          {historialData && (
            <div className="space-y-4 mt-2">
              <div>
                <p className="text-sm font-bold text-slate-800">{historialData.c.nombre}</p>
                {historialData.c.ci && <p className="text-xs text-slate-400">CI: {historialData.c.ci}</p>}
                {historialData.c.telefono && <p className="text-xs text-slate-400">📞 {historialData.c.telefono}</p>}
              </div>
              <div className="bg-sky-50 rounded-xl p-3">
                <p className="text-[10px] font-semibold text-sky-500 uppercase mb-1">Vehículo actual</p>
                {historialData.vehActual ? (
                  <>
                    <p className="text-sm font-semibold text-slate-700">
                      {historialData.vehActual.codigo_interno ? `${historialData.vehActual.codigo_interno} — ` : ''}{historialData.vehActual.nombre}
                    </p>
                    {historialData.maxOdo != null && (
                      <p className="text-xs text-slate-600 mt-1">Odómetro: <b>{historialData.maxOdo.toLocaleString()} km</b></p>
                    )}
                    {historialData.kmRecorridos != null && (
                      <p className="text-xs text-sky-700 font-semibold">Km recorridos: {historialData.kmRecorridos.toLocaleString()} km</p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-slate-400">Sin vehículo asignado</p>
                )}
              </div>
              {historialData.movsVeh.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase mb-2">Historial de cargas (vehículo actual)</p>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {historialData.movsVeh.slice(0, 20).map(m => (
                      <div key={m.id} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-50 last:border-0">
                        <span className="text-slate-400 w-20 shrink-0">{m.fecha}</span>
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

// ── TAB DEPÓSITOS ─────────────────────────────────────────────────────────────

const emptyDepositoForm = {
  nombre: '', codigo_interno: '',
  tipo_consumidor_id: '', tipo_consumidor_nombre: '',
  combustible_id: '', combustible_nombre: '',
  activo: true, observaciones: '',
  litros_iniciales: 0,
  datos_tanque: { capacidad_litros: '', ubicacion: '', stock_minimo: '' },
};

function DepositoRow({ c, combustibles, canWrite, canDelete, onEdit, onToggle, onDelete }) {
  const comb = combustibles.find(cb => cb.id === c.combustible_id);
  return (
    <Card className={`border-0 shadow-sm ${!c.activo ? 'opacity-60' : ''}`}>
      <CardContent className="p-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
          <Warehouse className="w-4 h-4 text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-700 truncate">{c.nombre}</span>
            {c.codigo_interno && <span className="font-mono text-xs text-slate-500">{c.codigo_interno}</span>}
            <StatusBadge active={c.activo !== false} />
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {comb && <CombustibleBadge nombre={comb.nombre} />}
            {c.datos_tanque?.capacidad_litros && (
              <span className="text-[11px] text-slate-400">Cap: {c.datos_tanque.capacidad_litros} L</span>
            )}
            {c.datos_tanque?.ubicacion && (
              <span className="text-[11px] text-slate-400">{c.datos_tanque.ubicacion}</span>
            )}
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          {canWrite  && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(c)}><Pencil className="w-3.5 h-3.5" /></Button>}
          {canWrite  && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onToggle(c)}><Power className={`w-3.5 h-3.5 ${c.activo !== false ? 'text-emerald-500' : 'text-slate-300'}`} /></Button>}
          {canDelete && <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-red-500" onClick={() => onDelete(c)}><Trash2 className="w-3.5 h-3.5" /></Button>}
        </div>
      </CardContent>
    </Card>
  );
}

function TabDepositos({ canWrite, canDelete }) {
  const qc = useQueryClient();
  const { data: consumidores = [], isLoading } = useQuery({ queryKey: ['consumidores'],  queryFn: () => base44.entities.Consumidor.list() });
  const { data: combustibles = []             } = useQuery({ queryKey: ['combustibles'], queryFn: () => base44.entities.TipoCombustible.list() });
  const { data: tiposConsumidor = []          } = useQuery({ queryKey: ['tiposConsumidor'], queryFn: () => base44.entities.TipoConsumidor.list() });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing]       = useState(null);
  const [form, setForm]             = useState(emptyDepositoForm);
  const [confirmDel, setConfirmDel] = useState(null);

  const depositos = useMemo(() =>
    consumidores.filter(c =>
      c.categoria === 'deposito' ||
      (!c.categoria && (c.tipo_consumidor_nombre?.toLowerCase() || '').match(/tanque|reserva/))
    ),
    [consumidores],
  );

  const createMut = useMutation({
    mutationFn: d => base44.entities.Consumidor.create({ ...d, categoria: 'deposito' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['consumidores'] }); toast.success('Depósito creado'); closeDialog(); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, d }) => base44.entities.Consumidor.update(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['consumidores'] }); toast.success('Actualizado'); closeDialog(); },
  });
  const deleteMut = useMutation({
    mutationFn: id => base44.entities.Consumidor.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['consumidores'] }); toast.success('Eliminado'); setConfirmDel(null); },
  });

  const closeDialog = () => { setDialogOpen(false); setEditing(null); setForm(emptyDepositoForm); };

  const openEdit = c => {
    setEditing(c);
    setForm({
      nombre: c.nombre || '',
      codigo_interno: c.codigo_interno || '',
      tipo_consumidor_id: c.tipo_consumidor_id || '',
      tipo_consumidor_nombre: c.tipo_consumidor_nombre || '',
      combustible_id: c.combustible_id || '',
      combustible_nombre: c.combustible_nombre || '',
      activo: c.activo !== false,
      observaciones: c.observaciones || '',
      litros_iniciales: Number.isFinite(Number(c.litros_iniciales)) ? Number(c.litros_iniciales) : 0,
      datos_tanque: {
        capacidad_litros: c.datos_tanque?.capacidad_litros ?? '',
        ubicacion: c.datos_tanque?.ubicacion || '',
        stock_minimo: c.datos_tanque?.stock_minimo ?? '',
      },
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.nombre.trim())        { toast.error('Nombre requerido'); return; }
    if (!form.combustible_id)       { toast.error('Combustible requerido'); return; }
    if (!form.tipo_consumidor_id)   { toast.error('Seleccione un tipo de depósito'); return; }
    const comb = combustibles.find(c => c.id === form.combustible_id);
    const tipo = tiposConsumidor.find(t => t.id === form.tipo_consumidor_id);
    const payload = {
      nombre: form.nombre.trim(),
      codigo_interno: form.codigo_interno || '',
      tipo_consumidor_id: form.tipo_consumidor_id,
      tipo_consumidor_nombre: tipo?.nombre || form.tipo_consumidor_nombre,
      combustible_id: form.combustible_id,
      combustible_nombre: comb?.nombre || form.combustible_nombre,
      activo: form.activo,
      observaciones: form.observaciones || '',
      litros_iniciales: Number(form.litros_iniciales) || 0,
      datos_tanque: {
        capacidad_litros: form.datos_tanque.capacidad_litros !== '' ? Number(form.datos_tanque.capacidad_litros) : null,
        ubicacion: form.datos_tanque.ubicacion || null,
        stock_minimo: form.datos_tanque.stock_minimo !== '' ? Number(form.datos_tanque.stock_minimo) : null,
      },
    };
    editing ? updateMut.mutate({ id: editing.id, d: payload }) : createMut.mutate(payload);
  };

  const toggleActivo = c => updateMut.mutate({ id: c.id, d: { activo: !c.activo } });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {canWrite && (
          <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700"
            onClick={() => { setForm(emptyDepositoForm); setEditing(null); setDialogOpen(true); }}>
            <Plus className="w-3.5 h-3.5" /> Nuevo depósito
          </Button>
        )}
      </div>

      <div className="grid gap-2">
        {isLoading && <p className="text-sm text-slate-400 text-center py-8">Cargando...</p>}
        {!isLoading && depositos.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-8">No hay depósitos registrados</p>
        )}
        {depositos.map(c => (
          <DepositoRow key={c.id} c={c} combustibles={combustibles} canWrite={canWrite} canDelete={canDelete}
            onEdit={openEdit} onToggle={toggleActivo} onDelete={setConfirmDel} />
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={closeDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar depósito' : 'Nuevo depósito'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label className="text-xs text-slate-500">Nombre *</Label>
                <Input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Isotanque principal" className="mt-1" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs text-slate-500">Tipo de depósito *</Label>
                <Select value={form.tipo_consumidor_id} onValueChange={v => setForm(f => ({ ...f, tipo_consumidor_id: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar tipo" /></SelectTrigger>
                  <SelectContent>
                    {tiposConsumidor
                      .filter(t => t.activo !== false && (t.nombre || '').toLowerCase().match(/iso|tanque|reserva|almac/))
                      .map(t => <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-500">Código interno</Label>
                <Input value={form.codigo_interno} onChange={e => setForm(f => ({ ...f, codigo_interno: e.target.value }))} placeholder="TQ-001" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs text-slate-500">Combustible *</Label>
                <Select value={form.combustible_id} onValueChange={v => setForm(f => ({ ...f, combustible_id: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    {combustibles.filter(c => c.activa !== false).map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-500">Capacidad (litros)</Label>
                <Input type="number" min="0" value={form.datos_tanque.capacidad_litros}
                  onChange={e => setForm(f => ({ ...f, datos_tanque: { ...f.datos_tanque, capacidad_litros: e.target.value } }))}
                  placeholder="5000" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs text-slate-500">Stock inicial (litros)</Label>
                <Input type="number" min="0" value={form.litros_iniciales}
                  onChange={e => setForm(f => ({ ...f, litros_iniciales: e.target.value }))}
                  placeholder="0" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs text-slate-500">Stock mínimo (litros)</Label>
                <Input type="number" min="0" value={form.datos_tanque.stock_minimo}
                  onChange={e => setForm(f => ({ ...f, datos_tanque: { ...f.datos_tanque, stock_minimo: e.target.value } }))}
                  placeholder="500" className="mt-1" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs text-slate-500">Ubicación</Label>
                <Input value={form.datos_tanque.ubicacion}
                  onChange={e => setForm(f => ({ ...f, datos_tanque: { ...f.datos_tanque, ubicacion: e.target.value } }))}
                  placeholder="Patio principal, Almacén 2…" className="mt-1" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs text-slate-500">Observaciones</Label>
                <Input value={form.observaciones} onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} placeholder="Notas adicionales..." className="mt-1" />
              </div>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" size="sm" onClick={closeDialog}>Cancelar</Button>
            <Button size="sm" onClick={handleSave} disabled={createMut.isPending || updateMut.isPending} className="bg-blue-600 hover:bg-blue-700">
              {(createMut.isPending || updateMut.isPending) && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!confirmDel} onOpenChange={() => setConfirmDel(null)}
        title="Eliminar depósito" description={`¿Eliminar "${confirmDel?.nombre}"? Esta acción no se puede deshacer.`}
        onConfirm={() => deleteMut.mutate(confirmDel.id)} destructive />
    </div>
  );
}

// ── TAB SURTIDORES ────────────────────────────────────────────────────────────

const emptySurtidorForm = {
  nombre: '', codigo_interno: '',
  combustible_id: '', combustible_nombre: '',
  activo: true, observaciones: '',
  litros_iniciales: 0,
  datos_tanque: { tarjeta_vinculada_id: '', ubicacion: '' },
};

function SurtidorRow({ c, combustibles, tarjetas, canWrite, canDelete, onEdit, onToggle, onDelete }) {
  const comb    = combustibles.find(cb => cb.id === c.combustible_id);
  const tarjeta = tarjetas.find(t => t.id === c.datos_tanque?.tarjeta_vinculada_id);
  return (
    <Card className={`border-0 shadow-sm ${!c.activo ? 'opacity-60' : ''}`}>
      <CardContent className="p-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
          <MapPin className="w-4 h-4 text-green-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-700 truncate">{c.nombre}</span>
            {c.codigo_interno && <span className="font-mono text-xs text-slate-500">{c.codigo_interno}</span>}
            <StatusBadge active={c.activo !== false} />
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {comb && <CombustibleBadge nombre={comb.nombre} />}
            {tarjeta && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                <CreditCard className="w-2.5 h-2.5 mr-1" />{tarjeta.alias || tarjeta.id_tarjeta}
              </Badge>
            )}
            {c.datos_tanque?.ubicacion && (
              <span className="text-[11px] text-slate-400">{c.datos_tanque.ubicacion}</span>
            )}
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          {canWrite  && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(c)}><Pencil className="w-3.5 h-3.5" /></Button>}
          {canWrite  && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onToggle(c)}><Power className={`w-3.5 h-3.5 ${c.activo !== false ? 'text-emerald-500' : 'text-slate-300'}`} /></Button>}
          {canDelete && <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-red-500" onClick={() => onDelete(c)}><Trash2 className="w-3.5 h-3.5" /></Button>}
        </div>
      </CardContent>
    </Card>
  );
}

function TabSurtidores({ canWrite, canDelete }) {
  const qc = useQueryClient();
  const { data: consumidores = [], isLoading } = useQuery({ queryKey: ['consumidores'],  queryFn: () => base44.entities.Consumidor.list() });
  const { data: combustibles = []             } = useQuery({ queryKey: ['combustibles'], queryFn: () => base44.entities.TipoCombustible.list() });
  const { data: tarjetas     = []             } = useQuery({ queryKey: ['tarjetas'],     queryFn: () => base44.entities.Tarjeta.list() });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing]       = useState(null);
  const [form, setForm]             = useState(emptySurtidorForm);
  const [confirmDel, setConfirmDel] = useState(null);

  const surtidores = useMemo(() =>
    consumidores.filter(c =>
      c.categoria === 'surtidor' ||
      (!c.categoria && (c.tipo_consumidor_nombre?.toLowerCase() || '').includes('surtidor'))
    ),
    [consumidores],
  );

  const createMut = useMutation({
    mutationFn: d => base44.entities.Consumidor.create({ ...d, categoria: 'surtidor' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['consumidores'] }); toast.success('Surtidor creado'); closeDialog(); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, d }) => base44.entities.Consumidor.update(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['consumidores'] }); toast.success('Actualizado'); closeDialog(); },
  });
  const deleteMut = useMutation({
    mutationFn: id => base44.entities.Consumidor.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['consumidores'] }); toast.success('Eliminado'); setConfirmDel(null); },
  });

  const closeDialog = () => { setDialogOpen(false); setEditing(null); setForm(emptySurtidorForm); };

  const openEdit = c => {
    setEditing(c);
    setForm({
      nombre: c.nombre || '',
      codigo_interno: c.codigo_interno || '',
      combustible_id: c.combustible_id || '',
      combustible_nombre: c.combustible_nombre || '',
      activo: c.activo !== false,
      observaciones: c.observaciones || '',
      litros_iniciales: Number.isFinite(Number(c.litros_iniciales)) ? Number(c.litros_iniciales) : 0,
      datos_tanque: {
        tarjeta_vinculada_id: c.datos_tanque?.tarjeta_vinculada_id || '',
        ubicacion: c.datos_tanque?.ubicacion || '',
      },
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.nombre.trim())  { toast.error('Nombre requerido'); return; }
    if (!form.combustible_id) { toast.error('Combustible requerido'); return; }
    const comb = combustibles.find(c => c.id === form.combustible_id);
    const payload = {
      nombre: form.nombre.trim(),
      codigo_interno: form.codigo_interno || '',
      combustible_id: form.combustible_id,
      combustible_nombre: comb?.nombre || form.combustible_nombre,
      activo: form.activo,
      observaciones: form.observaciones || '',
      litros_iniciales: Number(form.litros_iniciales) || 0,
      datos_tanque: {
        tarjeta_vinculada_id: form.datos_tanque.tarjeta_vinculada_id || null,
        ubicacion: form.datos_tanque.ubicacion || null,
      },
    };
    editing ? updateMut.mutate({ id: editing.id, d: payload }) : createMut.mutate(payload);
  };

  const toggleActivo = c => updateMut.mutate({ id: c.id, d: { activo: !c.activo } });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {canWrite && (
          <Button size="sm" className="gap-1.5 bg-green-600 hover:bg-green-700"
            onClick={() => { setForm(emptySurtidorForm); setEditing(null); setDialogOpen(true); }}>
            <Plus className="w-3.5 h-3.5" /> Nuevo surtidor
          </Button>
        )}
      </div>

      <div className="grid gap-2">
        {isLoading && <p className="text-sm text-slate-400 text-center py-8">Cargando...</p>}
        {!isLoading && surtidores.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-8">No hay surtidores / depósitos externos registrados</p>
        )}
        {surtidores.map(c => (
          <SurtidorRow key={c.id} c={c} combustibles={combustibles} tarjetas={tarjetas} canWrite={canWrite} canDelete={canDelete}
            onEdit={openEdit} onToggle={toggleActivo} onDelete={setConfirmDel} />
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={closeDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar surtidor' : 'Nuevo surtidor / Cupet'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label className="text-xs text-slate-500">Nombre *</Label>
                <Input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Cupet Miramar" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs text-slate-500">Código interno</Label>
                <Input value={form.codigo_interno} onChange={e => setForm(f => ({ ...f, codigo_interno: e.target.value }))} placeholder="CUPET-01" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs text-slate-500">Combustible *</Label>
                <Select value={form.combustible_id} onValueChange={v => setForm(f => ({ ...f, combustible_id: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    {combustibles.filter(c => c.activa !== false).map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label className="text-xs text-slate-500">Tarjeta vinculada (Cupet)</Label>
                <Select
                  value={form.datos_tanque.tarjeta_vinculada_id || 'none'}
                  onValueChange={v => setForm(f => ({ ...f, datos_tanque: { ...f.datos_tanque, tarjeta_vinculada_id: v === 'none' ? '' : v } }))}
                >
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Sin tarjeta" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin tarjeta vinculada</SelectItem>
                    {tarjetas.map(t => <SelectItem key={t.id} value={t.id}>{t.alias || t.id_tarjeta} ({t.moneda})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label className="text-xs text-slate-500">Ubicación / Dirección</Label>
                <Input value={form.datos_tanque.ubicacion}
                  onChange={e => setForm(f => ({ ...f, datos_tanque: { ...f.datos_tanque, ubicacion: e.target.value } }))}
                  placeholder="Calle 23 y L, Vedado…" className="mt-1" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs text-slate-500">Observaciones</Label>
                <Input value={form.observaciones} onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} placeholder="Notas adicionales..." className="mt-1" />
              </div>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" size="sm" onClick={closeDialog}>Cancelar</Button>
            <Button size="sm" onClick={handleSave} disabled={createMut.isPending || updateMut.isPending} className="bg-green-600 hover:bg-green-700">
              {(createMut.isPending || updateMut.isPending) && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!confirmDel} onOpenChange={() => setConfirmDel(null)}
        title="Eliminar surtidor" description={`¿Eliminar "${confirmDel?.nombre}"? Esta acción no se puede deshacer.`}
        onConfirm={() => deleteMut.mutate(confirmDel.id)} destructive />
    </div>
  );
}

// ── TAB TIPOS DE CONSUMIDOR ───────────────────────────────────────────────────

function TabTiposConsumidor() {
  return <TiposConsumidorPanel />;
}

// ── TAB COMBUSTIBLES ──────────────────────────────────────────────────────────

function TabCombustibles({ canDelete }) {
  const qc = useQueryClient();
  const { data: combustibles = [] } = useQuery({ queryKey: ['combustibles'], queryFn: () => base44.entities.TipoCombustible.list() });
  const { data: movimientos  = [] } = useQuery({ queryKey: ['movimientos'],  queryFn: () => base44.entities.Movimiento.list('-created_date', 500) });

  const [dialogOpen, setDialogOpen]       = useState(false);
  const [editing, setEditing]             = useState(null);
  const [nombre, setNombre]               = useState('');
  const [confirmAction, setConfirmAction] = useState(null);

  const createMut = useMutation({
    mutationFn: (d) => base44.entities.TipoCombustible.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['combustibles'] }); toast.success('Combustible creado'); closeDialog(); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, d }) => base44.entities.TipoCombustible.update(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['combustibles'] }); toast.success('Actualizado'); closeDialog(); },
  });
  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.TipoCombustible.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['combustibles'] }); toast.success('Eliminado'); setConfirmAction(null); },
  });

  const closeDialog = () => { setDialogOpen(false); setEditing(null); setNombre(''); };

  const handleSave = () => {
    if (!nombre.trim()) { toast.error('Nombre requerido'); return; }
    if (!editing && combustibles.some(c => c.nombre.toLowerCase() === nombre.trim().toLowerCase())) {
      toast.error('Ya existe un combustible con ese nombre'); return;
    }
    editing
      ? updateMut.mutate({ id: editing.id, d: { nombre: nombre.trim() } })
      : createMut.mutate({ nombre: nombre.trim(), activa: true });
  };

  const handleDelete = (c) => {
    if (movimientos.some(m => m.combustible_id === c.id)) {
      toast.error('Tiene movimientos registrados. Solo puede desactivarlo.'); return;
    }
    setConfirmAction({ id: c.id, title: 'Eliminar combustible', desc: `¿Eliminar "${c.nombre}"?` });
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" className="gap-1.5 bg-sky-600 hover:bg-sky-700"
          onClick={() => { setNombre(''); setEditing(null); setDialogOpen(true); }}>
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
                <Button variant="ghost" size="icon" className="h-8 w-8"
                  onClick={() => { setEditing(c); setNombre(c.nombre); setDialogOpen(true); }}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8"
                  onClick={() => updateMut.mutate({ id: c.id, d: { activa: !c.activa } })}>
                  <Power className={`w-3.5 h-3.5 ${c.activa ? 'text-emerald-500' : 'text-slate-300'}`} />
                </Button>
                {canDelete && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-red-500"
                    onClick={() => handleDelete(c)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {combustibles.length === 0 && <p className="text-sm text-slate-400 text-center py-10">No hay combustibles registrados</p>}
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

      <ConfirmDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)} title={confirmAction?.title} description={confirmAction?.desc} onConfirm={() => deleteMut.mutate(confirmAction.id)} destructive />
    </div>
  );
}

// ── TAB TARJETAS ──────────────────────────────────────────────────────────────

const MONEDAS = ['USD', 'CUP', 'MLC', 'EUR'];
const emptyTarjeta = () => ({ id_tarjeta: '', alias: '', moneda: 'USD', activa: true });

function TabTarjetas({ canManage, canDelete }) {
  const qc = useQueryClient();
  const { data: tarjetas    = [] } = useQuery({ queryKey: ['tarjetas'],   queryFn: () => base44.entities.Tarjeta.list() });
  const { data: movimientos = [] } = useQuery({ queryKey: ['movimientos'], queryFn: () => base44.entities.Movimiento.list('-fecha', 2000) });

  const [dialog, setDialog]       = useState(null);
  const [form, setForm]           = useState(emptyTarjeta());
  const [expandedId, setExpanded] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);

  const tarjetasSorted = useMemo(
    () => [...tarjetas].sort((a, b) => (a.alias || a.id_tarjeta).localeCompare(b.alias || b.id_tarjeta)),
    [tarjetas],
  );

  const mesActual = new Date().toISOString().slice(0, 7);
  const gastoMes  = useMemo(() =>
    movimientos.filter(m => m.tipo === 'COMPRA' && m.fecha?.startsWith(mesActual) && m.monto)
      .reduce((s, m) => s + m.monto, 0),
    [movimientos, mesActual],
  );

  const saveMut = useMutation({
    mutationFn: (d) => dialog?.mode === 'edit'
      ? base44.entities.Tarjeta.update(dialog.data.id, d)
      : base44.entities.Tarjeta.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tarjetas'] });
      toast.success(dialog?.mode === 'edit' ? 'Tarjeta actualizada' : 'Tarjeta creada');
      setDialog(null);
    },
    onError: () => toast.error('Error al guardar tarjeta'),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.Tarjeta.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tarjetas'] }); toast.success('Tarjeta eliminada'); setConfirmAction(null); },
    onError: () => toast.error('Error al eliminar'),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, activa }) => base44.entities.Tarjeta.update(id, { activa }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tarjetas'] }),
  });

  function openCreate() { setForm(emptyTarjeta()); setDialog({ mode: 'create' }); }
  function openEdit(t)  { setForm({ id_tarjeta: t.id_tarjeta, alias: t.alias || '', moneda: t.moneda || 'USD', activa: t.activa !== false }); setDialog({ mode: 'edit', data: t }); }

  function handleSave() {
    if (!form.id_tarjeta.trim()) { toast.error('Número de tarjeta requerido'); return; }
    if (!form.alias.trim())      { toast.error('El alias es requerido'); return; }
    if (!dialog?.data && tarjetas.some(t => t.id_tarjeta === form.id_tarjeta.trim())) {
      toast.error('Ya existe una tarjeta con ese número'); return;
    }
    saveMut.mutate({ id_tarjeta: form.id_tarjeta.trim(), alias: form.alias.trim(), moneda: form.moneda, activa: form.activa });
  }

  function handleDelete(t) {
    if (movimientos.some(m => m.tarjeta_id === t.id)) {
      toast.error('Tiene movimientos registrados. Solo puede desactivarla.'); return;
    }
    setConfirmAction({ id: t.id, title: 'Eliminar tarjeta', desc: `¿Eliminar "${t.alias || t.id_tarjeta}"?` });
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Tarjetas activas', value: tarjetasSorted.filter(t => t.activa !== false).length, icon: CreditCard, color: 'text-sky-600 bg-sky-50' },
          { label: 'Gasto del mes',    value: formatMonto(gastoMes), icon: DollarSign, color: 'text-emerald-600 bg-emerald-50' },
        ].map(k => (
          <Card key={k.label} className="border-0 shadow-sm">
            <CardContent className="p-3 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${k.color}`}>
                <k.icon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wide">{k.label}</p>
                <p className="text-sm font-bold text-slate-800">{k.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Lista */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-700">
            {tarjetasSorted.length} tarjeta{tarjetasSorted.length !== 1 ? 's' : ''}
          </CardTitle>
          {canManage && (
            <Button size="sm" onClick={openCreate} className="h-7 text-xs gap-1.5 bg-sky-600 hover:bg-sky-700">
              <Plus className="w-3.5 h-3.5" /> Nueva tarjeta
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-slate-100">
            {tarjetasSorted.map(t => {
              const isExpanded = expandedId === t.id;
              const movsTarjeta = movimientos
                .filter(m => m.tarjeta_id === t.id)
                .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))
                .slice(0, 5);
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
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {canManage && (
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(t)}>
                          <Pencil className="w-3 h-3 text-slate-400" />
                        </Button>
                      )}
                      {canManage && (
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toggleMut.mutate({ id: t.id, activa: !t.activa })}>
                          <Power className={`w-3 h-3 ${t.activa !== false ? 'text-emerald-500' : 'text-slate-300'}`} />
                        </Button>
                      )}
                      {canDelete && (
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDelete(t)}>
                          <Trash2 className="w-3 h-3 text-slate-400 hover:text-red-500" />
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" className="h-7 w-7"
                        onClick={() => setExpanded(isExpanded ? null : t.id)}>
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                      </Button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="bg-slate-50/60 border-t border-slate-100 px-4 py-3">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-2">Últimos movimientos</p>
                      {movsTarjeta.length === 0 ? (
                        <p className="text-xs text-slate-400">Sin movimientos registrados</p>
                      ) : (
                        <div className="space-y-1.5">
                          {movsTarjeta.map(m => (
                            <div key={m.id} className="flex items-center gap-2 text-xs">
                              <span className="text-slate-400 tabular-nums w-20 shrink-0">{m.fecha}</span>
                              <Badge variant="outline" className={`text-[10px] py-0 px-1.5 shrink-0 ${m.tipo === 'COMPRA' ? 'border-orange-200 text-orange-700' : 'border-purple-200 text-purple-700'}`}>
                                {m.tipo}
                              </Badge>
                              <span className="text-slate-600 truncate flex-1 min-w-0">
                                {m.consumidor_nombre || m.referencia || '—'}
                                {m.litros ? <span className="text-slate-400 ml-1">{m.litros}L</span> : null}
                              </span>
                              {m.monto && <span className="font-medium tabular-nums shrink-0 text-orange-600">-{formatMonto(m.monto)}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {tarjetasSorted.length === 0 && <div className="py-12 text-center text-sm text-slate-400">No hay tarjetas registradas</div>}
          </div>
        </CardContent>
      </Card>

      {/* Dialog crear/editar */}
      <Dialog open={!!dialog} onOpenChange={open => !open && setDialog(null)}>
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
              <Input className="mt-1" value={form.id_tarjeta} onChange={e => setForm(f => ({ ...f, id_tarjeta: e.target.value }))} disabled={dialog?.mode === 'edit'} placeholder="9240069992278321" />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Moneda</Label>
              <Select value={form.moneda} onValueChange={v => setForm(f => ({ ...f, moneda: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{MONEDAS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
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

      <ConfirmDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)} title={confirmAction?.title} description={confirmAction?.desc} onConfirm={() => deleteMut.mutate(confirmAction.id)} destructive />
    </div>
  );
}

// ── TAB PRECIOS ───────────────────────────────────────────────────────────────

const emptyPrecio = () => ({
  combustible_id: '', precio_por_litro: '',
  fecha_desde: new Date().toISOString().slice(0, 10), fecha_hasta: '',
});

function TabPrecios({ canManage }) {
  const qc = useQueryClient();
  const { data: precios      = [] } = useQuery({ queryKey: ['precios'],      queryFn: () => base44.entities.PrecioCombustible.list('-fecha_desde', 500) });
  const { data: combustibles = [] } = useQuery({ queryKey: ['combustibles'], queryFn: () => base44.entities.TipoCombustible.list() });

  const [dialog, setDialog] = useState(null);
  const [form, setForm]     = useState(emptyPrecio());

  const preciosPorComb = useMemo(() => {
    const map     = {};
    const byNombre = {}; // nombre normalizado → id
    combustibles.forEach(c => {
      map[c.id] = { nombre: c.nombre, activa: c.activa, precios: [] };
      byNombre[c.nombre?.toLowerCase().trim()] = c.id;
    });
    precios.forEach(p => {
      // Matching por UUID, con fallback por combustible_nombre
      const cid = (p.combustible_id && map[p.combustible_id])
        ? p.combustible_id
        : byNombre[p.combustible_nombre?.toLowerCase().trim()];
      if (cid && map[cid]) map[cid].precios.push(p);
    });
    return Object.entries(map)
      .filter(([, v]) => v.activa !== false || v.precios.length > 0)
      .sort((a, b) => a[1].nombre.localeCompare(b[1].nombre));
  }, [combustibles, precios]);

  const saveMut = useMutation({
    mutationFn: (d) => dialog?.mode === 'edit'
      ? base44.entities.PrecioCombustible.update(dialog.data.id, d)
      : base44.entities.PrecioCombustible.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['precios'] });
      toast.success(dialog?.mode === 'edit' ? 'Precio actualizado' : 'Precio creado');
      setDialog(null);
    },
    onError: () => toast.error('Error al guardar precio'),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.PrecioCombustible.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['precios'] }); toast.success('Precio eliminado'); },
    onError: () => toast.error('Error al eliminar'),
  });

  function openCreate(combustibleId = '') { setForm({ ...emptyPrecio(), combustible_id: combustibleId }); setDialog({ mode: 'create' }); }
  function openEdit(p) {
    setForm({ combustible_id: p.combustible_id, precio_por_litro: p.precio_por_litro, fecha_desde: p.fecha_desde, fecha_hasta: p.fecha_hasta || '' });
    setDialog({ mode: 'edit', data: p });
  }

  function handleSave() {
    if (!form.combustible_id) { toast.error('Seleccione el tipo de combustible'); return; }
    const precio = parseFloat(form.precio_por_litro);
    if (!form.precio_por_litro || isNaN(precio) || precio <= 0) { toast.error('El precio debe ser mayor a 0'); return; }
    if (!form.fecha_desde) { toast.error('La fecha de inicio es requerida'); return; }
    const comb = combustibles.find(c => c.id === form.combustible_id);
    saveMut.mutate({
      combustible_id:     form.combustible_id,
      combustible_nombre: comb?.nombre || null,
      precio_por_litro:   precio,
      fecha_desde:        form.fecha_desde,
      fecha_hasta:        form.fecha_hasta || null,
    });
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">Histórico de precios por tipo de combustible</p>
        {canManage && (
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
              {canManage && (
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
                  {[...grupo.precios].sort((a, b) => b.fecha_desde.localeCompare(a.fecha_desde)).map(p => {
                    const esVigente = p.fecha_desde <= today && (!p.fecha_hasta || p.fecha_hasta >= today);
                    return (
                      <div key={p.id} className={`flex items-center gap-3 px-4 py-2.5 ${esVigente ? 'bg-emerald-50/40' : ''}`}>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-semibold text-slate-800 tabular-nums">
                            $ {Number(p.precio_por_litro).toFixed(2)} / L
                          </span>
                          <span className="text-xs text-slate-400 ml-3">
                            Desde: {p.fecha_desde}
                            {p.fecha_hasta ? ` · Hasta: ${p.fecha_hasta}` : ' · Sin cierre'}
                          </span>
                        </div>
                        {esVigente && <Badge className="text-[10px] bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-0">Vigente</Badge>}
                        {canManage && (
                          <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => openEdit(p)}>
                            <Pencil className="w-3 h-3 text-slate-400" />
                          </Button>
                        )}
                        {canManage && (
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
            No hay tipos de combustible registrados. Créalos primero en la pestaña Combustibles.
          </CardContent>
        </Card>
      )}

      {/* Dialog crear/editar */}
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
              <Input type="number" step="0.001" min="0.001" className="mt-1" value={form.precio_por_litro}
                onChange={e => setForm(f => ({ ...f, precio_por_litro: e.target.value }))} placeholder="0.00" />
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

// ── DEFINICIÓN DE TABS CON CONTROL DE ACCESO ─────────────────────────────────

function buildTabs(role) {
  return [
    { value: 'consumidores',     label: 'Consumidores',        icon: <Users      className="w-3.5 h-3.5" />, show: role === 'superadmin' || role === 'operador' },
    { value: 'depositos',        label: 'Depósitos',           icon: <Warehouse  className="w-3.5 h-3.5" />, show: role === 'superadmin' || role === 'operador' },
    { value: 'surtidores',       label: 'Surtidores',          icon: <MapPin     className="w-3.5 h-3.5" />, show: role === 'superadmin' || role === 'operador' },
    { value: 'conductores',      label: 'Conductores',         icon: <UserCheck  className="w-3.5 h-3.5" />, show: role === 'superadmin' || role === 'operador' },
    { value: 'tarjetas',         label: 'Tarjetas',            icon: <CreditCard className="w-3.5 h-3.5" />, show: role === 'superadmin' || role === 'economico' },
    { value: 'precios',          label: 'Precios',             icon: <DollarSign className="w-3.5 h-3.5" />, show: role === 'superadmin' || role === 'economico' },
    { value: 'combustibles',     label: 'Combustibles',        icon: <Fuel       className="w-3.5 h-3.5" />, show: role === 'superadmin' },
    { value: 'tipos_consumidor', label: 'Tipos de consumidor', icon: <ListTree   className="w-3.5 h-3.5" />, show: role === 'superadmin' },
  ].filter(t => t.show);
}

// ── PÁGINA PRINCIPAL ──────────────────────────────────────────────────────────

export default function Catalogos() {
  const { role, canDelete, canManageFinanzas } = useUserRole();
  const visibleTabs = buildTabs(role);

  const [tab, setTab] = useState('');

  useEffect(() => {
    if (!tab && visibleTabs.length > 0) setTab(visibleTabs[0].value);
  }, [visibleTabs.length, tab]);

  const canWrite         = role === 'superadmin' || role === 'operador';
  const canManageTarjetas = role === 'superadmin' || canManageFinanzas;

  if (visibleTabs.length === 0) {
    return (
      <div className="py-24 text-center space-y-3">
        <ListTree className="w-10 h-10 text-slate-300 mx-auto" />
        <p className="text-slate-400 text-sm">No tienes acceso a los catálogos.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Catálogos</h1>
        <p className="text-xs text-slate-400">Gestión centralizada de entidades del sistema</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 flex-wrap border-b border-slate-200 dark:border-slate-700">
        {visibleTabs.map(({ value: v, label, icon }) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t border-b-2 transition-colors -mb-px ${
              tab === v
                ? 'border-sky-500 text-sky-700 dark:text-sky-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            {icon}{label}
          </button>
        ))}
      </div>

      {/* Contenido */}
      <div>
        {tab === 'consumidores'     && <TabConsumidores   canWrite={canWrite} canDelete={canDelete} />}
        {tab === 'depositos'        && <TabDepositos      canWrite={canWrite} canDelete={canDelete} />}
        {tab === 'surtidores'       && <TabSurtidores     canWrite={canWrite} canDelete={canDelete} />}
        {tab === 'conductores'      && <TabConductores    canDelete={canDelete} />}
        {tab === 'tipos_consumidor' && <TabTiposConsumidor />}
        {tab === 'combustibles'     && <TabCombustibles   canDelete={canDelete} />}
        {tab === 'tarjetas'         && <TabTarjetas       canManage={canManageTarjetas} canDelete={canDelete} />}
        {tab === 'precios'          && <TabPrecios        canManage={canManageTarjetas} />}
      </div>
    </div>
  );
}
