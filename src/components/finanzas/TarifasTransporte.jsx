import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { useUserRole } from '@/components/ui-helpers/useUserRole';
import { logAudit } from '@/api/auditLog';
import { toast } from 'sonner';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import ConfirmDialog from '@/components/ui-helpers/ConfirmDialog';
import { Plus, Pencil, History, Truck, Trash2, ChevronDown, ChevronUp } from 'lucide-react';

const hoyISO = () => new Date().toISOString().slice(0, 10);

const fmtPrecio = (n, moneda) =>
  `${Number(n).toLocaleString('es-CU', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${moneda}`;

const cuando = (iso) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('es-CU', {
  day: '2-digit', month: 'short', year: 'numeric',
}) : '—');

const vacio = { tipo_consumidor_id: '', precio_km: '', moneda: 'CUP', fecha_desde: hoyISO(), notas: '' };

/**
 * Tarifas de referencia de transportación: cuánto se cobra por kilómetro según
 * el tipo de vehículo.
 *
 * Es la tabla que hoy se lleva a mano y con la que se da una oferta rápida sin
 * calcular la ficha entera. Guarda historial en vez de sobrescribir: una ficha
 * de marzo tiene que seguir enseñando la tarifa de marzo cuando se consulte en
 * diciembre.
 */
export default function TarifasTransporte() {
  const qc = useQueryClient();
  const { user, canManageFinanzas } = useUserRole();
  const [form, setForm] = useState(vacio);
  const [editando, setEditando] = useState(null);
  const [abierto, setAbierto] = useState(false);
  const [aBorrar, setABorrar] = useState(null);
  const [verHistorial, setVerHistorial] = useState(false);

  const { data: tarifas = [], isLoading } = useQuery({
    queryKey: ['tarifas-transporte'],
    queryFn: () => base44.entities.TarifaTransporte.list('-fecha_desde', 500),
  });
  const { data: tipos = [] } = useQuery({
    queryKey: ['tiposConsumidor'],
    queryFn: () => base44.entities.TipoConsumidor.list(),
  });

  const nombreTipo = id => tipos.find(t => t.id === id)?.nombre ?? '—';
  const refrescar = () => qc.invalidateQueries({ queryKey: ['tarifas-transporte'] });

  const vigentes = useMemo(
    () => tarifas.filter(t => !t.fecha_hasta)
      .sort((a, b) => nombreTipo(a.tipo_consumidor_id).localeCompare(nombreTipo(b.tipo_consumidor_id), 'es')),
    [tarifas, tipos],
  );
  const historicas = useMemo(
    () => tarifas.filter(t => t.fecha_hasta).sort((a, b) => (b.fecha_desde || '').localeCompare(a.fecha_desde || '')),
    [tarifas],
  );

  // Un tipo que ya tiene tarifa abierta no se vuelve a ofrecer: para cambiarle
  // el precio se usa «Nueva tarifa» sobre su fila, que cierra la anterior.
  const tiposDisponibles = useMemo(() => {
    const conVigente = new Set(vigentes.map(t => t.tipo_consumidor_id));
    return tipos.filter(t => t.activo !== false && (!conVigente.has(t.id) || form.tipo_consumidor_id === t.id));
  }, [tipos, vigentes, form.tipo_consumidor_id]);

  const guardarMut = useMutation({
    mutationFn: async (d) => {
      const precio = parseFloat(d.precio_km);
      const anterior = vigentes.find(t => t.tipo_consumidor_id === d.tipo_consumidor_id);

      // La tarifa anterior se cierra el día antes de que empiece la nueva, no el
      // mismo día: dos tarifas vigentes a la vez dejan sin respuesta cuál se
      // aplica a una ficha de esa fecha.
      if (anterior) {
        const vispera = new Date(d.fecha_desde + 'T12:00:00');
        vispera.setDate(vispera.getDate() - 1);
        const hasta = vispera.toISOString().slice(0, 10);
        if (hasta < anterior.fecha_desde) {
          throw new Error(
            `La tarifa vigente empezó el ${cuando(anterior.fecha_desde)}. La nueva no puede arrancar antes.`,
          );
        }
        const { error } = await supabase.from('tarifa_transporte')
          .update({ fecha_hasta: hasta }).eq('id', anterior.id);
        if (error) throw error;
      }

      const fila = {
        tipo_consumidor_id: d.tipo_consumidor_id,
        precio_km: precio,
        moneda: d.moneda,
        fecha_desde: d.fecha_desde,
        notas: d.notas?.trim() || null,
        creada_por: user?.id ?? null,
        creada_por_email: user?.email ?? null,
      };
      const { data: creada, error } = await supabase
        .from('tarifa_transporte').insert(fila).select().single();
      if (error) {
        // Son dos escrituras sin transacción: si la segunda falla, la anterior
        // se quedaría cerrada y el tipo sin ninguna tarifa vigente. Se reabre
        // antes de dar el error, para no dejar el hueco.
        if (anterior) {
          await supabase.from('tarifa_transporte')
            .update({ fecha_hasta: anterior.fecha_hasta ?? null }).eq('id', anterior.id);
        }
        throw error;
      }

      await logAudit({
        action: 'TARIFA_TRANSPORTE_NUEVA', entityType: 'TarifaTransporte', entityId: creada.id,
        entityLabel: `${nombreTipo(d.tipo_consumidor_id)} · ${precio} ${d.moneda}/km`,
        metadata: { precio_km: precio, desde: d.fecha_desde, cerro_anterior: anterior?.id ?? null },
      });
      return creada;
    },
    onSuccess: () => {
      refrescar(); cerrar();
      toast.success('Tarifa guardada. La anterior queda en el historial.');
    },
    onError: (e) => toast.error(e?.message ?? 'No se pudo guardar'),
  });

  const corregirMut = useMutation({
    mutationFn: async ({ id, precio_km, notas }) => {
      const { error } = await supabase.from('tarifa_transporte')
        .update({ precio_km: parseFloat(precio_km), notas: notas?.trim() || null }).eq('id', id);
      if (error) throw error;
      await logAudit({
        action: 'TARIFA_TRANSPORTE_CORREGIDA', entityType: 'TarifaTransporte', entityId: id,
        entityLabel: `${precio_km}/km`, metadata: { precio_km: parseFloat(precio_km) },
      });
    },
    onSuccess: () => { refrescar(); cerrar(); toast.success('Tarifa corregida'); },
    onError: (e) => toast.error(e?.message ?? 'No se pudo corregir'),
  });

  const borrarMut = useMutation({
    mutationFn: async (t) => {
      const { error } = await supabase.from('tarifa_transporte').delete().eq('id', t.id);
      if (error) throw error;
      await logAudit({
        action: 'TARIFA_TRANSPORTE_ELIMINADA', entityType: 'TarifaTransporte', entityId: t.id,
        entityLabel: `${nombreTipo(t.tipo_consumidor_id)} · ${t.precio_km}/km`,
      });
    },
    onSuccess: () => { refrescar(); setABorrar(null); toast.success('Tarifa eliminada'); },
    onError: (e) => toast.error(e?.message ?? 'No se pudo eliminar'),
  });

  const cerrar = () => { setAbierto(false); setEditando(null); setForm(vacio); };

  const abrirNueva = (tipoId = '') => {
    setEditando(null);
    setForm({ ...vacio, tipo_consumidor_id: tipoId });
    setAbierto(true);
  };
  const abrirCorreccion = (t) => {
    setEditando(t);
    setForm({
      tipo_consumidor_id: t.tipo_consumidor_id,
      precio_km: String(t.precio_km),
      moneda: t.moneda || 'CUP',
      fecha_desde: t.fecha_desde,
      notas: t.notas || '',
    });
    setAbierto(true);
  };

  const guardar = () => {
    if (!form.tipo_consumidor_id) { toast.error('Elige el tipo de vehículo'); return; }
    const precio = parseFloat(form.precio_km);
    if (!Number.isFinite(precio) || precio < 0) { toast.error('El precio por kilómetro no es válido'); return; }
    if (editando) corregirMut.mutate({ id: editando.id, precio_km: form.precio_km, notas: form.notas });
    else guardarMut.mutate(form);
  };

  const ocupado = guardarMut.isPending || corregirMut.isPending;

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-sky-600 shrink-0" />
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Tarifas de transportación
                </h3>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Lo que se cobra por kilómetro según el tipo de vehículo. Sirve para dar una
                oferta rápida sin calcular la ficha completa.
              </p>
            </div>
            {canManageFinanzas && (
              <Button size="sm" className="gap-1.5 shrink-0" onClick={() => abrirNueva()}>
                <Plus className="w-3.5 h-3.5" /> Nueva
              </Button>
            )}
          </div>

          {isLoading ? (
            <p className="text-xs text-slate-400 py-6 text-center">Cargando…</p>
          ) : vigentes.length === 0 ? (
            <div className="py-8 text-center space-y-1">
              <Truck className="w-8 h-8 text-slate-200 mx-auto" />
              <p className="text-xs text-slate-400">Todavía no hay tarifas.</p>
              {canManageFinanzas && (
                <p className="text-[11px] text-slate-400">
                  Empieza por las que ya usáis: triciclo, carro, camión, rastra.
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
              <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800/60 text-[10px] uppercase tracking-wide text-slate-400">
                <span>Tipo de vehículo</span>
                <span className="text-right">Por kilómetro</span>
                <span className="text-right">Desde</span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-700">
                {vigentes.map(t => (
                  <div key={t.id} className="grid grid-cols-[1fr_auto_auto] gap-2 px-3 py-2.5 items-center text-sm group">
                    <span className="text-slate-700 dark:text-slate-200 truncate min-w-0">
                      {nombreTipo(t.tipo_consumidor_id)}
                      {t.notas && (
                        <span className="block text-[11px] text-slate-400 truncate">{t.notas}</span>
                      )}
                    </span>
                    <span className="text-right font-bold text-slate-800 dark:text-slate-100 tabular-nums whitespace-nowrap">
                      {fmtPrecio(t.precio_km, t.moneda)}
                    </span>
                    <span className="text-right text-[11px] text-slate-400 whitespace-nowrap flex items-center gap-1 justify-end">
                      {cuando(t.fecha_desde)}
                      {canManageFinanzas && (
                        <span className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="h-6 w-6" title="Nueva tarifa para este tipo"
                            onClick={() => abrirNueva(t.tipo_consumidor_id)}>
                            <Plus className="w-3 h-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6" title="Corregir esta misma tarifa"
                            onClick={() => abrirCorreccion(t)}>
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-300 hover:text-red-500"
                            title="Eliminar" onClick={() => setABorrar(t)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {historicas.length > 0 && (
            <div className="mt-3">
              <button type="button"
                className="text-[11px] text-slate-400 hover:text-slate-600 flex items-center gap-1"
                onClick={() => setVerHistorial(v => !v)}>
                {verHistorial ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                <History className="w-3 h-3" />
                {historicas.length} tarifa{historicas.length > 1 ? 's' : ''} anterior{historicas.length > 1 ? 'es' : ''}
              </button>
              {verHistorial && (
                <div className="mt-2 space-y-1">
                  {historicas.map(t => (
                    <div key={t.id} className="flex items-center gap-2 text-[11px] px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                      <span className="text-slate-500 truncate flex-1 min-w-0">{nombreTipo(t.tipo_consumidor_id)}</span>
                      <span className="text-slate-600 dark:text-slate-300 tabular-nums whitespace-nowrap">
                        {fmtPrecio(t.precio_km, t.moneda)}
                      </span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 whitespace-nowrap">
                        {cuando(t.fecha_desde)} → {cuando(t.fecha_hasta)}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <p className="text-[10px] text-slate-400 mt-3">
            Al poner una tarifa nueva, la anterior se cierra la víspera y queda en el historial.
            Así una ficha antigua sigue enseñando la tarifa que tenía el día que se hizo.
          </p>
        </CardContent>
      </Card>

      <Dialog open={abierto} onOpenChange={a => { if (!a) cerrar(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">
              {editando ? 'Corregir tarifa' : 'Nueva tarifa'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <div>
              <Label className="text-xs text-slate-500">Tipo de vehículo *</Label>
              <Select value={form.tipo_consumidor_id}
                onValueChange={v => setForm(f => ({ ...f, tipo_consumidor_id: v }))}
                disabled={!!editando}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Elegir…" /></SelectTrigger>
                <SelectContent>
                  {tiposDisponibles.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!editando && tiposDisponibles.length === 0 && (
                <p className="text-[10px] text-amber-600 mt-1">
                  Todos los tipos tienen ya una tarifa. Para cambiar una, usa el «+» de su fila.
                </p>
              )}
            </div>

            <div className="grid grid-cols-[1fr_auto] gap-2">
              <div>
                <Label className="text-xs text-slate-500">Precio por kilómetro *</Label>
                <Input type="number" step="0.0001" min="0" className="mt-1"
                  placeholder="1.50"
                  value={form.precio_km}
                  onChange={e => setForm(f => ({ ...f, precio_km: e.target.value }))} />
              </div>
              <div className="w-24">
                <Label className="text-xs text-slate-500">Moneda</Label>
                <Select value={form.moneda} onValueChange={v => setForm(f => ({ ...f, moneda: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CUP">CUP</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {!editando && (
              <div>
                <Label className="text-xs text-slate-500">Vigente desde</Label>
                <Input type="date" className="mt-1" value={form.fecha_desde}
                  onChange={e => setForm(f => ({ ...f, fecha_desde: e.target.value }))} />
              </div>
            )}

            <div>
              <Label className="text-xs text-slate-500">Nota (opcional)</Label>
              <Input className="mt-1" placeholder="Acuerdo, resolución…"
                value={form.notas}
                onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} />
            </div>

            <p className="text-[10px] text-slate-400">
              {editando
                ? 'Corrige el importe de esta misma tarifa, sin abrir una nueva. Para un cambio de precio con fecha, cierra esta y crea otra.'
                : 'Si ese tipo ya tiene tarifa, se cerrará la víspera de esta fecha y quedará en el historial.'}
            </p>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={cerrar}>Cancelar</Button>
            <Button size="sm" onClick={guardar} disabled={ocupado}>
              {ocupado ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!aBorrar}
        onOpenChange={a => { if (!a) setABorrar(null); }}
        title="¿Eliminar la tarifa?"
        description={
          aBorrar
            ? `Se borra la tarifa de ${nombreTipo(aBorrar.tipo_consumidor_id)} (${fmtPrecio(aBorrar.precio_km, aBorrar.moneda)}). ` +
              'Si solo cambió el precio, es mejor crear una nueva: así queda el historial y las fichas antiguas siguen cuadrando.'
            : ''
        }
        destructive
        onConfirm={() => borrarMut.mutate(aBorrar)}
      />
    </div>
  );
}
