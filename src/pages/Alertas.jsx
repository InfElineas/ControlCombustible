import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, Settings2, Mail, ChevronDown, ChevronUp, Send, Fuel, ShieldAlert, Trash2, RefreshCw, CheckCircle2 } from 'lucide-react';
import { useUserRole } from '@/components/ui-helpers/useUserRole';
import { toast } from 'sonner';

// Stock real de un tanque de bonificación (excluye DESPACHOs de bonificación como entradas)
function calcStockOrigen(tanqueId, combustibleId, combustibleNombre, movimientos, consumidores) {
  const tanque = consumidores.find(c => c.id === tanqueId);
  if (!tanque) return null;
  const ES_BON = m => m.tipo === 'DESPACHO' && (m.referencia || '').startsWith('Bonificación combustible:');
  const ini = tanque.litros_iniciales ?? 0;
  const entradas = movimientos
    .filter(m => (m.tipo === 'COMPRA' || m.tipo === 'DEPOSITO' || m.tipo === 'DESPACHO')
      && m.consumidor_id === tanqueId && !ES_BON(m)
      && (m.combustible_id === combustibleId || m.combustible_nombre === combustibleNombre))
    .reduce((s, m) => s + (m.litros || 0), 0);
  const salidas = movimientos
    .filter(m => m.tipo === 'DESPACHO' && m.consumidor_origen_id === tanqueId
      && (m.combustible_id === combustibleId || m.combustible_nombre === combustibleNombre))
    .reduce((s, m) => s + (m.litros || 0), 0);
  return ini + entradas - salidas;
}

// Determina estado según porcentaje de nivel restante (menor % = peor)
function estadoNivel(pct, umbralAlerta, umbralCritico) {
  if (pct == null) return null;
  if (pct <= umbralCritico) return { nivel: 'critico', pct };
  if (pct <= umbralAlerta) return { nivel: 'alerta', pct };
  return { nivel: 'ok', pct };
}

// Calcula el nivel estimado del tanque a partir del historial de cargas
function calcularNivelTanque(consumidor, movimientos) {
  const fills = movimientos
    .filter(m => (m.tipo === 'COMPRA' || m.tipo === 'DESPACHO') && m.consumidor_id === consumidor.id)
    .sort((a, b) => {
      if (a.odometro != null && b.odometro != null) return b.odometro - a.odometro;
      return (b.fecha || '').localeCompare(a.fecha || '');
    });

  if (fills.length === 0) return null;

  const lastFill = fills[0];
  const nivelTrasUltimaCarga = (lastFill.nivel_tanque || 0) + (lastFill.litros || 0);
  const capacidad = consumidor.datos_vehiculo?.capacidad_tanque ?? null;
  const consumoRef =
    consumidor.datos_vehiculo?.indice_consumo_real ||
    consumidor.datos_vehiculo?.indice_consumo_fabricante ||
    null;

  // Estimar consumo desde la última carga usando odómetro posterior
  let nivelEstimado = nivelTrasUltimaCarga;
  let kmDesde = null;

  if (lastFill.odometro != null && consumoRef) {
    const movsPost = movimientos
      .filter(m => m.consumidor_id === consumidor.id && m.odometro != null && m.odometro > lastFill.odometro)
      .sort((a, b) => b.odometro - a.odometro);
    if (movsPost.length > 0) {
      kmDesde = movsPost[0].odometro - lastFill.odometro;
      nivelEstimado = Math.max(0, nivelTrasUltimaCarga - kmDesde / consumoRef);
    }
  }

  const diasDesde = lastFill.fecha
    ? Math.floor((Date.now() - new Date(lastFill.fecha)) / 86400000)
    : null;

  const pct = capacidad ? Math.min(100, (nivelEstimado / capacidad) * 100) : null;

  return {
    lastFill,
    nivelTrasUltimaCarga,
    nivelEstimado,
    capacidad,
    consumoRef,
    kmDesde,
    pct,
    litrosParaLlenar: capacidad ? Math.max(0, capacidad - nivelEstimado) : null,
    diasDesde,
  };
}

function NivelTanqueRow({ consumidor, datos, config, onConfigEdit }) {
  const [expandido, setExpandido] = useState(false);
  const [enviandoEmail, setEnviandoEmail] = useState(false);

  const umbralAlerta  = config?.umbral_alerta_pct  ?? 40;
  const umbralCritico = config?.umbral_critico_pct ?? 20;
  const estado = estadoNivel(datos?.pct, umbralAlerta, umbralCritico);

  const colorEstado =
    estado?.nivel === 'critico' ? 'text-red-600 bg-red-50 border-red-200'
    : estado?.nivel === 'alerta' ? 'text-amber-600 bg-amber-50 border-amber-200'
    : estado?.nivel === 'ok'     ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
    : 'text-slate-500 bg-slate-100 border-slate-200';

  const colorBarra =
    estado?.nivel === 'critico' ? 'bg-red-400'
    : estado?.nivel === 'alerta' ? 'bg-amber-400'
    : 'bg-emerald-400';

  const labelEstado =
    estado?.nivel === 'critico' ? 'Nivel crítico'
    : estado?.nivel === 'alerta' ? 'Nivel bajo'
    : estado?.nivel === 'ok'     ? 'Normal'
    : 'Sin datos';

  const handleEnviarEmail = async (e) => {
    e.stopPropagation();
    if (!config?.email_destino) return;
    setEnviandoEmail(true);
    const nivelStr = datos?.pct != null ? `${datos.pct.toFixed(0)}%` : `${datos?.nivelEstimado?.toFixed(0) ?? '?'} L`;
    await base44.integrations.Core.SendEmail({
      to: config.email_destino,
      subject: `⚠ Nivel bajo de combustible — ${consumidor.nombre}`,
      body: `Se ha detectado un nivel bajo de combustible en: ${consumidor.nombre}${consumidor.codigo_interno ? ` (${consumidor.codigo_interno})` : ''}.\n\nNivel estimado actual: ${nivelStr}${datos?.litrosParaLlenar != null ? `\nNecesita cargar aprox. ${datos.litrosParaLlenar.toFixed(0)} L para llenar el tanque.` : ''}\n\nConsulte el sistema de control de combustible para más detalles.`,
    });
    toast.success(`Email enviado a ${config.email_destino}`);
    setEnviandoEmail(false);
  };

  return (
    <div className="border border-slate-100 rounded-xl overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50/60 transition-colors"
        onClick={() => setExpandido(e => !e)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-slate-700 truncate">{consumidor.nombre}</p>
            {consumidor.codigo_interno && (
              <span className="text-[11px] text-slate-400 font-mono shrink-0">{consumidor.codigo_interno}</span>
            )}
          </div>
          <p className="text-[11px] text-slate-400">{consumidor.tipo_consumidor_nombre || 'Sin tipo'}</p>
          {datos?.pct != null && (
            <div className="mt-1.5 flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${colorBarra}`}
                  style={{ width: `${Math.min(100, datos.pct)}%` }}
                />
              </div>
              <span className="text-[10px] text-slate-500 shrink-0 w-8 text-right">
                {datos.pct.toFixed(0)}%
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {datos && (
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold text-slate-700">
                {datos.nivelEstimado.toFixed(0)} L
              </p>
              <p className="text-[10px] text-slate-400">
                {datos.capacidad ? `de ${datos.capacidad.toFixed(0)} L` : 'sin capacidad reg.'}
              </p>
            </div>
          )}
          <Badge variant="outline" className={`text-[10px] border ${colorEstado}`}>
            {estado != null && estado.nivel !== 'ok' && <AlertTriangle className="w-2.5 h-2.5 mr-1" />}
            {labelEstado}
          </Badge>
          {config?.alerta_email && config?.email_destino && estado?.nivel === 'critico' && (
            <Button
              variant="ghost" size="icon"
              className="h-7 w-7 text-sky-500 hover:text-sky-700"
              disabled={enviandoEmail}
              onClick={handleEnviarEmail}
              title="Enviar alerta por email"
            >
              <Send className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button
            variant="ghost" size="icon"
            className="h-7 w-7 text-slate-400 hover:text-sky-600"
            onClick={e => { e.stopPropagation(); onConfigEdit(consumidor); }}
          >
            <Settings2 className="w-3.5 h-3.5" />
          </Button>
          {expandido ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>
      </div>

      {expandido && (
        <div className="px-4 pb-4 border-t border-slate-100 bg-slate-50/30 pt-3 space-y-3">
          {datos ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">Nivel estimado</p>
                  <p className="text-sm font-semibold text-slate-700">{datos.nivelEstimado.toFixed(1)} L</p>
                  {datos.capacidad && (
                    <p className="text-[10px] text-slate-400">{datos.pct.toFixed(0)}% de {datos.capacidad.toFixed(0)} L</p>
                  )}
                </div>
                {datos.litrosParaLlenar != null && (
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide">Para llenar</p>
                    <p className="text-sm font-semibold text-sky-700">{datos.litrosParaLlenar.toFixed(1)} L</p>
                  </div>
                )}
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">Última carga</p>
                  <p className="text-sm font-semibold text-slate-700">
                    {datos.diasDesde != null
                      ? `Hace ${datos.diasDesde} día${datos.diasDesde !== 1 ? 's' : ''}`
                      : datos.lastFill.fecha || '—'}
                  </p>
                  <p className="text-[10px] text-slate-400">{datos.lastFill.litros?.toFixed(1)} L cargados</p>
                </div>
                {datos.consumoRef && (
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide">Consumo ref.</p>
                    <p className="text-sm font-semibold text-slate-700">{datos.consumoRef.toFixed(2)} km/L</p>
                    {datos.kmDesde != null && (
                      <p className="text-[10px] text-slate-400">{datos.kmDesde.toFixed(0)} km desde última carga</p>
                    )}
                  </div>
                )}
              </div>

              {datos.litrosParaLlenar != null && datos.litrosParaLlenar > 0.5 && (
                <div className="bg-sky-50 border border-sky-100 rounded-xl px-3 py-2 text-xs text-sky-700">
                  <b>Recarga sugerida:</b> {datos.litrosParaLlenar.toFixed(0)} L para completar el tanque (capacidad {datos.capacidad.toFixed(0)} L).
                </div>
              )}

              {!datos.capacidad && (
                <p className="text-[11px] text-amber-600">
                  Sin capacidad de tanque registrada — configúrela en el catálogo de consumidores para ver el porcentaje.
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-slate-400">Sin cargas registradas para este consumidor.</p>
          )}

          <div className="flex flex-wrap gap-4 text-xs text-slate-500 pt-1">
            <span>Alerta al: <b className="text-amber-600">{umbralAlerta}%</b> del tanque</span>
            <span>Crítico al: <b className="text-red-600">{umbralCritico}%</b> del tanque</span>
            {config?.alerta_email && config?.email_destino && (
              <span className="flex items-center gap-1">
                <Mail className="w-3 h-3 text-sky-500" /> {config.email_destino}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ConfigAlertaDialog({ consumidor, config, onClose }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    umbral_alerta_pct:  config?.umbral_alerta_pct  ?? 40,
    umbral_critico_pct: config?.umbral_critico_pct ?? 20,
    alerta_email:       config?.alerta_email  ?? false,
    email_destino:      config?.email_destino ?? '',
    activa:             config?.activa ?? true,
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (config?.id) return base44.entities.ConfigAlerta.update(config.id, data);
      return base44.entities.ConfigAlerta.create({
        ...data,
        consumidor_id:     consumidor.id,
        consumidor_nombre: consumidor.nombre,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configAlertas'] });
      toast.success('Configuración guardada');
      onClose();
    },
  });

  const set = (f, v) => setForm(p => ({ ...p, [f]: v }));

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Umbrales de nivel — {consumidor.nombre}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <p className="text-xs text-slate-500">
            Define a qué % de capacidad del tanque se activa cada nivel de alerta.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-500">Alerta (%)</Label>
              <Input
                type="number" min={1} max={100} step={1}
                value={form.umbral_alerta_pct}
                onChange={e => set('umbral_alerta_pct', parseFloat(e.target.value))}
                className="mt-1"
              />
              <p className="text-[10px] text-amber-600 mt-0.5">Nivel bajo (amarillo)</p>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Crítico (%)</Label>
              <Input
                type="number" min={1} max={100} step={1}
                value={form.umbral_critico_pct}
                onChange={e => set('umbral_critico_pct', parseFloat(e.target.value))}
                className="mt-1"
              />
              <p className="text-[10px] text-red-500 mt-0.5">Nivel crítico (rojo)</p>
            </div>
          </div>

          <div className="border border-slate-100 rounded-xl p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-sky-500" />
                <Label className="text-sm">Alerta por email</Label>
              </div>
              <Switch checked={form.alerta_email} onCheckedChange={v => set('alerta_email', v)} />
            </div>
            {form.alerta_email && (
              <div>
                <Label className="text-xs text-slate-500">Email de destino</Label>
                <Input
                  type="email"
                  value={form.email_destino}
                  onChange={e => set('email_destino', e.target.value)}
                  placeholder="responsable@empresa.com"
                  className="mt-1"
                />
              </div>
            )}
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
            <Button
              size="sm"
              className="bg-sky-600 hover:bg-sky-700"
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate(form)}
            >
              Guardar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function IntegridadDatos() {
  const qc = useQueryClient();

  const { data: huerfanos = [], isFetching: fetchingH } = useQuery({
    queryKey: ['integridad-despachos-huerfanos'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_despachos_bon_huerfanos').select ? null : null;
      // fallback: query directa
      const { data: rows } = await supabase
        .from('movimiento')
        .select('id, fecha, litros, referencia, consumidor_origen_id, consumidor_origen_nombre')
        .eq('tipo', 'DESPACHO')
        .ilike('referencia', 'Bonificación combustible:%');
      if (!rows) return [];
      // filtrar los que no tienen venta
      const { data: ventas } = await supabase.from('venta_trabajador').select('movimiento_id').not('movimiento_id', 'is', null);
      const ventaMovIds = new Set((ventas ?? []).map(v => v.movimiento_id));
      return rows.filter(m => !ventaMovIds.has(m.id));
    },
    staleTime: 60_000,
  });

  const { data: canceladasConMov = [], isFetching: fetchingC } = useQuery({
    queryKey: ['integridad-ventas-canceladas-con-mov'],
    queryFn: async () => {
      const { data } = await supabase
        .from('venta_trabajador')
        .select('id, beneficiario_nombre, litros, combustible_nombre, estado, movimiento_id')
        .in('estado', ['CANCELADO', 'ANULADO'])
        .not('movimiento_id', 'is', null);
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const limpiarMut = useMutation({
    mutationFn: async () => {
      // 1. Eliminar DESPACHOs huérfanos
      for (const m of huerfanos) {
        await supabase.from('movimiento').delete().eq('id', m.id);
      }
      // 2. Ventas canceladas con movimiento_id: borrar el DESPACHO y limpiar referencia
      for (const v of canceladasConMov) {
        await supabase.from('venta_trabajador').update({ movimiento_id: null }).eq('id', v.id);
        await supabase.from('movimiento').delete().eq('id', v.movimiento_id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['integridad-despachos-huerfanos'] });
      qc.invalidateQueries({ queryKey: ['integridad-ventas-canceladas-con-mov'] });
      qc.invalidateQueries({ queryKey: ['movimientos'] });
      qc.invalidateQueries({ queryKey: ['ventas'] });
      qc.invalidateQueries({ queryKey: ['ventas-pendientes'] });
      toast.success('Datos saneados correctamente');
    },
    onError: (e) => toast.error(e.message ?? 'Error al sanear datos'),
  });

  const totalProblemas = huerfanos.length + canceladasConMov.length;
  const isFetching = fetchingH || fetchingC;

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${totalProblemas > 0 ? 'border-orange-200 bg-orange-50/60 dark:bg-orange-950/20 dark:border-orange-800' : 'border-slate-100 bg-slate-50/40 dark:border-slate-700'}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className={`w-4 h-4 shrink-0 ${totalProblemas > 0 ? 'text-orange-500' : 'text-slate-400'}`} />
          <div>
            <p className={`text-sm font-semibold ${totalProblemas > 0 ? 'text-orange-700 dark:text-orange-400' : 'text-slate-600 dark:text-slate-300'}`}>
              Integridad de datos
            </p>
            <p className="text-[10px] text-slate-400">
              {totalProblemas === 0 ? 'Sin problemas detectados' : `${totalProblemas} problema${totalProblemas > 1 ? 's' : ''} detectado${totalProblemas > 1 ? 's' : ''}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-600"
            onClick={() => { qc.invalidateQueries({ queryKey: ['integridad-despachos-huerfanos'] }); qc.invalidateQueries({ queryKey: ['integridad-ventas-canceladas-con-mov'] }); }}
            disabled={isFetching}>
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
          {totalProblemas > 0 && (
            <Button size="sm" className="h-7 text-xs bg-orange-600 hover:bg-orange-700 text-white gap-1.5"
              onClick={() => limpiarMut.mutate()} disabled={limpiarMut.isPending}>
              {limpiarMut.isPending ? <><RefreshCw className="w-3 h-3 animate-spin" />Saneando…</> : <><Trash2 className="w-3 h-3" />Sanear todo</>}
            </Button>
          )}
        </div>
      </div>

      {totalProblemas === 0 && !isFetching && (
        <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="w-3.5 h-3.5" /> Sin DESPACHOs huérfanos ni inconsistencias detectadas
        </div>
      )}

      {huerfanos.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-orange-600 uppercase tracking-wide">DESPACHOs de bonificación sin venta asociada ({huerfanos.length})</p>
          {huerfanos.map(m => (
            <div key={m.id} className="flex items-center justify-between bg-white dark:bg-slate-800 rounded-lg px-3 py-2 border border-orange-100 dark:border-orange-900 text-xs gap-2">
              <span className="font-mono text-slate-400 shrink-0">{m.fecha}</span>
              <span className="flex-1 truncate text-slate-600 dark:text-slate-300">{(m.referencia || '').replace('Bonificación combustible: ', '')}</span>
              <span className="text-orange-600 font-semibold shrink-0">{m.litros} L</span>
              <span className="text-slate-400 truncate max-w-[140px] shrink-0">{m.consumidor_origen_nombre}</span>
            </div>
          ))}
        </div>
      )}

      {canceladasConMov.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-orange-600 uppercase tracking-wide">Ventas canceladas con DESPACHO pendiente ({canceladasConMov.length})</p>
          {canceladasConMov.map(v => (
            <div key={v.id} className="flex items-center justify-between bg-white dark:bg-slate-800 rounded-lg px-3 py-2 border border-orange-100 dark:border-orange-900 text-xs gap-2">
              <span className="flex-1 font-medium text-slate-700 dark:text-slate-200 truncate">{v.beneficiario_nombre}</span>
              <span className="text-slate-500 shrink-0">{v.litros} L {v.combustible_nombre}</span>
              <span className="text-orange-600 font-semibold shrink-0">DESPACHO vivo</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Alertas() {
  const { isSuperAdmin } = useUserRole();
  const { data: consumidores = [] } = useQuery({ queryKey: ['consumidores'], queryFn: () => base44.entities.Consumidor.list() });
  const { data: movimientos = [] }  = useQuery({ queryKey: ['movimientos'],  queryFn: () => base44.entities.Movimiento.list('-fecha', 5000), staleTime: 5 * 60_000 });
  const { data: configAlertas = [] } = useQuery({ queryKey: ['configAlertas'], queryFn: () => base44.entities.ConfigAlerta.list() });
  const { data: ventasPendientes = [] } = useQuery({
    queryKey: ['ventas-pendientes'],
    queryFn: async () => {
      const { data } = await supabase
        .from('venta_trabajador')
        .select('id, beneficiario_nombre, litros, combustible_id, combustible_nombre, tanque_origen_id, tanque_origen_nombre')
        .eq('estado', 'PENDIENTE');
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const [editando, setEditando] = useState(null);
  const [tab, setTab] = useState('todas');

  // Solo consumidores reales (sin depósitos ni surtidores)
  const consumidoresActivos = consumidores.filter(c => {
    if (!c.activo) return false;
    if (c.categoria) return c.categoria === 'consumidor';
    const n = (c.tipo_consumidor_nombre || '').toLowerCase();
    return !n.includes('tanque') && !n.includes('reserva') && !n.includes('surtidor');
  });

  const consumidoresConEstado = useMemo(() => {
    return consumidoresActivos.map(c => {
      const config = configAlertas.find(ca => ca.consumidor_id === c.id) ?? null;
      const datos  = calcularNivelTanque(c, movimientos);
      const umbralAlerta  = config?.umbral_alerta_pct  ?? 40;
      const umbralCritico = config?.umbral_critico_pct ?? 20;
      const estado = estadoNivel(datos?.pct, umbralAlerta, umbralCritico);
      return { ...c, config, datos, estado };
    });
  }, [consumidoresActivos, configAlertas, movimientos]);

  const criticos  = consumidoresConEstado.filter(c => c.estado?.nivel === 'critico');
  const enAlerta  = consumidoresConEstado.filter(c => c.estado?.nivel === 'alerta');
  const normales  = consumidoresConEstado.filter(c => c.estado?.nivel === 'ok');
  const sinDatos  = consumidoresConEstado.filter(c => !c.estado);

  const bonsBloqueadas = useMemo(() =>
    ventasPendientes.map(v => ({
      ...v,
      stockOrigen: calcStockOrigen(v.tanque_origen_id, v.combustible_id, v.combustible_nombre, movimientos, consumidores),
    })).filter(v => v.stockOrigen !== null && v.stockOrigen < v.litros),
    [ventasPendientes, movimientos, consumidores]
  );

  const sections = useMemo(() => {
    if (tab === 'normales') return normales.length ? [{ title: '', color: '', items: normales }] : [];
    const groups = tab === 'alertas'
      ? [
          { title: 'Nivel crítico', color: 'text-red-500',   items: criticos },
          { title: 'Nivel bajo',    color: 'text-amber-500', items: enAlerta },
          { title: 'Sin datos',     color: 'text-slate-400', items: sinDatos },
        ]
      : [
          { title: 'Nivel crítico', color: 'text-red-500',    items: criticos },
          { title: 'Nivel bajo',    color: 'text-amber-500',  items: enAlerta },
          { title: 'Sin datos',     color: 'text-slate-400',  items: sinDatos },
          { title: 'Normal',        color: 'text-emerald-500',items: normales },
        ];
    return groups.filter(g => g.items.length > 0);
  }, [tab, criticos, enAlerta, sinDatos, normales]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Nivel de combustible</h1>
        <p className="text-xs text-slate-400">Nivel estimado por consumidor — cuánto queda y cuánto recargar</p>
      </div>

      {/* Integridad de datos — solo superadmin */}
      {isSuperAdmin && <IntegridadDatos />}

      {/* Bonificaciones bloqueadas por stock insuficiente */}
      {bonsBloqueadas.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
            <p className="text-sm font-semibold text-red-700">
              {bonsBloqueadas.length === 1
                ? '1 bonificación pendiente'
                : `${bonsBloqueadas.length} bonificaciones pendientes`} sin stock para despachar
            </p>
          </div>
          <div className="space-y-1.5">
            {bonsBloqueadas.map(b => {
              const deficit = b.litros - Math.max(0, b.stockOrigen);
              return (
                <div key={b.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-red-100 text-xs gap-2">
                  <span className="font-medium text-slate-700 truncate">{b.beneficiario_nombre}</span>
                  <div className="flex items-center gap-3 shrink-0 text-slate-500">
                    <span>{b.combustible_nombre} · {b.litros} L</span>
                    <span className="text-slate-300">·</span>
                    <span className="text-slate-400 truncate max-w-[100px]">{b.tanque_origen_nombre}</span>
                    <span className="text-red-600 font-semibold">Déficit {deficit.toFixed(1)} L</span>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-red-400">Registra una COMPRA para los tanques de origen correspondientes.</p>
        </div>
      )}

      {/* Resumen */}
      <div className="grid grid-cols-3 gap-3">
        <Card className={`border-0 shadow-sm ${criticos.length > 0 ? 'ring-1 ring-red-200 bg-red-50/20' : ''}`}>
          <CardContent className="p-4">
            <p className="text-[11px] text-slate-400 uppercase tracking-wide">Nivel crítico</p>
            <p className={`text-2xl font-bold mt-1 ${criticos.length > 0 ? 'text-red-500' : 'text-slate-300'}`}>
              {criticos.length}
            </p>
          </CardContent>
        </Card>
        <Card className={`border-0 shadow-sm ${enAlerta.length > 0 ? 'ring-1 ring-amber-200 bg-amber-50/20' : ''}`}>
          <CardContent className="p-4">
            <p className="text-[11px] text-slate-400 uppercase tracking-wide">Nivel bajo</p>
            <p className={`text-2xl font-bold mt-1 ${enAlerta.length > 0 ? 'text-amber-500' : 'text-slate-300'}`}>
              {enAlerta.length}
            </p>
            {sinDatos.length > 0 && (
              <p className="text-[10px] text-slate-400 mt-0.5">{sinDatos.length} sin datos</p>
            )}
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-[11px] text-slate-400 uppercase tracking-wide">Normal</p>
            <p className="text-2xl font-bold mt-1 text-emerald-500">{normales.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtro rápido */}
      <div className="flex gap-0.5 flex-wrap border-b border-slate-200 dark:border-slate-700">
        {[
          { value: 'todas',    label: `Todos (${consumidoresConEstado.length})` },
          { value: 'alertas',  label: `Con alertas (${criticos.length + enAlerta.length + sinDatos.length})`, alert: (criticos.length + enAlerta.length) > 0 },
          { value: 'normales', label: `Normales (${normales.length})` },
        ].map(({ value, label, alert }) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`flex items-center gap-1 px-3 py-2 text-xs font-medium rounded-t border-b-2 transition-colors -mb-px ${
              tab === value
                ? 'border-sky-500 text-sky-700 dark:text-sky-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            {alert && <AlertTriangle className="w-3 h-3" />}
            {label}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="space-y-5">
        {sections.length === 0 && (
          <p className="text-sm text-slate-400 py-6 text-center">No hay consumidores en esta categoría</p>
        )}
        {sections.map((section, i) => (
          <div key={section.title ?? i}>
            {section.title && (
              <div className="flex items-center gap-2 px-1 mb-2">
                <span className={`text-[10px] font-semibold uppercase tracking-widest ${section.color}`}>{section.title}</span>
                <div className="flex-1 border-t border-slate-100 dark:border-slate-700/50" />
                <span className="text-[10px] text-slate-400">{section.items.length}</span>
              </div>
            )}
            <div className="space-y-2">
              {section.items.map(c => (
                <NivelTanqueRow
                  key={c.id}
                  consumidor={c}
                  datos={c.datos}
                  config={c.config}
                  onConfigEdit={setEditando}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {editando && (
        <ConfigAlertaDialog
          consumidor={editando}
          config={configAlertas.find(ca => ca.consumidor_id === editando.id) ?? null}
          onClose={() => setEditando(null)}
        />
      )}
    </div>
  );
}
