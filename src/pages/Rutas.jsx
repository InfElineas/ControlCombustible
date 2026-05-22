import React, { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Plus, Navigation, BookOpen, BarChart3, Upload, Map, MapPin,
  Pencil, Trash2, Car, User2, ArrowRight, AlertTriangle,
  CheckCircle2, Clock, XCircle, ChevronLeft, ChevronRight,
  ChevronUp, ChevronDown, Satellite, Loader2,
} from 'lucide-react';
import ImportarChatPanel from '@/components/rutas/ImportarChatPanel';
import CombustibleBadge from '@/components/ui-helpers/CombustibleBadge';
import { MapaRutas } from '@/components/rutas/MapaRutas';
import MarcadoresPanel from '@/components/rutas/MarcadoresPanel';
import { gpsApi, metersToKm } from '@/api/gpsClient';
import { getRouteGeometry } from '@/api/routingClient';
import { useUserRole } from '@/components/ui-helpers/useUserRole';
import ConfirmDialog from '@/components/ui-helpers/ConfirmDialog';

const hoy = () => new Date().toISOString().slice(0, 10);

const ESTADO_CFG = {
  completada: { label: 'Completada', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: CheckCircle2 },
  pendiente:  { label: 'Pendiente',  cls: 'bg-amber-50 text-amber-700 border-amber-200',      Icon: Clock        },
  cancelada:  { label: 'Cancelada',  cls: 'bg-red-50 text-red-700 border-red-200',            Icon: XCircle      },
};

const TIPO_VIAJE_CFG = {
  regular:          { label: 'Regular',          cls: 'bg-sky-50 text-sky-700 border-sky-200'          },
  carga_mercancias: { label: 'Carga mercancías', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  mensajeria:       { label: 'Mensajería',       cls: 'bg-amber-50 text-amber-700 border-amber-200'    },
  viaje_extra:      { label: 'Viaje extra',      cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  recorrido_gps:    { label: 'Recorrido GPS',    cls: 'bg-teal-50 text-teal-700 border-teal-200'       },
};

function getTipoViaje(asig) {
  return asig.tipo_viaje || (asig.ruta_id ? 'regular' : 'viaje_extra');
}

const FRECUENCIA_OPTS = ['Diario', 'Según Planificación', 'Semanal', 'Mensual'];

function esNoVehiculo(c) {
  const n = (c.tipo_consumidor_nombre || '').toLowerCase();
  return n.includes('tanque') || n.includes('reserva') || n.includes('almac') ||
         n.includes('equipo') || n.includes('planta') || n.includes('generador') || n.includes('grupo');
}

// ── Diálogo: novedad de una ruta regular (sustitución / cancelación / incidencia) ──

function DialogNovedad({ ruta, novedad, consumidores, conductores, onClose, onSave }) {
  const vehiculos = consumidores.filter(c => c.activo && !esNoVehiculo(c));
  const [gpsKmLoading, setGpsKmLoading] = useState(false);
  const [form, setForm] = useState(() => {
    const vehId = novedad?.consumidor_id || ruta.consumidor_id || '';
    const veh   = consumidores.find(x => x.id === vehId);
    return {
      consumidor_id:     vehId,
      consumidor_nombre: novedad?.consumidor_nombre || ruta.consumidor_nombre || '',
      conductor_id:      novedad?.conductor_id      || veh?.conductor_id || ruta.conductor_id || '',
      conductor_nombre:  novedad?.conductor_nombre  || veh?.conductor    || ruta.conductor_nombre || '',
      ayudante_id:       novedad?.ayudante_id       || veh?.ayudante_id  || '',
      ayudante_nombre:   novedad?.ayudante_nombre   || veh?.ayudante     || '',
      inclConductor:     !!(novedad?.conductor_id   || veh?.conductor_id || ruta.conductor_id),
      inclAyudante:      !!(novedad?.ayudante_id    || veh?.ayudante_id),
      km_reales:         novedad?.km_reales         ?? '',
      observaciones:     novedad?.observaciones     || '',
      estado:            novedad?.estado            || 'completada',
    };
  });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const esSustitucion = form.consumidor_id && ruta.consumidor_id &&
                        form.consumidor_id !== ruta.consumidor_id;

  const vehGpsId = consumidores.find(c => c.id === form.consumidor_id)?.gps_device_id ?? null;

  const fetchGpsKm = async () => {
    if (!vehGpsId) return;
    setGpsKmLoading(true);
    try {
      const fecha = ruta.fecha_hoy ?? new Date().toISOString().slice(0, 10);
      const from  = new Date(fecha + 'T00:00:00');
      const to    = new Date(fecha + 'T23:59:59');
      const summary = await gpsApi.summary(vehGpsId, from, to);
      const dist = summary?.[0]?.distance ?? 0;
      const km   = metersToKm(dist);
      if (km > 0) { set('km_reales', String(km)); toast.success(`GPS: ${km} km registrados`); }
      else toast.warning('El GPS no reporta km para esta fecha');
    } catch (err) { toast.error(`GPS: ${err.message}`); }
    finally { setGpsKmLoading(false); }
  };

  const handleSave = () => {
    if (form.estado !== 'cancelada' && !form.consumidor_id) {
      toast.error('Selecciona un vehículo'); return;
    }
    onSave({
      consumidor_id:     form.estado !== 'cancelada' ? form.consumidor_id     : (ruta.consumidor_id     || null),
      consumidor_nombre: form.estado !== 'cancelada' ? form.consumidor_nombre : (ruta.consumidor_nombre || null),
      conductor_id:      form.inclConductor ? (form.conductor_id    || null) : null,
      conductor_nombre:  form.inclConductor ? (form.conductor_nombre || null) : null,
      ayudante_id:       form.inclAyudante  ? (form.ayudante_id     || null) : null,
      ayudante_nombre:   form.inclAyudante  ? (form.ayudante_nombre || null) : null,
      km_reales:         form.km_reales !== '' ? Number(form.km_reales) : null,
      observaciones:     form.observaciones.trim() || null,
      estado:            form.estado,
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Navigation className="w-4 h-4 text-sky-500" />
            Novedad — {ruta.nombre}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          {/* Info de la ruta */}
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2 text-xs text-slate-500 space-y-0.5">
            {(ruta.punto_inicio || ruta.punto_fin) && (
              <p className="font-medium text-slate-600 dark:text-slate-300">
                {[ruta.punto_inicio, ruta.punto_fin].filter(Boolean).join(' → ')}
              </p>
            )}
            <div className="flex gap-3 flex-wrap">
              {ruta.distancia_km  && <span className="text-sky-600 font-medium">{ruta.distancia_km} km ref.</span>}
              {ruta.frecuencia    && <span>{ruta.frecuencia}</span>}
              {ruta.municipio     && <span>{ruta.municipio}</span>}
            </div>
          </div>

          {/* Estado */}
          <div>
            <Label className="text-xs text-slate-500">Estado de la ruta hoy *</Label>
            <Select value={form.estado} onValueChange={v => set('estado', v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(ESTADO_CFG).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Vehículo (solo si no cancelada) */}
          {form.estado !== 'cancelada' && (
            <div>
              <Label className="text-xs text-slate-500">Vehículo del día</Label>
              {ruta.consumidor_id && (
                <p className="text-[10px] text-slate-400 mt-0.5 mb-1">
                  Habitual: <span className="font-medium">{ruta.consumidor_nombre || ruta.consumidor_id}</span>
                </p>
              )}
              <Select
                value={form.consumidor_id || '_none'}
                onValueChange={v => {
                  if (v === '_none') {
                    setForm(p => ({ ...p, consumidor_id: '', consumidor_nombre: '', conductor_id: '', conductor_nombre: '', ayudante_id: '', ayudante_nombre: '', inclConductor: false, inclAyudante: false }));
                    return;
                  }
                  const veh = consumidores.find(x => x.id === v);
                  setForm(p => ({
                    ...p,
                    consumidor_id:     v,
                    consumidor_nombre: veh?.nombre        || '',
                    conductor_id:      veh?.conductor_id  || '',
                    conductor_nombre:  veh?.conductor     || '',
                    ayudante_id:       veh?.ayudante_id   || '',
                    ayudante_nombre:   veh?.ayudante      || '',
                    inclConductor:     !!veh?.conductor_id,
                    inclAyudante:      !!veh?.ayudante_id,
                  }));
                }}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder={ruta.consumidor_id ? 'Mismo que habitual...' : 'Seleccionar vehículo...'} />
                </SelectTrigger>
                <SelectContent>
                  {ruta.consumidor_id && (
                    <SelectItem value={ruta.consumidor_id}>
                      ✓ {ruta.consumidor_nombre || ruta.consumidor_id} (habitual)
                    </SelectItem>
                  )}
                  {vehiculos.filter(c => c.id !== ruta.consumidor_id).map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nombre}{c.codigo_interno ? ` · ${c.codigo_interno}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {esSustitucion && (
                <div className="mt-1.5 flex items-center gap-1.5 text-amber-700 text-xs bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 rounded-lg px-2 py-1.5">
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  Sustitución: {ruta.consumidor_nombre} → {form.consumidor_nombre}
                </div>
              )}
            </div>
          )}

          {/* Conductores del viaje */}
          <div className="space-y-2">
            <Label className="text-xs text-slate-500">Conductores del viaje</Label>
            <div className="border border-slate-100 rounded-lg p-2.5 space-y-2.5 bg-slate-50/50">
              {/* Conductor principal */}
              <div className="flex items-center gap-2">
                <Checkbox id="nv-incl-conductor" checked={form.inclConductor} onCheckedChange={v => set('inclConductor', v)} />
                <Label htmlFor="nv-incl-conductor" className="text-[11px] text-slate-500 w-20 shrink-0 cursor-pointer">Conductor</Label>
                <Select
                  value={form.conductor_id || '_none'}
                  onValueChange={v => {
                    if (v === '_none') { set('conductor_id', ''); set('conductor_nombre', ''); return; }
                    const c = conductores.find(x => x.id === v);
                    set('conductor_id', v); set('conductor_nombre', c?.nombre || ''); set('inclConductor', true);
                  }}
                >
                  <SelectTrigger className="h-7 text-xs flex-1"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Sin conductor</SelectItem>
                    {conductores.filter(c => c.activo !== false).map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Ayudante */}
              <div className="flex items-center gap-2">
                <Checkbox id="nv-incl-ayudante" checked={form.inclAyudante} onCheckedChange={v => set('inclAyudante', v)} />
                <Label htmlFor="nv-incl-ayudante" className="text-[11px] text-slate-500 w-20 shrink-0 cursor-pointer">Ayudante</Label>
                <Select
                  value={form.ayudante_id || '_none'}
                  onValueChange={v => {
                    if (v === '_none') { set('ayudante_id', ''); set('ayudante_nombre', ''); return; }
                    const c = conductores.find(x => x.id === v);
                    set('ayudante_id', v); set('ayudante_nombre', c?.nombre || ''); set('inclAyudante', true);
                  }}
                >
                  <SelectTrigger className="h-7 text-xs flex-1"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Sin ayudante</SelectItem>
                    {conductores.filter(c => c.activo !== false && c.id !== form.conductor_id).map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Km + Observaciones */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-500">Km reales <span className="text-slate-300">(opcional)</span></Label>
              <div className="flex gap-1.5 mt-1">
                <Input
                  type="number" step="0.1" min="0"
                  value={form.km_reales}
                  onChange={e => set('km_reales', e.target.value)}
                  placeholder={ruta.distancia_km ? `Ref: ${ruta.distancia_km}` : 'Ej: 17.5'}
                />
                {vehGpsId != null && (
                  <Button type="button" size="sm" variant="outline"
                    className="shrink-0 px-2 border-sky-200 text-sky-600 hover:bg-sky-50"
                    onClick={fetchGpsKm} disabled={gpsKmLoading} title="Leer km desde GPS">
                    {gpsKmLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Satellite className="w-3.5 h-3.5" />}
                  </Button>
                )}
              </div>
            </div>
            <div>
              <Label className="text-xs text-slate-500">
                {form.estado === 'cancelada' || esSustitucion ? 'Motivo' : 'Observaciones'}
              </Label>
              <Input
                value={form.observaciones}
                onChange={e => set('observaciones', e.target.value)}
                placeholder={
                  form.estado === 'cancelada' ? 'Ej: Falla mecánica'
                  : esSustitucion ? 'Ej: Vehículo en taller'
                  : 'Notas...'
                }
                className="mt-1"
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
            <Button size="sm" className="bg-sky-600 hover:bg-sky-700" onClick={handleSave}>
              {novedad ? 'Guardar cambios' : 'Registrar novedad'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Diálogo: viaje extra (no regular) ───────────────────────────────────────

const EMPTY_ASIG = {
  fecha: hoy(), tipo_viaje: 'viaje_extra',
  descripcion_emergencia: '',
  consumidor_id: '', consumidor_nombre: '',
  conductor_id: '', conductor_nombre: '',
  ayudante_id: '', ayudante_nombre: '',
  inclConductor: false, inclAyudante: false,
  km_reales: '', observaciones: '', estado: 'completada',
};

function DialogAsignacion({ asignacion, consumidores, conductores, onClose, onSave }) {
  const [gpsKmLoading, setGpsKmLoading] = useState(false);
  const [form, setForm] = useState(() => asignacion ? {
    fecha:                  asignacion.fecha || hoy(),
    tipo_viaje:             getTipoViaje(asignacion) === 'regular' ? 'viaje_extra' : getTipoViaje(asignacion),
    descripcion_emergencia: asignacion.descripcion_emergencia || '',
    consumidor_id:          asignacion.consumidor_id || '',
    consumidor_nombre:      asignacion.consumidor_nombre || '',
    conductor_id:           asignacion.conductor_id || '',
    conductor_nombre:       asignacion.conductor_nombre || '',
    ayudante_id:            asignacion.ayudante_id || '',
    ayudante_nombre:        asignacion.ayudante_nombre || '',
    inclConductor:          !!asignacion.conductor_id,
    inclAyudante:           !!asignacion.ayudante_id,
    km_reales:              asignacion.km_reales ?? '',
    observaciones:          asignacion.observaciones || '',
    estado:                 asignacion.estado || 'completada',
  } : EMPTY_ASIG);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const vehiculos = consumidores.filter(c => c.activo && !esNoVehiculo(c));

  const vehGpsId = consumidores.find(c => c.id === form.consumidor_id)?.gps_device_id ?? null;

  const fetchGpsKm = async () => {
    if (!vehGpsId) return;
    setGpsKmLoading(true);
    try {
      const from = new Date(form.fecha + 'T00:00:00');
      const to   = new Date(form.fecha + 'T23:59:59');
      const summary = await gpsApi.summary(vehGpsId, from, to);
      const dist = summary?.[0]?.distance ?? 0;
      const km   = metersToKm(dist);
      if (km > 0) { set('km_reales', String(km)); toast.success(`GPS: ${km} km registrados`); }
      else toast.warning('El GPS no reporta km para esta fecha');
    } catch (err) { toast.error(`GPS: ${err.message}`); }
    finally { setGpsKmLoading(false); }
  };

  const handleSave = () => {
    if (!form.consumidor_id)                         { toast.error('Selecciona un vehículo'); return; }
    if (!form.descripcion_emergencia.trim())          { toast.error('Describe el destino o motivo'); return; }
    onSave({
      fecha:                  form.fecha,
      tipo_viaje:             form.tipo_viaje,
      ruta_id:                null,
      descripcion_emergencia: form.descripcion_emergencia.trim(),
      consumidor_id:          form.consumidor_id,
      consumidor_nombre:      form.consumidor_nombre,
      conductor_id:           form.inclConductor ? (form.conductor_id    || null) : null,
      conductor_nombre:       form.inclConductor ? (form.conductor_nombre || null) : null,
      ayudante_id:            form.inclAyudante  ? (form.ayudante_id     || null) : null,
      ayudante_nombre:        form.inclAyudante  ? (form.ayudante_nombre || null) : null,
      km_reales:              form.km_reales !== '' ? Number(form.km_reales) : null,
      observaciones:          form.observaciones.trim() || null,
      estado:                 form.estado,
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Navigation className="w-4 h-4 text-orange-500" />
            {asignacion ? 'Editar viaje extra' : 'Registrar viaje extra'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-500">Fecha</Label>
              <Input type="date" value={form.fecha} onChange={e => set('fecha', e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Estado</Label>
              <Select value={form.estado} onValueChange={v => set('estado', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ESTADO_CFG).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs text-slate-500">Tipo *</Label>
            <Select value={form.tipo_viaje} onValueChange={v => set('tipo_viaje', v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TIPO_VIAJE_CFG).filter(([k]) => k !== 'regular').map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs text-slate-500">Destino / Motivo *</Label>
            <Input
              value={form.descripcion_emergencia}
              onChange={e => set('descripcion_emergencia', e.target.value)}
              placeholder={
                form.tipo_viaje === 'carga_mercancias' ? 'Ej: Entrega mercancía almacén norte' :
                form.tipo_viaje === 'mensajeria'       ? 'Ej: Documentos sede central' :
                'Ej: Traslado imprevisto'
              }
              className="mt-1"
            />
          </div>

          <div>
            <Label className="text-xs text-slate-500">Vehículo *</Label>
            <Select value={form.consumidor_id} onValueChange={v => {
              const veh = consumidores.find(x => x.id === v);
              setForm(p => ({
                ...p,
                consumidor_id:     v,
                consumidor_nombre: veh?.nombre       || '',
                conductor_id:      veh?.conductor_id || '',
                conductor_nombre:  veh?.conductor    || '',
                ayudante_id:       veh?.ayudante_id  || '',
                ayudante_nombre:   veh?.ayudante     || '',
                inclConductor:     !!veh?.conductor_id,
                inclAyudante:      !!veh?.ayudante_id,
              }));
            }}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar vehículo..." /></SelectTrigger>
              <SelectContent>
                {vehiculos.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nombre}{c.codigo_interno ? ` · ${c.codigo_interno}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Conductores del viaje */}
          <div className="space-y-2">
            <Label className="text-xs text-slate-500">Conductores del viaje</Label>
            <div className="border border-slate-100 rounded-lg p-2.5 space-y-2.5 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Checkbox id="ea-incl-conductor" checked={form.inclConductor} onCheckedChange={v => set('inclConductor', v)} />
                <Label htmlFor="ea-incl-conductor" className="text-[11px] text-slate-500 w-20 shrink-0 cursor-pointer">Conductor</Label>
                <Select
                  value={form.conductor_id || '_none'}
                  onValueChange={v => {
                    if (v === '_none') { set('conductor_id', ''); set('conductor_nombre', ''); return; }
                    const c = conductores.find(x => x.id === v);
                    set('conductor_id', v); set('conductor_nombre', c?.nombre || ''); set('inclConductor', true);
                  }}
                >
                  <SelectTrigger className="h-7 text-xs flex-1"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Sin conductor</SelectItem>
                    {conductores.filter(c => c.activo !== false).map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="ea-incl-ayudante" checked={form.inclAyudante} onCheckedChange={v => set('inclAyudante', v)} />
                <Label htmlFor="ea-incl-ayudante" className="text-[11px] text-slate-500 w-20 shrink-0 cursor-pointer">Ayudante</Label>
                <Select
                  value={form.ayudante_id || '_none'}
                  onValueChange={v => {
                    if (v === '_none') { set('ayudante_id', ''); set('ayudante_nombre', ''); return; }
                    const c = conductores.find(x => x.id === v);
                    set('ayudante_id', v); set('ayudante_nombre', c?.nombre || ''); set('inclAyudante', true);
                  }}
                >
                  <SelectTrigger className="h-7 text-xs flex-1"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Sin ayudante</SelectItem>
                    {conductores.filter(c => c.activo !== false && c.id !== form.conductor_id).map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-500">Km reales <span className="text-slate-300">(opcional)</span></Label>
              <div className="flex gap-1.5 mt-1">
                <Input
                  type="number" step="0.1" min="0"
                  value={form.km_reales}
                  onChange={e => set('km_reales', e.target.value)}
                  placeholder="Ej: 17.5"
                />
                {vehGpsId != null && (
                  <Button type="button" size="sm" variant="outline"
                    className="shrink-0 px-2 border-orange-200 text-orange-600 hover:bg-orange-50"
                    onClick={fetchGpsKm} disabled={gpsKmLoading} title="Leer km desde GPS">
                    {gpsKmLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Satellite className="w-3.5 h-3.5" />}
                  </Button>
                )}
              </div>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Observaciones</Label>
              <Input
                value={form.observaciones}
                onChange={e => set('observaciones', e.target.value)}
                placeholder="Notas..."
                className="mt-1"
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
            <Button size="sm" className="bg-orange-600 hover:bg-orange-700" onClick={handleSave}>
              {asignacion ? 'Guardar cambios' : 'Registrar viaje extra'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Diálogo: crear / editar ruta del catálogo ────────────────────────────────

const EMPTY_RUTA = {
  nombre: '', punto_inicio: '', punto_fin: '', municipio: '',
  distancia_km: '', frecuencia: 'Diario', activa: true,
  consumidor_id: '', consumidor_nombre: '',
  conductor_id: '', conductor_nombre: '',
  grupo: '', coord_inicio: '', coord_fin: '',
};

function parseCoord(s) {
  if (!s?.trim()) return [null, null];
  const parts = s.split(',').map(x => parseFloat(x.trim()));
  return (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) ? parts : [null, null];
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calcDistParadas(paradas) {
  let total = 0;
  for (let i = 0; i < paradas.length - 1; i++) {
    total += haversineKm(paradas[i].lat, paradas[i].lng, paradas[i + 1].lat, paradas[i + 1].lng);
  }
  return Math.round(total * 10) / 10;
}

function DialogRuta({ ruta, consumidores, conductores, onClose, onSave }) {
  const vehiculos = consumidores.filter(c => c.activo && !esNoVehiculo(c));

  const [form, setForm] = useState(() => {
    const b = ruta ?? {};
    return {
      nombre:            b.nombre            || '',
      frecuencia:        b.frecuencia        || 'Diario',
      municipio:         b.municipio         || '',
      punto_inicio:      b.punto_inicio      || '',
      punto_fin:         b.punto_fin         || '',
      distancia_km:      b.distancia_km      ?? '',
      activa:            b.activa            ?? true,
      consumidor_id:     b.consumidor_id     || '',
      consumidor_nombre: b.consumidor_nombre || '',
      conductor_id:      b.conductor_id      || '',
      conductor_nombre:  b.conductor_nombre  || '',
      grupo:             b.grupo             || '',
      coord_inicio:      b.lat_inicio != null && b.lng_inicio != null
                           ? `${b.lat_inicio}, ${b.lng_inicio}` : '',
      coord_fin:         b.lat_fin != null && b.lng_fin != null
                           ? `${b.lat_fin}, ${b.lng_fin}` : '',
    };
  });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // ── Paradas (waypoints) ─────────────────────────────────────
  const { data: marcadores = [] } = useQuery({
    queryKey: ['marcadores'],
    queryFn:  () => base44.entities.Marcador.list(),
    staleTime: 60_000,
  });
  const activeMarcadores = marcadores.filter(m => m.activo !== false);

  const [paradas, setParadas]         = useState([]);
  const [paradasLoaded, setParadasLoaded] = useState(!ruta);
  const [addingParada, setAddingParada]   = useState(false);

  // Carga waypoints existentes al editar
  useEffect(() => {
    if (!ruta?.id) return;
    supabase
      .from('ruta_marcador')
      .select('orden, marcador_id, marcador(id,nombre,lat,lng,color)')
      .eq('ruta_id', ruta.id)
      .order('orden')
      .then(({ data }) => {
        if (data) {
          setParadas(data.map(rm => ({
            marcador_id: rm.marcador_id,
            nombre: rm.marcador.nombre,
            lat:    Number(rm.marcador.lat),
            lng:    Number(rm.marcador.lng),
            color:  rm.marcador.color,
          })));
        }
        setParadasLoaded(true);
      });
  }, [ruta?.id]);

  // Cuando hay 2+ paradas: auto-rellenar puntos y coordenadas (distancia vía OSRM — efecto separado)
  useEffect(() => {
    if (paradas.length < 2) return;
    const first = paradas[0];
    const last  = paradas[paradas.length - 1];
    setForm(prev => ({
      ...prev,
      punto_inicio: first.nombre,
      punto_fin:    last.nombre,
      coord_inicio: `${first.lat}, ${first.lng}`,
      coord_fin:    `${last.lat}, ${last.lng}`,
    }));
  }, [paradas]);

  const addParada = (marcadorId) => {
    const m = activeMarcadores.find(x => x.id === marcadorId);
    if (!m) return;
    setParadas(prev => [...prev, { marcador_id: m.id, nombre: m.nombre, lat: Number(m.lat), lng: Number(m.lng), color: m.color }]);
    setAddingParada(false);
  };

  const removeParada = (idx) => setParadas(prev => prev.filter((_, i) => i !== idx));

  const moveParada = (idx, dir) => {
    setParadas(prev => {
      const next = [...prev];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  };

  const paradasUsadas = new Set(paradas.map(p => p.marcador_id));
  const marcadoresDisponibles = activeMarcadores.filter(m => !paradasUsadas.has(m.id));

  // Distancia real por carretera (OSRM)
  const [roadDist,        setRoadDist]        = useState(null);
  const [roadDistLoading, setRoadDistLoading] = useState(false);
  const [roadDistError,   setRoadDistError]   = useState(false);

  useEffect(() => {
    if (paradas.length < 2) { setRoadDist(null); setRoadDistError(false); return; }
    let cancelled = false;
    setRoadDistLoading(true);
    setRoadDistError(false);
    getRouteGeometry(paradas.map(p => ({ lat: p.lat, lng: p.lng })))
      .then(r => {
        if (cancelled) return;
        setRoadDist(r.distanceKm);
        setForm(prev => ({ ...prev, distancia_km: r.distanceKm }));
      })
      .catch(() => {
        if (cancelled) return;
        // Fallback haversine solo como último recurso — se indica al usuario
        const fallback = calcDistParadas(paradas);
        setRoadDist(fallback);
        setRoadDistError(true);
        setForm(prev => ({ ...prev, distancia_km: fallback }));
      })
      .finally(() => { if (!cancelled) setRoadDistLoading(false); });
    return () => { cancelled = true; };
  }, [paradas]);

  // ── Guardar ─────────────────────────────────────────────────
  const handleSave = () => {
    if (!form.nombre.trim()) { toast.error('El nombre es requerido'); return; }
    const [lat_inicio, lng_inicio] = parseCoord(form.coord_inicio);
    const [lat_fin,    lng_fin]    = parseCoord(form.coord_fin);
    if (form.coord_inicio.trim() && lat_inicio === null) {
      toast.error('Coordenada de inicio inválida — usa el formato: 23.1136, -82.3666'); return;
    }
    if (form.coord_fin.trim() && lat_fin === null) {
      toast.error('Coordenada de fin inválida — usa el formato: 23.1136, -82.3666'); return;
    }
    onSave({
      nombre:            form.nombre.trim(),
      frecuencia:        form.frecuencia,
      municipio:         form.municipio.trim() || null,
      punto_inicio:      form.punto_inicio.trim() || null,
      punto_fin:         form.punto_fin.trim() || null,
      distancia_km:      form.distancia_km !== '' ? Number(form.distancia_km) : null,
      activa:            form.activa,
      consumidor_id:     form.consumidor_id  || null,
      consumidor_nombre: form.consumidor_nombre || null,
      conductor_id:      form.conductor_id   || null,
      conductor_nombre:  form.conductor_nombre || null,
      grupo:             form.grupo.trim()   || null,
      lat_inicio, lng_inicio, lat_fin, lng_fin,
      tiempo_estimado:   ruta?.tiempo_estimado ?? null,
      _paradas: paradas.map((p, i) => ({ marcador_id: p.marcador_id, orden: i })),
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-base">{ruta ? 'Editar ruta' : 'Nueva ruta'}</DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 pr-1 space-y-4 pt-1 pb-2">

          {/* Nombre */}
          <div>
            <Label className="text-xs text-slate-500">Nombre *</Label>
            <Input value={form.nombre} onChange={e => set('nombre', e.target.value)}
              placeholder="CD Polígono" className="mt-1" autoFocus />
          </div>

          {/* Frecuencia + Municipio */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-500">Frecuencia</Label>
              <Select value={form.frecuencia} onValueChange={v => set('frecuencia', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FRECUENCIA_OPTS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Municipio</Label>
              <Input value={form.municipio} onChange={e => set('municipio', e.target.value)}
                placeholder="Arroyo Naranjo" className="mt-1" />
            </div>
          </div>

          {/* ── Paradas (waypoints) ── */}
          <div className="border-t border-slate-100 dark:border-slate-700 pt-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Paradas
                {paradas.length >= 2 && (
                  <span className={`ml-2 font-normal normal-case ${roadDistError ? 'text-amber-500' : 'text-sky-500'}`}>
                    {roadDistLoading
                      ? 'Calculando por carretera…'
                      : roadDistError
                        ? `${roadDist} km (aprox. — sin datos de carretera)`
                        : `${roadDist ?? calcDistParadas(paradas)} km por carretera`
                    }
                  </span>
                )}
              </p>
              {!addingParada && marcadoresDisponibles.length > 0 && (
                <button
                  type="button"
                  onClick={() => setAddingParada(true)}
                  className="text-[11px] text-sky-600 hover:text-sky-800 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Añadir parada
                </button>
              )}
            </div>

            {!paradasLoaded ? (
              <p className="text-xs text-slate-400">Cargando…</p>
            ) : paradas.length === 0 && !addingParada ? (
              <p className="text-xs text-slate-400 italic">
                Sin paradas — puedes añadir marcadores como puntos de la ruta, o usar coordenadas manuales abajo.
              </p>
            ) : (
              <ul className="space-y-1 mb-2">
                {paradas.map((p, i) => (
                  <li key={p.marcador_id + i}
                    className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2.5 py-1.5"
                  >
                    <span className="text-[10px] text-slate-400 w-4 text-right shrink-0">{i + 1}</span>
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.color || '#3b82f6' }} />
                    <span className="flex-1 text-xs font-medium text-slate-700 dark:text-slate-200 truncate">{p.nombre}</span>
                    <div className="flex gap-0.5 shrink-0">
                      <button type="button" onClick={() => moveParada(i, -1)} disabled={i === 0}
                        className="p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-20">
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" onClick={() => moveParada(i, 1)} disabled={i === paradas.length - 1}
                        className="p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-20">
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" onClick={() => removeParada(i)}
                        className="p-0.5 text-slate-400 hover:text-red-500 ml-1">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {addingParada && (
              <div className="flex gap-2 items-center mt-1">
                <Select onValueChange={addParada}>
                  <SelectTrigger className="flex-1 h-8 text-xs"><SelectValue placeholder="Selecciona un marcador…" /></SelectTrigger>
                  <SelectContent>
                    {marcadoresDisponibles.map(m => (
                      <SelectItem key={m.id} value={m.id}>
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full inline-block" style={{ background: m.color || '#3b82f6' }} />
                          {m.nombre}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" size="sm" className="h-8 text-xs"
                  onClick={() => setAddingParada(false)}>Cancelar</Button>
              </div>
            )}
          </div>

          {/* Puntos + Distancia + Grupo */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-500">Punto de inicio</Label>
              <Select
                value={activeMarcadores.find(m => m.nombre === form.punto_inicio)?.id ?? '_none'}
                disabled={paradas.length >= 2}
                onValueChange={v => {
                  if (v === '_none') { setForm(p => ({ ...p, punto_inicio: '' })); return; }
                  const m = activeMarcadores.find(x => x.id === v);
                  if (!m) return;
                  setForm(p => ({ ...p, punto_inicio: m.nombre, coord_inicio: `${m.lat}, ${m.lng}` }));
                }}
              >
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecciona marcador…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— Sin punto de inicio —</SelectItem>
                  {activeMarcadores.map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full inline-block" style={{ background: m.color || '#3b82f6' }} />
                        {m.nombre}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.punto_inicio && !activeMarcadores.find(m => m.nombre === form.punto_inicio) && (
                <p className="text-[10px] text-slate-400 mt-0.5">Actual: {form.punto_inicio}</p>
              )}
            </div>
            <div>
              <Label className="text-xs text-slate-500">Punto de fin</Label>
              <Select
                value={activeMarcadores.find(m => m.nombre === form.punto_fin)?.id ?? '_none'}
                disabled={paradas.length >= 2}
                onValueChange={v => {
                  if (v === '_none') { setForm(p => ({ ...p, punto_fin: '' })); return; }
                  const m = activeMarcadores.find(x => x.id === v);
                  if (!m) return;
                  setForm(p => ({ ...p, punto_fin: m.nombre, coord_fin: `${m.lat}, ${m.lng}` }));
                }}
              >
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecciona marcador…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— Sin punto de fin —</SelectItem>
                  {activeMarcadores.map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full inline-block" style={{ background: m.color || '#3b82f6' }} />
                        {m.nombre}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.punto_fin && !activeMarcadores.find(m => m.nombre === form.punto_fin) && (
                <p className="text-[10px] text-slate-400 mt-0.5">Actual: {form.punto_fin}</p>
              )}
            </div>
            <div>
              <Label className="text-xs text-slate-500">Distancia ref. (km)</Label>
              <Input type="number" step="0.1" min="0" value={form.distancia_km}
                onChange={e => set('distancia_km', e.target.value)}
                placeholder="17" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Grupo <span className="text-slate-300">(opc.)</span></Label>
              <Input value={form.grupo} onChange={e => set('grupo', e.target.value)}
                placeholder="Habitual, Reducido…" className="mt-1" />
            </div>
          </div>

          {/* Asignación habitual */}
          <div className="border-t border-slate-100 dark:border-slate-700 pt-3">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Asignación habitual</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-slate-500">Vehículo habitual</Label>
                <Select value={form.consumidor_id || '_none'} onValueChange={v => {
                  if (v === '_none') { set('consumidor_id', ''); set('consumidor_nombre', ''); return; }
                  const c = consumidores.find(x => x.id === v);
                  set('consumidor_id', v); set('consumidor_nombre', c?.nombre || '');
                }}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Sin vehículo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Sin vehículo habitual</SelectItem>
                    {vehiculos.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nombre}{c.codigo_interno ? ` · ${c.codigo_interno}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-500">Conductor <span className="text-slate-300">(opc.)</span></Label>
                <Select value={form.conductor_id || '_none'} onValueChange={v => {
                  if (v === '_none') { set('conductor_id', ''); set('conductor_nombre', ''); return; }
                  const c = conductores.find(x => x.id === v);
                  set('conductor_id', v); set('conductor_nombre', c?.nombre || '');
                }}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Sin conductor" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Sin conductor</SelectItem>
                    {conductores.filter(c => c.activo !== false).map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Coordenadas manuales (se auto-rellenan si hay paradas) */}
          <div className="border-t border-slate-100 dark:border-slate-700 pt-3">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Coordenadas <span className="font-normal normal-case text-slate-300">
                {paradas.length >= 2 ? '(calculadas desde paradas)' : '(opcionales — para visualizar en el mapa)'}
              </span>
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px] text-slate-500">Inicio <span className="text-slate-400">(lat, lng)</span></Label>
                <Input value={form.coord_inicio} onChange={e => set('coord_inicio', e.target.value)}
                  placeholder="23.136736, -82.358820"
                  className="mt-1 font-mono text-xs"
                  readOnly={paradas.length >= 2} />
              </div>
              <div>
                <Label className="text-[11px] text-slate-500">Fin <span className="text-slate-400">(lat, lng)</span></Label>
                <Input value={form.coord_fin} onChange={e => set('coord_fin', e.target.value)}
                  placeholder="23.250000, -82.500000"
                  className="mt-1 font-mono text-xs"
                  readOnly={paradas.length >= 2} />
              </div>
            </div>
            {paradas.length < 2 && (
              <p className="text-[10px] text-slate-400 mt-1.5">
                Abre la pestaña <b>Marcadores</b>, coloca puntos y añádelos como paradas arriba — o pega coordenadas manualmente.
              </p>
            )}
          </div>

          {/* Activa + botones */}
          <div className="border-t border-slate-100 dark:border-slate-700 pt-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Switch id="ruta-activa" checked={form.activa} onCheckedChange={v => set('activa', v)} />
              <Label htmlFor="ruta-activa" className="text-sm cursor-pointer">Ruta activa</Label>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
              <Button size="sm" className="bg-sky-600 hover:bg-sky-700" onClick={handleSave}>
                {ruta ? 'Guardar cambios' : 'Crear ruta'}
              </Button>
            </div>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Fila de ruta en vista diaria ─────────────────────────────────────────────

function RutaDiaRow({ ruta, novedad, canWrite, onRegistrar, onEditar, onEliminar }) {
  const esAuto        = novedad?.auto_generado === true;
  const esSustitucion = novedad && ruta.consumidor_id && novedad.consumidor_id &&
                        novedad.consumidor_id !== ruta.consumidor_id;
  const esCancelada   = novedad?.estado === 'cancelada';
  const tieneNovedad  = !!novedad;

  let wrapCls = 'border-slate-100 dark:border-slate-700 hover:bg-slate-50/40 dark:hover:bg-slate-800/40';
  if (esCancelada)        wrapCls = 'border-red-100 dark:border-red-900/40 bg-red-50/20 dark:bg-red-900/10';
  else if (esSustitucion) wrapCls = 'border-amber-100 dark:border-amber-900/40 bg-amber-50/20 dark:bg-amber-900/10';

  return (
    <div className={`border rounded-xl p-3 transition-colors ${wrapCls}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {/* Nombre + badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{ruta.nombre}</span>
            {esCancelada && (
              <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-200">
                <XCircle className="w-2.5 h-2.5 mr-1" />Cancelada
              </Badge>
            )}
            {esSustitucion && (
              <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                <AlertTriangle className="w-2.5 h-2.5 mr-1" />Sustitución
              </Badge>
            )}
            {tieneNovedad && !esCancelada && !esSustitucion && !esAuto && (
              <Badge variant="outline" className="text-[10px] bg-sky-50 text-sky-700 border-sky-200">
                Editado
              </Badge>
            )}
          </div>

          {/* Ruta meta */}
          <div className="flex flex-wrap gap-2 mt-0.5 text-[11px] text-slate-400">
            {(ruta.punto_inicio || ruta.punto_fin) && (
              <span>{[ruta.punto_inicio, ruta.punto_fin].filter(Boolean).join(' → ')}</span>
            )}
            {ruta.distancia_km  && <span className="text-sky-500 font-medium">{ruta.distancia_km} km</span>}
            {ruta.frecuencia    && <span>{ruta.frecuencia}</span>}
          </div>

          {/* Vehículos habitual / del día */}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap text-xs">
            {ruta.consumidor_id ? (
              <span className="flex items-center gap-1 text-slate-500">
                <Car className="w-3 h-3 text-slate-400" />
                <span className="text-slate-400">Habitual:</span>
                <span className="font-medium text-slate-600 dark:text-slate-300">{ruta.consumidor_nombre}</span>
              </span>
            ) : (
              <span className="text-slate-300 italic text-[11px]">Sin vehículo habitual — asigna uno en el catálogo</span>
            )}

            {esSustitucion && (
              <>
                <ArrowRight className="w-3 h-3 text-amber-400 shrink-0" />
                <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400 font-semibold">
                  <Car className="w-3 h-3" />Hoy: {novedad.consumidor_nombre}
                </span>
              </>
            )}

            {esCancelada && (
              <span className="text-red-500 font-medium text-[11px]">No operó</span>
            )}

            {esAuto && !esCancelada && !esSustitucion
              ? <span className="text-slate-400 text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded-full">Auto</span>
              : (!tieneNovedad && ruta.consumidor_id)
                ? <span className="text-emerald-600 text-[10px] bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded-full">Normal</span>
                : null
            }
          </div>

          {/* Detalles de la novedad */}
          {tieneNovedad && (
            <div className="mt-1.5 flex flex-wrap gap-3 text-[11px] text-slate-500">
              {novedad.conductor_nombre && (
                <span className="flex items-center gap-1"><User2 className="w-3 h-3" />{novedad.conductor_nombre}</span>
              )}
              {novedad.ayudante_nombre && (
                <span className="flex items-center gap-1 text-violet-500"><User2 className="w-3 h-3" />{novedad.ayudante_nombre} <span className="text-slate-300 font-normal">(ayudante)</span></span>
              )}
              {novedad.km_reales != null && (
                <span className="font-medium text-sky-600">
                  {Number(novedad.km_reales).toFixed(1)} km reales
                  {ruta.distancia_km ? <span className="text-slate-400 font-normal"> / {ruta.distancia_km} ref.</span> : ''}
                </span>
              )}
              {novedad.observaciones && (
                <span className="italic text-slate-400">{novedad.observaciones}</span>
              )}
            </div>
          )}
        </div>

        {canWrite && (
          <div className="flex items-center gap-1 shrink-0">
            {!tieneNovedad ? (
              <Button
                size="sm" variant="outline"
                className="text-xs h-7 text-slate-500 border-slate-200 hover:border-sky-300 hover:text-sky-700 dark:hover:border-sky-700"
                onClick={onRegistrar}
              >
                Registrar novedad
              </Button>
            ) : esAuto && !esCancelada && !esSustitucion ? (
              <Button
                size="sm" variant="ghost"
                className="text-xs h-7 text-slate-400 hover:text-sky-700 dark:hover:text-sky-400"
                onClick={onEditar}
              >
                Registrar excepción
              </Button>
            ) : (
              <>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-700" onClick={onEditar}>
                  <Pencil className="w-3 h-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-500" onClick={onEliminar}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tarjeta de viaje extra ───────────────────────────────────────────────────

function AsignacionCard({ asig, canWrite, onEdit, onDelete }) {
  const cfg    = ESTADO_CFG[asig.estado] ?? ESTADO_CFG.completada;
  const tipo   = getTipoViaje(asig);
  const tipoCfg = TIPO_VIAJE_CFG[tipo] ?? TIPO_VIAJE_CFG.viaje_extra;
  const { Icon } = cfg;
  return (
    <div className="border border-slate-100 dark:border-slate-700 rounded-xl p-3 hover:bg-slate-50/40 dark:hover:bg-slate-800/40 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={`text-[10px] shrink-0 ${tipoCfg.cls}`}>{tipoCfg.label}</Badge>
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
              {asig.descripcion_emergencia || '—'}
            </span>
          </div>
          <div className="flex flex-wrap gap-3 mt-1.5 text-[11px] text-slate-500">
            <span className="flex items-center gap-1"><Car className="w-3 h-3" />{asig.consumidor_nombre || '—'}</span>
            {asig.conductor_nombre && <span className="flex items-center gap-1"><User2 className="w-3 h-3" />{asig.conductor_nombre}</span>}
            {asig.ayudante_nombre  && <span className="flex items-center gap-1 text-violet-500"><User2 className="w-3 h-3" />{asig.ayudante_nombre} <span className="text-slate-400 text-[10px]">(ay.)</span></span>}
            {asig.km_reales != null && <span className="font-medium text-sky-600">{Number(asig.km_reales).toFixed(1)} km</span>}
          </div>
          {asig.observaciones && <p className="text-[11px] text-slate-400 mt-1 italic">{asig.observaciones}</p>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge variant="outline" className={`text-[10px] ${cfg.cls}`}>
            <Icon className="w-2.5 h-2.5 mr-1" />{cfg.label}
          </Badge>
          {canWrite && (<>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-300 hover:text-slate-600" onClick={onEdit}>
              <Pencil className="w-3 h-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-300 hover:text-red-500" onClick={onDelete}>
              <Trash2 className="w-3 h-3" />
            </Button>
          </>)}
        </div>
      </div>
    </div>
  );
}

// ── Tags de origen para estadísticas ─────────────────────────────────────────

const SOURCE_CFG = {
  auto:    { label: 'Auto',    cls: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-600' },
  oficial: { label: 'Oficial', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700' },
  extra:   { label: 'Extra',   cls: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700' },
  chat:    { label: 'Chat',    cls: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-700' },
};

const TRIPS_PER_VEH_PAGE = 20;

function VehiculoStatsCard({ grupo }) {
  const [open, setOpen]   = useState(false);
  const [page, setPage]   = useState(0);
  const trips             = grupo.trips;
  const tripsPag          = trips.slice(page * TRIPS_PER_VEH_PAGE, (page + 1) * TRIPS_PER_VEH_PAGE);
  const totalPages        = Math.ceil(trips.length / TRIPS_PER_VEH_PAGE);

  return (
    <Card className="border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
        onClick={() => setOpen(o => !o)}
      >
        <Car className="w-4 h-4 text-slate-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{grupo.name}</p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {grupo.chapa && (
              <span className="text-[11px] text-slate-400 font-mono bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">{grupo.chapa}</span>
            )}
            {grupo.combustible && <CombustibleBadge nombre={grupo.combustible} />}
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-4 shrink-0">
          <div className="text-center">
            <p className="text-[10px] text-slate-400">Viajes</p>
            <p className="text-sm font-bold text-slate-700 dark:text-slate-200 tabular-nums">{trips.length}</p>
          </div>
          {grupo.kmTotal > 0 && (
            <div className="text-center">
              <p className="text-[10px] text-slate-400">km totales</p>
              <p className="text-sm font-bold text-sky-600 tabular-nums">{grupo.kmTotal.toFixed(0)}</p>
            </div>
          )}
          {(grupo.litrosReal ?? grupo.litrosTotal) > 0 && (
            <div className="text-center">
              <p className="text-[10px] text-emerald-500">{grupo.litrosReal != null ? 'litros' : 'litros est.'}</p>
              <p className="text-sm font-bold text-emerald-600 tabular-nums">{(grupo.litrosReal ?? grupo.litrosTotal).toFixed(1)}</p>
            </div>
          )}
          {grupo.kmPerLitro != null && (
            <div className="text-center">
              <p className="text-[10px] text-slate-400">consumo</p>
              <p className="text-sm font-bold text-violet-600 tabular-nums">{grupo.kmPerLitro.toFixed(1)} km/L</p>
            </div>
          )}
        </div>
        {open
          ? <ChevronUp   className="w-4 h-4 text-slate-400 shrink-0" />
          : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
        }
      </div>

      {open && (
        <div className="border-t border-slate-100 dark:border-slate-700">
          <div className="divide-y divide-slate-50 dark:divide-slate-800">
            {tripsPag.map((t, i) => {
              const srcCfg = SOURCE_CFG[t.source] ?? SOURCE_CFG.oficial;
              return (
                <div key={i} className="flex items-center gap-2 px-4 py-2">
                  <span className="text-xs text-slate-500 w-24 shrink-0">{t.fecha}</span>
                  <span className="text-xs text-slate-500 flex-1 truncate italic">{t.descripcion}</span>
                  {t.km != null && (
                    <span className="text-xs text-slate-600 dark:text-slate-300 tabular-nums shrink-0 w-14 text-right">{Number(t.km).toFixed(1)} km</span>
                  )}
                  {t.litros != null && (
                    <span className="text-xs text-emerald-600 tabular-nums shrink-0 w-12 text-right">{Number(t.litros).toFixed(1)} L</span>
                  )}
                  <Badge variant="outline" className={`text-[10px] shrink-0 ${srcCfg.cls}`}>{srcCfg.label}</Badge>
                </div>
              );
            })}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-2 border-t border-slate-50 dark:border-slate-800">
              <span className="text-[10px] text-slate-400">
                {page * TRIPS_PER_VEH_PAGE + 1}–{Math.min((page + 1) * TRIPS_PER_VEH_PAGE, trips.length)} de {trips.length}
              </span>
              <div className="flex gap-1">
                <button
                  onClick={e => { e.stopPropagation(); setPage(p => p - 1); }}
                  disabled={page === 0}
                  className="px-2 py-0.5 text-[10px] rounded border border-slate-200 dark:border-slate-600 disabled:opacity-30 hover:bg-slate-50 dark:hover:bg-slate-700"
                >‹</button>
                <button
                  onClick={e => { e.stopPropagation(); setPage(p => p + 1); }}
                  disabled={page >= totalPages - 1}
                  className="px-2 py-0.5 text-[10px] rounded border border-slate-200 dark:border-slate-600 disabled:opacity-30 hover:bg-slate-50 dark:hover:bg-slate-700"
                >›</button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────

export default function Rutas() {
  const { canWrite } = useUserRole();
  const queryClient  = useQueryClient();
  const [tab, setTab]                     = useState('viajes');
  const [fechaVista, setFechaVista]       = useState(hoy());
  const [showImportChat, setShowImportChat] = useState(false);
  const [mesStat, setMesStat]             = useState(hoy().slice(0, 7));
  const [rutaParaNovedad, setRutaParaNovedad] = useState(null);
  const [editingNovedad, setEditingNovedad]   = useState(null);
  const [showDialogAsig, setShowDialogAsig]   = useState(false);
  const [editingAsig, setEditingAsig]         = useState(null);
  const [deleteAsigId, setDeleteAsigId]       = useState(null);
  const [showDialogRuta, setShowDialogRuta]   = useState(false);
  const [editingRuta, setEditingRuta]         = useState(null);
  const [deleteRutaId, setDeleteRutaId]       = useState(null);
  const [filtroTipo, setFiltroTipo]           = useState('all');
  const [filtroGrupo, setFiltroGrupo]         = useState('');

  const { data: rutas = [] }       = useQuery({ queryKey: ['rutas'],            queryFn: () => base44.entities.Ruta.list() });
  const { data: asignaciones = [], isLoading } = useQuery({ queryKey: ['asignaciones_ruta'], queryFn: () => base44.entities.AsignacionRuta.list('-fecha', 2000) });
  const { data: consumidores = [] } = useQuery({ queryKey: ['consumidores'],     queryFn: () => base44.entities.Consumidor.list() });
  const { data: conductores = [] }  = useQuery({ queryKey: ['conductores'],      queryFn: () => base44.entities.Conductor.list() });

  // Movimientos del mes de stats (DESPACHO + COMPRA) para litros reales y comparativo
  const { data: movimientosMes = [] } = useQuery({
    queryKey: ['movimientos-stats', mesStat],
    queryFn: async () => {
      const { data } = await supabase
        .from('movimiento')
        .select('consumidor_id, litros, tipo, fecha, combustible_nombre, odometro, km_recorridos')
        .in('tipo', ['DESPACHO', 'COMPRA'])
        .gte('fecha', mesStat + '-01')
        .lte('fecha', mesStat + '-31')
        .not('litros', 'is', null)
        .gt('litros', 0);
      return data ?? [];
    },
    staleTime: 2 * 60_000,
  });

  const rutaById     = useMemo(() => Object.fromEntries(rutas.map(r => [r.id, r])), [rutas]);
  const rutasActivas = useMemo(() => rutas.filter(r => r.activa), [rutas]);

  // Conjuntos / grupos de rutas disponibles
  const grupos = useMemo(() => [...new Set(rutas.map(r => r.grupo).filter(Boolean))].sort(), [rutas]);

  // Rutas activas filtradas por grupo (para el programa diario)
  const rutasActivasFiltradas = useMemo(() =>
    filtroGrupo ? rutasActivas.filter(r => r.grupo === filtroGrupo) : rutasActivas,
  [rutasActivas, filtroGrupo]);

  const mesActual    = hoy().slice(0, 7);
  const asigMes      = useMemo(() => asignaciones.filter(a => a.fecha?.startsWith(mesActual)), [asignaciones, mesActual]);
  const novedadesMes = useMemo(() => asigMes.filter(a => a.ruta_id),  [asigMes]);
  const extrasMes    = useMemo(() => asigMes.filter(a => !a.ruta_id), [asigMes]);
  const kmMes        = useMemo(() => asigMes.reduce((s, a) => s + (Number(a.km_reales) || 0), 0), [asigMes]);

  // Datos del día seleccionado
  const novedadesHoy = useMemo(() => asignaciones.filter(a => a.ruta_id  && a.fecha === fechaVista), [asignaciones, fechaVista]);
  const extrasHoy    = useMemo(() => asignaciones.filter(a => !a.ruta_id && a.fecha === fechaVista), [asignaciones, fechaVista]);

  const rutasFiltradas = useMemo(() =>
    filtroTipo === 'activa'   ? rutas.filter(r =>  r.activa) :
    filtroTipo === 'inactiva' ? rutas.filter(r => !r.activa) :
    rutas
  , [rutas, filtroTipo]);

  // ── Estadísticas unificadas por mes ──────────────────────────────────────
  const asigStatMes = useMemo(() => asignaciones.filter(a => a.fecha?.startsWith(mesStat)), [asignaciones, mesStat]);

  const canceladasMesStat     = useMemo(() => asigStatMes.filter(a => a.estado === 'cancelada' && a.ruta_id).length,                  [asigStatMes]);
  const sustitMesStat         = useMemo(() => asigStatMes.filter(a => a.ruta_id && a.consumidor_id && a.consumidor_id !== rutaById[a.ruta_id]?.consumidor_id).length, [asigStatMes, rutaById]);
  const kmMesStat             = useMemo(() => asigStatMes.reduce((s, a) => s + (Number(a.km_reales) || 0), 0),                        [asigStatMes]);
  const litrosMesStat         = useMemo(() => asigStatMes.reduce((s, a) => s + (Number(a.litros_estimados) || 0), 0),                 [asigStatMes]);

  const vehicleStatsData = useMemo(() => {
    const byVehicle = {};
    const conById   = Object.fromEntries(consumidores.map(c => [c.id, c]));

    asigStatMes.forEach(a => {
      const key  = a.consumidor_id || `no_${a.id}`;
      const name = a.consumidor_nombre || '—';
      if (!byVehicle[key]) {
        const con = conById[a.consumidor_id];
        byVehicle[key] = {
          key, name, trips: [], kmTotal: 0, litrosTotal: 0,
          chapa:       con?.codigo_interno || null,
          combustible: con?.combustible_nombre || null,
        };
      }
      byVehicle[key].trips.push({
        fecha:       a.fecha,
        descripcion: rutaById[a.ruta_id]?.nombre || a.descripcion_emergencia || '—',
        km:          a.km_reales,
        litros:      a.litros_estimados,
        source:      a.fuente === 'chat' ? 'chat' : (a.auto_generado ? 'auto' : (a.ruta_id ? 'oficial' : 'extra')),
      });
      byVehicle[key].kmTotal     += Number(a.km_reales) || 0;
      byVehicle[key].litrosTotal += Number(a.litros_estimados) || 0;
    });

    Object.values(byVehicle).forEach(v => {
      v.trips.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
      const litrosMovs = movimientosMes
        .filter(m => m.consumidor_id === v.key)
        .reduce((s, m) => s + (Number(m.litros) || 0), 0);
      v.litrosReal = litrosMovs > 0 ? Math.round(litrosMovs * 10) / 10 : null;
      const litrosBase = v.litrosReal ?? v.litrosTotal;
      v.kmPerLitro = (v.kmTotal > 0 && litrosBase > 0)
        ? v.kmTotal / litrosBase
        : null;
    });

    return Object.values(byVehicle).sort((a, b) => b.trips.length - a.trips.length);
  }, [asigStatMes, rutaById, consumidores, movimientosMes]);

  const comparativoData = useMemo(() => {
    const conById  = Object.fromEntries(consumidores.map(c => [c.id, c]));
    const gpsRecs  = asigStatMes.filter(a => a.tipo_viaje === 'recorrido_gps' && a.estado !== 'cancelada');
    const tripRecs = asigStatMes.filter(a => a.tipo_viaje !== 'recorrido_gps' && a.estado !== 'cancelada');

    const ids = new Set([
      ...gpsRecs.map(a => a.consumidor_id),
      ...tripRecs.map(a => a.consumidor_id),
      ...movimientosMes.map(d => d.consumidor_id),
    ].filter(Boolean));

    return Array.from(ids).map(cid => {
      const con   = conById[cid];
      // Solo vehículos: excluir tanques, reservas, equipos, etc.
      if (con && esNoVehiculo(con)) return null;

      const gps   = gpsRecs.filter(a => a.consumidor_id === cid);
      const trips = tripRecs.filter(a => a.consumidor_id === cid);
      const movs  = movimientosMes.filter(d => d.consumidor_id === cid);

      const kmGps  = gps.reduce((s, a)  => s + (Number(a.km_reales) || 0), 0);
      const kmReg  = trips.reduce((s, a) => s + (Number(a.km_reales) || 0), 0);
      const litros = movs.reduce((s, d)  => s + (Number(d.litros)    || 0), 0);

      // Km por odómetro: max(odo) - min(odo) de COMPRAs con odómetro registrado
      const comprasOdo = movs.filter(m => m.tipo === 'COMPRA' && m.odometro > 0);
      let kmOdo = null;
      if (comprasOdo.length >= 2) {
        const odos = comprasOdo.map(m => Number(m.odometro));
        const diff = Math.max(...odos) - Math.min(...odos);
        if (diff > 0) kmOdo = Math.round(diff * 10) / 10;
      }
      if (kmOdo == null) {
        // Fallback: suma de km_recorridos de COMPRAs
        const sumKr = movs
          .filter(m => m.tipo === 'COMPRA' && Number(m.km_recorridos) > 0)
          .reduce((s, m) => s + Number(m.km_recorridos), 0);
        if (sumKr > 0) kmOdo = Math.round(sumKr * 10) / 10;
      }

      return {
        cid,
        nombre:      con?.nombre || gps[0]?.consumidor_nombre || trips[0]?.consumidor_nombre || '—',
        chapa:       con?.codigo_interno     || null,
        combustible: con?.combustible_nombre || null,
        kmGps:   Math.round(kmGps  * 10) / 10,
        kmReg:   Math.round(kmReg  * 10) / 10,
        kmOdo,
        litros:  Math.round(litros * 10) / 10,
        diasGps: gps.length,
        viajes:  trips.length,
        efGps: kmGps  > 0 && litros > 0 ? Math.round(kmGps  / litros * 100) / 100 : null,
        efReg: kmReg  > 0 && litros > 0 ? Math.round(kmReg  / litros * 100) / 100 : null,
        efOdo: kmOdo  > 0 && litros > 0 ? Math.round(kmOdo  / litros * 100) / 100 : null,
      };
    })
    .filter(v => v != null && (v.kmGps > 0 || v.kmReg > 0 || v.kmOdo > 0 || v.litros > 0))
    .sort((a, b) => (b.kmGps + b.kmReg) - (a.kmGps + a.kmReg));
  }, [asigStatMes, movimientosMes, consumidores]);

  const navegarMesStat = (meses) => {
    const d = new Date(mesStat + '-01T12:00:00');
    d.setMonth(d.getMonth() + meses);
    setMesStat(d.toISOString().slice(0, 7));
  };

  const navegarFecha = (dias) => {
    const d = new Date(fechaVista + 'T12:00:00');
    d.setDate(d.getDate() + dias);
    setFechaVista(d.toISOString().slice(0, 10));
  };

  const closeNovedad = () => { setRutaParaNovedad(null); setEditingNovedad(null); };

  // Mutations — novedades / asignaciones
  const createAsigMut = useMutation({
    mutationFn: d => base44.entities.AsignacionRuta.create(d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asignaciones_ruta'] });
      toast.success('Registrado');
      setShowDialogAsig(false);
      closeNovedad();
    },
    onError: () => toast.error('Error al registrar'),
  });
  const updateAsigMut = useMutation({
    mutationFn: ({ id, d }) => base44.entities.AsignacionRuta.update(id, d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asignaciones_ruta'] });
      toast.success('Actualizado');
      setEditingAsig(null);
      closeNovedad();
    },
    onError: () => toast.error('Error al actualizar'),
  });
  const deleteAsigMut = useMutation({
    mutationFn: id => base44.entities.AsignacionRuta.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['asignaciones_ruta'] }); toast.success('Eliminado'); setDeleteAsigId(null); },
  });

  // Mutations — catálogo
  async function saveWaypoints(rutaId, paradas) {
    await supabase.from('ruta_marcador').delete().eq('ruta_id', rutaId);
    if (paradas.length > 0) {
      await supabase.from('ruta_marcador').insert(
        paradas.map(p => ({ ruta_id: rutaId, marcador_id: p.marcador_id, orden: p.orden }))
      );
    }
    queryClient.invalidateQueries({ queryKey: ['ruta_marcadores'] });
  }

  async function handleSaveRuta(data) {
    const { _paradas = [], ...rutaData } = data;
    try {
      let rutaId;
      if (editingRuta) {
        await base44.entities.Ruta.update(editingRuta.id, rutaData);
        rutaId = editingRuta.id;
      } else {
        const created = await base44.entities.Ruta.create(rutaData);
        rutaId = created.id;
      }
      await saveWaypoints(rutaId, _paradas);
      queryClient.invalidateQueries({ queryKey: ['rutas'] });
      toast.success(editingRuta ? 'Ruta actualizada' : 'Ruta creada');
      setShowDialogRuta(false);
      setEditingRuta(null);
    } catch (err) {
      toast.error(`Error: ${err.message}`);
    }
  }
  const deleteRutaMut = useMutation({
    mutationFn: async (id) => {
      // Eliminar primero las novedades/asignaciones asociadas para evitar FK orphan
      const asociadas = asignaciones.filter(a => a.ruta_id === id);
      await Promise.all(asociadas.map(a => base44.entities.AsignacionRuta.delete(a.id)));
      return base44.entities.Ruta.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rutas'] });
      queryClient.invalidateQueries({ queryKey: ['asignaciones_ruta'] });
      toast.success('Ruta eliminada');
      setDeleteRutaId(null);
    },
    onError: () => toast.error('Error al eliminar la ruta'),
  });

  // Guardar novedad (crea o actualiza la existente para ese ruta+día)
  const handleSaveNovedad = (formData) => {
    const destino = editingNovedad ?? novedadesHoy.find(a => a.ruta_id === rutaParaNovedad.id);
    const payload = {
      ...formData,
      ruta_id:       rutaParaNovedad.id,
      fecha:         fechaVista,
      tipo_viaje:    'regular',
      auto_generado: false,
    };
    if (destino) {
      updateAsigMut.mutate({ id: destino.id, d: payload });
    } else {
      createAsigMut.mutate(payload);
    }
  };

  // Resumen del día
  const canceladasHoy = useMemo(() => novedadesHoy.filter(n => n.estado === 'cancelada').length, [novedadesHoy]);
  const sustitHoy     = useMemo(() => novedadesHoy.filter(n => n.ruta_id && n.consumidor_id && n.consumidor_id !== rutaById[n.ruta_id]?.consumidor_id).length, [novedadesHoy, rutaById]);
  const kmHoy         = useMemo(() => [...novedadesHoy, ...extrasHoy].reduce((s, a) => s + (Number(a.km_reales) || 0), 0), [novedadesHoy, extrasHoy]);
  const litrosHoy     = useMemo(() => [...novedadesHoy, ...extrasHoy].reduce((s, a) => s + (Number(a.litros_estimados) || 0), 0), [novedadesHoy, extrasHoy]);

  // Importar desde chat
  const handleImportar = async (payload) => {
    try {
      await Promise.all(payload.map(d => base44.entities.AsignacionRuta.create(d)));
      queryClient.invalidateQueries({ queryKey: ['asignaciones_ruta'] });
      toast.success(`${payload.length} registro${payload.length !== 1 ? 's' : ''} importado${payload.length !== 1 ? 's' : ''}`);
      setShowImportChat(false);
    } catch {
      toast.error('Error al importar registros');
    }
  };

  // Computed before JSX return to avoid IIFE-in-JSX bundler issues
  const rutaAEliminar      = rutas.find(r => r.id === deleteRutaId) ?? null;
  const novedadesAsocCount = deleteRutaId ? asignaciones.filter(a => a.ruta_id === deleteRutaId).length : 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Rutas</h1>
        <p className="text-xs text-slate-400">Programa habitual de rutas con registro de novedades diarias</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: 'Novedades este mes', value: novedadesMes.length,                              cls: novedadesMes.length > 0 ? 'text-amber-600' : 'text-slate-400' },
          { label: 'Viajes extra',       value: extrasMes.length,                                 cls: extrasMes.length > 0 ? 'text-orange-600' : 'text-slate-400' },
          { label: 'Km registrados',     value: kmMes > 0 ? `${kmMes.toFixed(0)} km` : '—',      cls: 'text-slate-700 dark:text-slate-200' },
          { label: 'Rutas activas',      value: rutasActivas.length,                              cls: 'text-emerald-600' },
        ].map(k => (
          <Card key={k.label} className="border-0 shadow-sm">
            <CardContent className="p-3">
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">{k.label}</p>
              <p className={`text-lg font-bold mt-0.5 ${k.cls}`}>{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 flex-wrap border-b border-slate-200 dark:border-slate-700">
        {[
          { value: 'viajes',      label: 'Programa diario',  icon: <Navigation className="w-3.5 h-3.5" /> },
          { value: 'catalogo',   label: 'Catálogo de rutas', icon: <BookOpen   className="w-3.5 h-3.5" /> },
          { value: 'stats',      label: 'Estadísticas',      icon: <BarChart3  className="w-3.5 h-3.5" /> },
          { value: 'comparativo', label: 'GPS vs Mov.',       icon: <Satellite  className="w-3.5 h-3.5" /> },
          { value: 'mapa',       label: 'Mapa',              icon: <Map        className="w-3.5 h-3.5" /> },
          { value: 'marcadores', label: 'Marcadores',         icon: <MapPin     className="w-3.5 h-3.5" /> },
        ].map(({ value, label, icon }) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t border-b-2 transition-colors -mb-px ${
              tab === value
                ? 'border-sky-500 text-sky-700 dark:text-sky-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            {icon}{label}
          </button>
        ))}
      </div>

      {/* ── Tab: Programa diario ─────────────────────────────────────────────── */}
      {tab === 'viajes' && (
        <div className="space-y-5">
          {/* Navegación de fecha */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navegarFecha(-1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Input
                type="date" value={fechaVista}
                onChange={e => { setFechaVista(e.target.value); setShowImportChat(false); }}
                className="w-40 h-8 text-xs"
              />
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navegarFecha(1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            <span className="text-xs text-slate-400 capitalize">
              {new Date(fechaVista + 'T12:00:00').toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}
            </span>
            {isLoading && <span className="text-xs text-slate-300">Cargando...</span>}
            <div className="ml-auto">
              {canWrite && (
                <Button
                  size="sm" variant="outline"
                  className="gap-1.5 text-xs h-8 text-sky-600 border-sky-200 hover:bg-sky-50 dark:border-sky-800/50 dark:hover:bg-sky-900/20"
                  onClick={() => setShowImportChat(v => !v)}
                >
                  <Upload className="w-3 h-3" />
                  {showImportChat ? 'Cerrar importación' : 'Importar del chat'}
                </Button>
              )}
            </div>
          </div>

          {/* Resumen del día */}
          {(novedadesHoy.length > 0 || extrasHoy.length > 0 || rutasActivas.length > 0) && (
            <div className="flex flex-wrap gap-3 text-xs text-slate-500 bg-slate-50 dark:bg-slate-800/40 rounded-xl px-3 py-2">
              {rutasActivas.length > 0 && (
                <span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">{rutasActivas.length - canceladasHoy}</span>
                  <span className="text-slate-400">/{rutasActivas.length} rutas</span>
                </span>
              )}
              {canceladasHoy > 0 && (
                <span className="text-red-500 font-medium">{canceladasHoy} cancelada{canceladasHoy !== 1 ? 's' : ''}</span>
              )}
              {sustitHoy > 0 && (
                <span className="text-amber-600 font-medium">{sustitHoy} sustitución{sustitHoy !== 1 ? 'es' : ''}</span>
              )}
              {extrasHoy.length > 0 && (
                <span className="text-orange-500">{extrasHoy.length} extra{extrasHoy.length !== 1 ? 's' : ''}</span>
              )}
              {kmHoy > 0 && (
                <span className="text-sky-600 font-medium">{kmHoy.toFixed(0)} km</span>
              )}
              {litrosHoy > 0 && (
                <span className="text-emerald-600 font-medium">{litrosHoy.toFixed(1)} L est.</span>
              )}
              {rutasActivas.length > 0 && (
                <span className="ml-auto font-semibold text-slate-600 dark:text-slate-300">
                  {Math.round((rutasActivas.length - canceladasHoy) / rutasActivas.length * 100)}% cumplimiento
                </span>
              )}
            </div>
          )}

          {/* Panel de importación desde chat */}
          {showImportChat && (
            <ImportarChatPanel
              fechaVista={fechaVista}
              consumidores={consumidores}
              rutasCatalogo={rutasActivas}
              onImportar={handleImportar}
              onClose={() => setShowImportChat(false)}
            />
          )}

          {/* Rutas activas del día */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Rutas activas · {rutasActivasFiltradas.length}
                {filtroGrupo && rutasActivas.length !== rutasActivasFiltradas.length && (
                  <span className="font-normal normal-case ml-1 text-slate-400">de {rutasActivas.length}</span>
                )}
              </h3>
              <div className="flex items-center gap-2 ml-auto">
                {grupos.length > 0 && (
                  <Select value={filtroGrupo || '_all'} onValueChange={v => setFiltroGrupo(v === '_all' ? '' : v)}>
                    <SelectTrigger className="h-7 text-xs w-40">
                      <SelectValue placeholder="Todos los grupos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_all">Todos los grupos</SelectItem>
                      {grupos.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                {novedadesHoy.length > 0 && (
                  <span className="text-[10px] text-amber-600 font-medium shrink-0">
                    {novedadesHoy.length} novedad{novedadesHoy.length !== 1 ? 'es' : ''} hoy
                  </span>
                )}
              </div>
            </div>

            {rutasActivasFiltradas.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <Navigation className="w-8 h-8 text-slate-200 mx-auto" />
                {rutasActivas.length === 0
                  ? <><p className="text-sm text-slate-400">No hay rutas activas en el catálogo.</p>
                      <Button size="sm" variant="outline" onClick={() => setTab('catalogo')}>Ir al catálogo</Button></>
                  : <p className="text-sm text-slate-400">Sin rutas en el grupo seleccionado.</p>
                }
              </div>
            ) : (
              <div className="space-y-2">
                {rutasActivasFiltradas.map(ruta => {
                  const novedad = novedadesHoy.find(a => a.ruta_id === ruta.id) ?? null;
                  return (
                    <RutaDiaRow
                      key={ruta.id}
                      ruta={ruta}
                      novedad={novedad}
                      canWrite={canWrite}
                      onRegistrar={() => { setRutaParaNovedad(ruta); setEditingNovedad(null); }}
                      onEditar={() => { setRutaParaNovedad(ruta); setEditingNovedad(novedad); }}
                      onEliminar={() => setDeleteAsigId(novedad?.id)}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Viajes extra del día */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Viajes extra · {extrasHoy.length}
              </h3>
              {canWrite && (
                <Button
                  size="sm" variant="outline"
                  className="gap-1 text-xs h-7 text-orange-600 border-orange-200 hover:bg-orange-50 dark:border-orange-800/50 dark:hover:bg-orange-900/20"
                  onClick={() => setShowDialogAsig(true)}
                >
                  <Plus className="w-3 h-3" /> Registrar viaje extra
                </Button>
              )}
            </div>
            {extrasHoy.length === 0 ? (
              <p className="text-xs text-slate-300 text-center py-3">Sin viajes extra este día</p>
            ) : (
              <div className="space-y-2">
                {extrasHoy.map(asig => (
                  <AsignacionCard
                    key={asig.id}
                    asig={asig}
                    canWrite={canWrite}
                    onEdit={() => setEditingAsig(asig)}
                    onDelete={() => setDeleteAsigId(asig.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Catálogo ─────────────────────────────────────────────────────── */}
      {tab === 'catalogo' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex gap-1">
              {[['all','Todas'],['activa','Activas'],['inactiva','Inactivas']].map(([v, l]) => (
                <button
                  key={v} onClick={() => setFiltroTipo(v)}
                  className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                    filtroTipo === v ? 'bg-sky-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
            <span className="text-xs text-slate-400 flex-1">{rutasFiltradas.length} ruta{rutasFiltradas.length !== 1 ? 's' : ''}</span>
            {canWrite && (
              <Button size="sm" className="bg-sky-600 hover:bg-sky-700 gap-1.5" onClick={() => setShowDialogRuta(true)}>
                <Plus className="w-3.5 h-3.5" /> Nueva ruta
              </Button>
            )}
          </div>

          {rutasFiltradas.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">Sin rutas en esta categoría</div>
          ) : (
            <div className="space-y-2">
              {rutasFiltradas.map(r => {
                const viajesMes = novedadesMes.filter(a => a.ruta_id === r.id).length;
                return (
                  <div
                    key={r.id}
                    className={`border rounded-xl p-3 transition-colors hover:bg-slate-50/40 dark:hover:bg-slate-800/40 ${
                      r.activa ? 'border-slate-100 dark:border-slate-700' : 'border-slate-100 dark:border-slate-700 opacity-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{r.nombre}</span>
                          {!r.activa && <Badge variant="outline" className="text-[10px] text-slate-400">Inactiva</Badge>}
                          {r.grupo && (
                            <Badge variant="outline" className="text-[10px] bg-violet-50 text-violet-600 border-violet-200 dark:bg-violet-900/20 dark:border-violet-700">
                              {r.grupo}
                            </Badge>
                          )}
                          {r.lat_inicio != null && (
                            <Map className="w-3 h-3 text-emerald-500" title="Tiene coordenadas" />
                          )}
                        </div>
                        <div className="flex flex-wrap gap-3 mt-1 text-[11px] text-slate-500">
                          {r.punto_inicio && r.punto_fin && <span>{r.punto_inicio} → {r.punto_fin}</span>}
                          {r.municipio       && <span>{r.municipio}</span>}
                          {r.distancia_km    && <span className="font-medium text-sky-600">{r.distancia_km} km</span>}
                          {r.tiempo_estimado && <span>{r.tiempo_estimado}</span>}
                          {r.frecuencia      && <span className="text-slate-400">{r.frecuencia}</span>}
                        </div>
                        {/* Asignación habitual */}
                        {(r.consumidor_nombre || r.conductor_nombre) && (
                          <div className="flex flex-wrap gap-3 mt-1.5 text-[11px] text-slate-500 border-t border-slate-50 dark:border-slate-800 pt-1.5">
                            {r.consumidor_nombre && (
                              <span className="flex items-center gap-1">
                                <Car className="w-3 h-3 text-slate-400" />{r.consumidor_nombre}
                              </span>
                            )}
                            {r.conductor_nombre && (
                              <span className="flex items-center gap-1">
                                <User2 className="w-3 h-3 text-slate-400" />{r.conductor_nombre}
                              </span>
                            )}
                          </div>
                        )}
                        {!r.consumidor_id && r.activa && (
                          <p className="text-[10px] text-amber-500 mt-1 italic">Sin vehículo habitual asignado</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {viajesMes > 0 && (
                          <span className="text-[10px] text-sky-600 font-semibold bg-sky-50 dark:bg-sky-900/40 px-2 py-0.5 rounded-full">
                            {viajesMes} novedad{viajesMes !== 1 ? 'es' : ''}/mes
                          </span>
                        )}
                        {canWrite && (<>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-300 hover:text-slate-600" onClick={() => setEditingRuta(r)}>
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-300 hover:text-red-500" onClick={() => setDeleteRutaId(r.id)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </>)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Estadísticas ─────────────────────────────────────────────────── */}
      {tab === 'stats' && (
        <div className="space-y-4">
          {/* Selector de mes */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navegarMesStat(-1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 min-w-[150px] text-center capitalize">
              {new Date(mesStat + '-01T12:00:00').toLocaleDateString('es', { month: 'long', year: 'numeric' })}
            </span>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navegarMesStat(1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          {/* KPIs del mes */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: 'Viajes registrados', value: asigStatMes.length,                                             cls: 'text-slate-700 dark:text-slate-200' },
              { label: 'Cancelaciones',      value: canceladasMesStat,                                              cls: canceladasMesStat > 0 ? 'text-red-500' : 'text-slate-400' },
              { label: 'km totales',         value: kmMesStat > 0 ? `${kmMesStat.toFixed(0)} km` : '—',            cls: 'text-sky-600' },
              { label: 'Sustituciones',      value: sustitMesStat,                                                  cls: sustitMesStat > 0 ? 'text-amber-600' : 'text-slate-400' },
            ].map(k => (
              <Card key={k.label} className="border-0 shadow-sm">
                <CardContent className="p-3">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">{k.label}</p>
                  <p className={`text-lg font-bold mt-0.5 tabular-nums ${k.cls}`}>{k.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          {litrosMesStat > 0 && (
            <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 dark:bg-slate-800/40 rounded-xl px-3 py-2">
              <span className="text-emerald-600 font-semibold tabular-nums">{litrosMesStat.toFixed(1)} L</span>
              <span>estimados este período (desde importaciones del chat)</span>
            </div>
          )}

          {/* Leyenda de tags */}
          <div className="flex items-center gap-2 flex-wrap">
            {Object.entries(SOURCE_CFG).map(([key, cfg]) => (
              <Badge key={key} variant="outline" className={`text-[10px] ${cfg.cls}`}>{cfg.label}</Badge>
            ))}
            <span className="text-[10px] text-slate-400">— origen del registro</span>
          </div>

          {/* Tarjetas por vehículo */}
          {vehicleStatsData.length === 0 ? (
            <div className="py-14 text-center text-sm text-slate-400">Sin registros para este mes</div>
          ) : (
            <div className="space-y-3">
              {vehicleStatsData.map(grupo => (
                <VehiculoStatsCard key={grupo.key} grupo={grupo} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: GPS vs Movimientos ──────────────────────────────────────────── */}
      {tab === 'comparativo' && (
        <div className="space-y-4">
          {/* Selector de mes (compartido con stats) */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navegarMesStat(-1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 min-w-[150px] text-center capitalize">
              {new Date(mesStat + '-01T12:00:00').toLocaleDateString('es', { month: 'long', year: 'numeric' })}
            </span>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navegarMesStat(1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          {/* Leyenda */}
          <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-full bg-violet-500"></span>
              Km GPS — suma de recorridos guardados desde GPS
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-full bg-sky-500"></span>
              Km Reg. — km declarados en novedades y viajes extra
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-full bg-emerald-500"></span>
              Litros — despachos + compras del período
            </span>
          </div>

          {comparativoData.length === 0 ? (
            <div className="py-14 text-center text-sm text-slate-400">Sin datos para este período</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-left">
                    <th className="px-3 py-2.5 font-semibold text-slate-500">Vehículo</th>
                    <th className="px-3 py-2.5 font-semibold text-violet-500 text-right">Km GPS</th>
                    <th className="px-3 py-2.5 font-semibold text-amber-500 text-right">Km Odóm.</th>
                    <th className="px-3 py-2.5 font-semibold text-sky-500 text-right">Km Reg.</th>
                    <th className="px-3 py-2.5 font-semibold text-emerald-500 text-right">Litros</th>
                    <th className="px-3 py-2.5 font-semibold text-violet-400 text-right">km/L GPS</th>
                    <th className="px-3 py-2.5 font-semibold text-amber-400 text-right">km/L Odóm.</th>
                    <th className="px-3 py-2.5 font-semibold text-sky-400 text-right">km/L Reg.</th>
                    <th className="px-3 py-2.5 font-semibold text-slate-400 text-right">Días / Viajes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {comparativoData.map(v => {
                    const diff = v.kmGps > 0 && v.kmReg > 0
                      ? Math.abs(v.kmGps - v.kmReg) / Math.max(v.kmGps, v.kmReg)
                      : null;
                    const discrepancia = diff != null && diff > 0.25;
                    return (
                      <tr key={v.cid} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="px-3 py-2.5">
                          <p className="font-medium text-slate-700 dark:text-slate-200 truncate max-w-[180px]">{v.nombre}</p>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            {v.chapa && (
                              <span className="font-mono text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">{v.chapa}</span>
                            )}
                            {v.combustible && <CombustibleBadge nombre={v.combustible} />}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {v.kmGps > 0
                            ? <span className="font-semibold text-violet-600">{v.kmGps.toFixed(0)}</span>
                            : <span className="text-slate-300">—</span>
                          }
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {v.kmOdo != null
                            ? <span className="font-semibold text-amber-600">{v.kmOdo.toFixed(0)}</span>
                            : <span className="text-slate-300">—</span>
                          }
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {discrepancia && v.kmReg > 0 && (
                            <AlertTriangle className="inline w-3 h-3 text-amber-400 mr-1" title={`Diferencia ${(diff * 100).toFixed(0)}% vs GPS`} />
                          )}
                          {v.kmReg > 0
                            ? <span className="font-semibold text-sky-600">{v.kmReg.toFixed(0)}</span>
                            : <span className="text-slate-300">—</span>
                          }
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {v.litros > 0
                            ? <span className="font-semibold text-emerald-600">{v.litros.toFixed(1)}</span>
                            : <span className="text-slate-300">—</span>
                          }
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {v.efGps != null
                            ? <span className="font-medium text-violet-500">{v.efGps.toFixed(2)}</span>
                            : <span className="text-slate-300">—</span>
                          }
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {v.efOdo != null
                            ? <span className="font-medium text-amber-500">{v.efOdo.toFixed(2)}</span>
                            : <span className="text-slate-300">—</span>
                          }
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {v.efReg != null
                            ? <span className="font-medium text-sky-500">{v.efReg.toFixed(2)}</span>
                            : <span className="text-slate-300">—</span>
                          }
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className="text-violet-400 tabular-nums">{v.diasGps || '—'}</span>
                          <span className="text-slate-300 mx-1">/</span>
                          <span className="text-sky-400 tabular-nums">{v.viajes || '—'}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {/* Totales */}
                {(() => {
                  const tot = comparativoData.reduce((acc, v) => ({
                    kmGps:  acc.kmGps  + v.kmGps,
                    kmOdo:  acc.kmOdo  + (v.kmOdo  ?? 0),
                    kmReg:  acc.kmReg  + v.kmReg,
                    litros: acc.litros + v.litros,
                  }), { kmGps: 0, kmOdo: 0, kmReg: 0, litros: 0 });
                  return (
                    <tfoot>
                      <tr className="bg-slate-50 dark:bg-slate-800 border-t-2 border-slate-200 dark:border-slate-600 font-semibold text-xs">
                        <td className="px-3 py-2 text-slate-500 text-[11px] uppercase tracking-wide">Total</td>
                        <td className="px-3 py-2 text-right tabular-nums text-violet-600">{tot.kmGps.toFixed(0)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-amber-600">{tot.kmOdo > 0 ? tot.kmOdo.toFixed(0) : '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-sky-600">{tot.kmReg.toFixed(0)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-emerald-600">{tot.litros.toFixed(1)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-violet-400">
                          {tot.kmGps > 0 && tot.litros > 0 ? (tot.kmGps / tot.litros).toFixed(2) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-amber-400">
                          {tot.kmOdo > 0 && tot.litros > 0 ? (tot.kmOdo / tot.litros).toFixed(2) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-sky-400">
                          {tot.kmReg > 0 && tot.litros > 0 ? (tot.kmReg / tot.litros).toFixed(2) : '—'}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  );
                })()}
              </table>
            </div>
          )}

          <div className="text-[11px] text-slate-400 space-y-0.5 pt-1">
            <p>⚠ Icono de alerta indica diferencia mayor al 25% entre km GPS y km registrados — puede señalar recorridos no declarados.</p>
            <p><span className="text-amber-500 font-medium">Km Odóm.</span> = diferencia máx–mín del odómetro en compras del período; se actualiza con cada nueva lectura registrada.</p>
            <p>Litros = despachos internos + compras en surtidor registradas en Movimientos para el período.</p>
          </div>
        </div>
      )}

      {/* ── Tab: Mapa ─────────────────────────────────────────────────────────── */}
      {tab === 'mapa' && (
        <div className="space-y-3">
          <p className="text-xs text-slate-400">
            Haz clic en cualquier punto del mapa para obtener sus coordenadas y
            asignarlas a una ruta en el catálogo.
          </p>
          <MapaRutas rutas={rutas} novedadesHoy={novedadesHoy} />
        </div>
      )}

      {/* ── Tab: Marcadores ───────────────────────────────────────────────────── */}
      {tab === 'marcadores' && (
        <div className="space-y-3">
          <p className="text-xs text-slate-400">
            Coloca puntos de interés en el mapa. Úsalos luego para definir rutas habituales.
          </p>
          <MarcadoresPanel canWrite={canWrite} />
        </div>
      )}

      {/* ── Diálogos ──────────────────────────────────────────────────────────── */}
      {rutaParaNovedad && (
        <DialogNovedad
          ruta={rutaParaNovedad}
          novedad={editingNovedad}
          consumidores={consumidores}
          conductores={conductores}
          onClose={closeNovedad}
          onSave={handleSaveNovedad}
        />
      )}
      {(showDialogAsig || editingAsig) && (
        <DialogAsignacion
          asignacion={editingAsig}
          consumidores={consumidores}
          conductores={conductores}
          onClose={() => { setShowDialogAsig(false); setEditingAsig(null); }}
          onSave={d => editingAsig
            ? updateAsigMut.mutate({ id: editingAsig.id, d })
            : createAsigMut.mutate(d)}
        />
      )}
      {(showDialogRuta || editingRuta) && (
        <DialogRuta
          ruta={editingRuta}
          consumidores={consumidores}
          conductores={conductores}
          onClose={() => { setShowDialogRuta(false); setEditingRuta(null); }}
          onSave={handleSaveRuta}
        />
      )}
      <ConfirmDialog
        open={!!deleteAsigId}
        onOpenChange={open => { if (!open) setDeleteAsigId(null); }}
        title="Eliminar registro"
        description="¿Seguro que deseas eliminar este registro de novedad o viaje extra?"
        onConfirm={() => deleteAsigMut.mutate(deleteAsigId)}
        destructive
      />
      <ConfirmDialog
        open={!!deleteRutaId}
        onOpenChange={open => { if (!open) setDeleteRutaId(null); }}
        title={`Eliminar ruta${rutaAEliminar ? ` "${rutaAEliminar.nombre}"` : ''}`}
        description={
          novedadesAsocCount > 0
            ? `Esta ruta tiene ${novedadesAsocCount} registro${novedadesAsocCount !== 1 ? 's' : ''} de novedades asociados que también serán eliminados. Esta acción no se puede deshacer.`
            : 'Se eliminará permanentemente del catálogo. Esta acción no se puede deshacer.'
        }
        onConfirm={() => deleteRutaMut.mutate(deleteRutaId)}
        destructive
      />
    </div>
  );
}
