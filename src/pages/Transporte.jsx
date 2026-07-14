import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { base44 } from '@/api/base44Client';
import { useUserRole } from '@/components/ui-helpers/useUserRole';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Wrench, AlertTriangle, CheckCircle2, Clock, Car, UserCheck, ChevronDown, ChevronUp, History } from 'lucide-react';
import { toast } from 'sonner';
import { logAudit } from '@/api/auditLog';

const TIPOS_MANTENIMIENTO = {
  1: 'Tipo 1 — Aceite, filtro aceite, filtro combustible',
  2: 'Tipo 2 — Filtro A/C, agua refrigerante',
  3: 'Tipo 3 — Líquido frenos, pastillas',
};

const INTERVALO_DEFAULT = 10000;

function diasHasta(fecha) {
  if (!fecha) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const vence = new Date(fecha);
  return Math.floor((vence - hoy) / (1000 * 60 * 60 * 24));
}

function statusFecha(dias, umbral = 30) {
  if (dias === null) return null;
  if (dias < 0)       return { nivel: 'vencido',  label: `Vencido hace ${Math.abs(dias)}d`, color: 'text-red-600',    bg: 'bg-red-50 border-red-200' };
  if (dias <= umbral) return { nivel: 'critico',  label: `Vence en ${dias}d`,              color: 'text-red-600',    bg: 'bg-red-50 border-red-200' };
  if (dias <= 90)     return { nivel: 'alerta',   label: `Vence en ${dias}d`,              color: 'text-amber-600',  bg: 'bg-amber-50 border-amber-200' };
  return               { nivel: 'ok',      label: 'Vigente',                           color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' };
}

function statusKm(kmActual, kmProximo) {
  if (!kmProximo) return null;
  const faltan = kmProximo - kmActual;
  if (faltan <= 0)   return { nivel: 'vencido', label: 'Mantenimiento vencido',     color: 'text-red-600',    bg: 'bg-red-50 border-red-200' };
  if (faltan <= 500) return { nivel: 'critico', label: `Faltan ${faltan} km`,        color: 'text-red-600',    bg: 'bg-red-50 border-red-200' };
  if (faltan <= 1500)return { nivel: 'alerta',  label: `Faltan ${faltan} km`,        color: 'text-amber-600',  bg: 'bg-amber-50 border-amber-200' };
  return               { nivel: 'ok',     label: `Faltan ${faltan.toLocaleString()} km`, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' };
}

function BadgeStatus({ status }) {
  if (!status) return <span className="text-xs text-slate-400">Sin datos</span>;
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${status.bg} ${status.color}`}>
      {status.label}
    </span>
  );
}

function ModalMantenimiento({ vehiculo, onClose }) {
  const qc = useQueryClient();
  const hoy = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    fecha: hoy,
    km_en_servicio: vehiculo.km_actual || '',
    km_proximo: vehiculo.km_actual ? vehiculo.km_actual + INTERVALO_DEFAULT : '',
    tipo: vehiculo.tipo_ultimo_mantenimiento || 1,
    notas: '',
  });

  const mut = useMutation({
    mutationFn: async (d) => {
      const { data: { user } } = await supabase.auth.getUser();
      // Insertar historial
      const { error: errH } = await supabase.from('historial_mantenimiento').insert({
        consumidor_id: vehiculo.id,
        fecha: d.fecha,
        km_en_servicio: Number(d.km_en_servicio),
        km_proximo: Number(d.km_proximo),
        tipo: Number(d.tipo),
        notas: d.notas || null,
        created_by: user?.id,
      });
      if (errH) throw errH;
      // Actualizar consumidor
      const { error: errC } = await supabase.from('consumidor').update({
        km_ultimo_mantenimiento: Number(d.km_en_servicio),
        km_proximo_mantenimiento: Number(d.km_proximo),
        tipo_ultimo_mantenimiento: Number(d.tipo),
        fecha_ultimo_mantenimiento: d.fecha,
      }).eq('id', vehiculo.id);
      if (errC) throw errC;
    },
    onSuccess: () => {
      logAudit({
        action: 'MANTENIMIENTO_REGISTRADO',
        entityType: 'Consumidor',
        entityId: vehiculo.id,
        entityLabel: `${vehiculo.nombre} — ${form.km_en_servicio} km`,
        metadata: { tipo: form.tipo, km_proximo: form.km_proximo },
      });
      qc.invalidateQueries({ queryKey: ['v-vehiculos-transporte'] });
      qc.invalidateQueries({ queryKey: ['historial-mantenimiento'] });
      toast.success('Mantenimiento registrado');
      onClose();
    },
    onError: () => toast.error('Error al registrar'),
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="w-4 h-4" />
            Registrar mantenimiento — {vehiculo.nombre}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Fecha</Label>
              <Input type="date" value={form.fecha} onChange={e => set('fecha', e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Tipo</Label>
              <select
                value={form.tipo}
                onChange={e => set('tipo', e.target.value)}
                className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-background"
              >
                {Object.entries(TIPOS_MANTENIMIENTO).map(([k, v]) => (
                  <option key={k} value={k}>Tipo {k}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-slate-500 -mt-2">{TIPOS_MANTENIMIENTO[form.tipo]}</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Km en servicio</Label>
              <Input type="number" value={form.km_en_servicio} onChange={e => set('km_en_servicio', e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Próximo mantenimiento (km)</Label>
              <Input type="number" value={form.km_proximo} onChange={e => set('km_proximo', e.target.value)} className="mt-1" />
            </div>
          </div>
          <div>
            <Label>Notas (opcional)</Label>
            <Input value={form.notas} onChange={e => set('notas', e.target.value)} placeholder="Taller, piezas cambiadas..." className="mt-1" />
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
            <Button
              onClick={() => mut.mutate(form)}
              disabled={mut.isPending || !form.km_en_servicio || !form.km_proximo}
              className="flex-1"
            >
              {mut.isPending ? 'Guardando...' : 'Registrar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ModalDocumentos({ vehiculo, onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    fecha_vencimiento_somaton: vehiculo.fecha_vencimiento_somaton || '',
    num_licencia_op: vehiculo.num_licencia_op || '',
    fecha_vencimiento_licencia_op: vehiculo.fecha_vencimiento_licencia_op || '',
  });

  const mut = useMutation({
    mutationFn: async (d) => {
      const { error } = await supabase.from('consumidor').update({
        fecha_vencimiento_somaton: d.fecha_vencimiento_somaton || null,
        num_licencia_op: d.num_licencia_op || null,
        fecha_vencimiento_licencia_op: d.fecha_vencimiento_licencia_op || null,
      }).eq('id', vehiculo.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['v-vehiculos-transporte'] });
      toast.success('Documentos actualizados');
      onClose();
    },
    onError: () => toast.error('Error al actualizar'),
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Documentos — {vehiculo.nombre} ({vehiculo.codigo_interno})</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <Label>Vencimiento Somatón</Label>
            <Input type="date" value={form.fecha_vencimiento_somaton} onChange={e => set('fecha_vencimiento_somaton', e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>N° Licencia Operativa</Label>
            <Input value={form.num_licencia_op} onChange={e => set('num_licencia_op', e.target.value)} placeholder="LIC-0001234" className="mt-1" />
          </div>
          <div>
            <Label>Vencimiento Licencia Operativa</Label>
            <Input type="date" value={form.fecha_vencimiento_licencia_op} onChange={e => set('fecha_vencimiento_licencia_op', e.target.value)} className="mt-1" />
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
            <Button onClick={() => mut.mutate(form)} disabled={mut.isPending} className="flex-1">
              {mut.isPending ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FilaVehiculo({ v, canWrite, onMantenimiento, onDocumentos }) {
  const [expanded, setExpanded] = useState(false);
  const km = statusKm(v.km_actual, v.km_proximo_mantenimiento);
  const somaton = statusFecha(diasHasta(v.fecha_vencimiento_somaton), 30);
  const licOp = statusFecha(diasHasta(v.fecha_vencimiento_licencia_op), 30);

  const hayAlerta = [km, somaton, licOp].some(s => s && (s.nivel === 'critico' || s.nivel === 'vencido'));
  const hayWarning = !hayAlerta && [km, somaton, licOp].some(s => s && s.nivel === 'alerta');

  return (
    <div className={`border rounded-lg overflow-hidden ${hayAlerta ? 'border-red-200' : hayWarning ? 'border-amber-200' : 'border-slate-200'}`}>
      <div
        className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 ${hayAlerta ? 'bg-red-50/50 dark:bg-red-900/10' : hayWarning ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''}`}
        onClick={() => setExpanded(e => !e)}
      >
        <Car className={`w-4 h-4 shrink-0 ${hayAlerta ? 'text-red-500' : hayWarning ? 'text-amber-500' : 'text-slate-400'}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{v.nombre}</span>
            {v.codigo_interno && <span className="text-xs text-slate-400">[{v.codigo_interno}]</span>}
          </div>
          {v.conductor_nombre && <p className="text-xs text-slate-500 mt-0.5">{v.conductor_nombre}</p>}
        </div>
        <div className="hidden sm:flex items-center gap-2 flex-wrap justify-end">
          {km && <BadgeStatus status={km} />}
          {somaton && <BadgeStatus status={somaton} />}
          {licOp && <BadgeStatus status={licOp} />}
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-slate-100 dark:border-slate-700 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">Mantenimiento</p>
              <p className="text-slate-700 dark:text-slate-300">Km actual: <strong>{v.km_actual.toLocaleString()}</strong></p>
              {v.km_proximo_mantenimiento
                ? <p className="text-slate-700 dark:text-slate-300">Km próximo: <strong>{v.km_proximo_mantenimiento.toLocaleString()}</strong></p>
                : <p className="text-slate-400">Sin programar</p>}
              {v.fecha_ultimo_mantenimiento && <p className="text-xs text-slate-400 mt-1">Último: {v.fecha_ultimo_mantenimiento}</p>}
              {km && <div className="mt-1"><BadgeStatus status={km} /></div>}
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">Somatón</p>
              {v.fecha_vencimiento_somaton
                ? <>
                    <p className="text-slate-700 dark:text-slate-300">Vence: {v.fecha_vencimiento_somaton}</p>
                    {somaton && <div className="mt-1"><BadgeStatus status={somaton} /></div>}
                  </>
                : <p className="text-slate-400">Sin registrar</p>}
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">Licencia Operativa</p>
              {v.num_licencia_op && <p className="text-xs text-slate-500">{v.num_licencia_op}</p>}
              {v.fecha_vencimiento_licencia_op
                ? <>
                    <p className="text-slate-700 dark:text-slate-300">Vence: {v.fecha_vencimiento_licencia_op}</p>
                    {licOp && <div className="mt-1"><BadgeStatus status={licOp} /></div>}
                  </>
                : <p className="text-slate-400">Sin registrar</p>}
            </div>
          </div>
          {canWrite && (
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={() => onMantenimiento(v)}>
                <Wrench className="w-3.5 h-3.5 mr-1" /> Registrar mantenimiento
              </Button>
              <Button size="sm" variant="outline" onClick={() => onDocumentos(v)}>
                Editar documentos
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Transporte() {
  const { canWrite } = useUserRole();
  const qc = useQueryClient();
  const [tab, setTab] = useState('vehiculos');
  const [busqueda, setBusqueda] = useState('');
  const [modalMant, setModalMant] = useState(null);
  const [modalDocs, setModalDocs] = useState(null);
  const [filtro, setFiltro] = useState('todos'); // todos | alerta | ok

  const { data: vehiculos = [], isLoading } = useQuery({
    queryKey: ['v-vehiculos-transporte'],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_vehiculos_transporte').select('*').order('nombre');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const { data: conductores = [] } = useQuery({
    queryKey: ['conductores'],
    queryFn: () => base44.entities.Conductor.list(),
    staleTime: 5 * 60_000,
  });

  const vehiculosFiltrados = useMemo(() => {
    let v = vehiculos;
    if (busqueda) {
      const q = busqueda.toLowerCase();
      v = v.filter(x => (x.nombre || '').toLowerCase().includes(q) || (x.codigo_interno || '').toLowerCase().includes(q) || (x.conductor_nombre || '').toLowerCase().includes(q));
    }
    if (filtro === 'alerta') {
      v = v.filter(x => {
        const km = statusKm(x.km_actual, x.km_proximo_mantenimiento);
        const s = statusFecha(diasHasta(x.fecha_vencimiento_somaton), 30);
        const l = statusFecha(diasHasta(x.fecha_vencimiento_licencia_op), 30);
        return [km, s, l].some(st => st && st.nivel !== 'ok');
      });
    } else if (filtro === 'sinDatos') {
      v = v.filter(x => !x.km_proximo_mantenimiento && !x.fecha_vencimiento_somaton && !x.fecha_vencimiento_licencia_op);
    }
    return v;
  }, [vehiculos, busqueda, filtro]);

  const conductoresFiltrados = useMemo(() => {
    if (!busqueda) return conductores;
    const q = busqueda.toLowerCase();
    return conductores.filter(c => (c.nombre || '').toLowerCase().includes(q));
  }, [conductores, busqueda]);

  const totalAlertas = useMemo(() => vehiculos.filter(x => {
    const km = statusKm(x.km_actual, x.km_proximo_mantenimiento);
    const s = statusFecha(diasHasta(x.fecha_vencimiento_somaton), 30);
    const l = statusFecha(diasHasta(x.fecha_vencimiento_licencia_op), 30);
    return [km, s, l].some(st => st && (st.nivel === 'critico' || st.nivel === 'vencido'));
  }).length, [vehiculos]);

  const totalAlertasConductores = useMemo(() => conductores.filter(c => {
    const dias = diasHasta(c.licencia_vencimiento);
    return dias !== null && dias <= 60;
  }).length, [conductores]);

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Wrench className="w-6 h-6 text-sky-500" />
          Gestión de Transporte
        </h1>
        <p className="text-sm text-slate-500 mt-1">Mantenimiento de vehículos y vencimiento de documentos</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
        {[
          { key: 'vehiculos',  label: 'Vehículos',  count: totalAlertas },
          { key: 'conductores', label: 'Conductores', count: totalAlertasConductores },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setBusqueda(''); setFiltro('todos'); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${tab === t.key ? 'border-sky-500 text-sky-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            {t.label}
            {t.count > 0 && (
              <span className="bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'vehiculos' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <Input
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar vehículo, chapa o conductor..."
              className="max-w-xs"
            />
            <div className="flex gap-1">
              {[['todos','Todos'],['alerta','Con alertas'],['sinDatos','Sin datos']].map(([k,l]) => (
                <button
                  key={k}
                  onClick={() => setFiltro(k)}
                  className={`px-3 py-1 text-xs rounded-full border transition-colors ${filtro === k ? 'bg-sky-100 border-sky-300 text-sky-700' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {isLoading ? (
            <p className="text-sm text-slate-400 py-8 text-center">Cargando vehículos...</p>
          ) : vehiculosFiltrados.length === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center">Sin vehículos para mostrar.</p>
          ) : (
            <div className="space-y-2">
              {vehiculosFiltrados.map(v => (
                <FilaVehiculo
                  key={v.id}
                  v={v}
                  canWrite={canWrite}
                  onMantenimiento={setModalMant}
                  onDocumentos={setModalDocs}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'conductores' && (
        <div className="space-y-3">
          <Input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar conductor..."
            className="max-w-xs"
          />
          {conductoresFiltrados.length === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center">Sin conductores.</p>
          ) : (
            <div className="space-y-2">
              {conductoresFiltrados.map(c => {
                const dias = diasHasta(c.licencia_vencimiento);
                const st = dias !== null ? statusFecha(dias, 60) : null;
                return (
                  <div key={c.id} className={`flex items-center gap-3 px-4 py-3 border rounded-lg ${st && st.nivel !== 'ok' ? 'border-amber-200 bg-amber-50/50 dark:bg-amber-900/10' : 'border-slate-200'}`}>
                    <UserCheck className={`w-4 h-4 shrink-0 ${st && st.nivel !== 'ok' ? 'text-amber-500' : 'text-slate-400'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{c.nombre}</p>
                      {c.licencia_categoria && <p className="text-xs text-slate-500">Cat. {c.licencia_categoria}</p>}
                    </div>
                    <div className="text-right">
                      {c.licencia_vencimiento
                        ? <>
                            <p className="text-xs text-slate-500">{c.licencia_vencimiento}</p>
                            {st && <BadgeStatus status={st} />}
                          </>
                        : <span className="text-xs text-slate-400">Sin fecha</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {modalMant && <ModalMantenimiento vehiculo={modalMant} onClose={() => setModalMant(null)} />}
      {modalDocs && <ModalDocumentos vehiculo={modalDocs} onClose={() => setModalDocs(null)} />}
    </div>
  );
}
