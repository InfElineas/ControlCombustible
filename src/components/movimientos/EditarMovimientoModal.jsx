import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from "sonner";
import { Save, Loader2, Paperclip, X, ExternalLink } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { calcularAuditoriaCompra, obtenerCapacidadTanque, AUDITORIA_ESTADO } from './auditoriaCombustible';

export default function EditarMovimientoModal({ movimiento, onClose }) {
  const queryClient = useQueryClient();
  const { data: tarjetas = [] } = useQuery({ queryKey: ['tarjetas'], queryFn: () => base44.entities.Tarjeta.list() });
  const { data: consumidores = [] } = useQuery({ queryKey: ['consumidores'], queryFn: () => base44.entities.Consumidor.list() });
  const { data: combustibles = [] } = useQuery({ queryKey: ['combustibles'], queryFn: () => base44.entities.TipoCombustible.list() });
  const { data: movimientos = [] } = useQuery({ queryKey: ['movimientos'], queryFn: () => base44.entities.Movimiento.list('-fecha', 5000), staleTime: 5 * 60_000 });

  // Re-initialize form when movimiento changes (pre-load existing data)
  const [form, setForm] = useState(() => ({
    fecha: movimiento?.fecha || '',
    monto: movimiento?.monto ?? '',
    litros: movimiento?.litros ?? '',
    precio: movimiento?.precio ?? '',
    odometro: movimiento?.odometro ?? '',
    horas_uso: movimiento?.horas_uso ?? '',
    nivel_tanque: movimiento?.nivel_tanque ?? '',
    referencia: movimiento?.referencia || '',
    tarjeta_id: movimiento?.tarjeta_id || '',
    consumidor_id: movimiento?.consumidor_id || '',
    consumidor_origen_id: movimiento?.consumidor_origen_id || '',
    combustible_id: movimiento?.combustible_id || '',
  }));
  const [filtroTipoConsumidor, setFiltroTipoConsumidor] = useState('all');
  const [adjuntoFile, setAdjuntoFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [quitarAdjunto, setQuitarAdjunto] = useState(false);

  useEffect(() => {
    if (movimiento) {
      setForm({
        fecha: movimiento.fecha || '',
        monto: movimiento.monto ?? '',
        litros: movimiento.litros ?? '',
        precio: movimiento.precio ?? '',
        odometro: movimiento.odometro ?? '',
        horas_uso: movimiento.horas_uso ?? '',
        nivel_tanque: movimiento.nivel_tanque ?? '',
        referencia: movimiento.referencia || '',
        tarjeta_id: movimiento.tarjeta_id || '',
        consumidor_id: movimiento.consumidor_id || '',
        consumidor_origen_id: movimiento.consumidor_origen_id || '',
        combustible_id: movimiento.combustible_id || '',
      });
    }
    setAdjuntoFile(null);
    setQuitarAdjunto(false);
  }, [movimiento?.id]);

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const resolverCombustiblesConsumidor = (consumidor) => {
    if (!consumidor) return [];
    const ids = new Set();
    const nombres = new Set();
    if (consumidor.combustible_id) ids.add(consumidor.combustible_id);
    (consumidor.combustible_ids || []).forEach(id => ids.add(id));
    (consumidor.combustibles_admitidos || []).forEach(v => {
      if (typeof v === 'string') nombres.add(v.toLowerCase());
      else if (v?.id) ids.add(v.id);
    });
    combustibles.forEach(c => { if (nombres.has((c.nombre || '').toLowerCase())) ids.add(c.id); });
    return [...ids];
  };

  const consumidoresFiltradosPorTipo = useMemo(() => {
    if (filtroTipoConsumidor === 'all') return consumidores;
    return consumidores.filter(c => c.tipo_consumidor_id === filtroTipoConsumidor);
  }, [consumidores, filtroTipoConsumidor]);

  const combustiblesPermitidosConsumidor = useMemo(() => {
    const consumidor = consumidores.find(c => c.id === form.consumidor_id);
    return resolverCombustiblesConsumidor(consumidor);
  }, [form.consumidor_id, consumidores, combustibles]);

  useEffect(() => {
    if (!form.consumidor_id) return;
    if (combustiblesPermitidosConsumidor.length === 1 && form.combustible_id !== combustiblesPermitidosConsumidor[0]) {
      set('combustible_id', combustiblesPermitidosConsumidor[0]);
    }
    if (combustiblesPermitidosConsumidor.length > 1 && form.combustible_id && !combustiblesPermitidosConsumidor.includes(form.combustible_id)) {
      set('combustible_id', '');
    }
  }, [form.consumidor_id, combustiblesPermitidosConsumidor.join(','), form.combustible_id]);

  const consumidorSeleccionado = useMemo(
    () => consumidores.find(c => c.id === form.consumidor_id),
    [consumidores, form.consumidor_id]
  );

  const esEquipoConsumidor = useMemo(() => {
    const n = (consumidorSeleccionado?.tipo_consumidor_nombre || '').toLowerCase();
    return n.includes('equipo') || n.includes('planta') || n.includes('generador') || n.includes('grupo');
  }, [consumidorSeleccionado]);
  const capacidadTanque = useMemo(
    () => obtenerCapacidadTanque(consumidorSeleccionado),
    [consumidorSeleccionado]
  );
  const auditoriaCompra = useMemo(() => {
    if (movimiento?.tipo !== 'COMPRA') return null;
    return calcularAuditoriaCompra({
      movimientos,
      consumidorId: form.consumidor_id,
      combustibleId: form.combustible_id,
      fecha: form.fecha,
      litrosAbastecidos: form.litros,
      capacidadTanque,
      litrosIniciales: consumidorSeleccionado?.litros_iniciales ?? 0,
      excludeMovimientoId: movimiento?.id,
      nivelTanqueActual: form.nivel_tanque !== '' && form.nivel_tanque != null ? parseFloat(form.nivel_tanque) : undefined,
    });
  }, [movimiento?.tipo, movimiento?.id, movimientos, form.consumidor_id, form.combustible_id, form.fecha, form.litros, capacidadTanque, consumidorSeleccionado, form.nivel_tanque]);

  const updateMutation = useMutation({
    mutationFn: async (data) => {
      // Guardar el movimiento editado
      const result = await base44.entities.Movimiento.update(movimiento.id, data);

      // ── Cascada de odómetro ─────────────────────────────────────────────────
      // Si se cambió el odómetro, recalcular km_recorridos y consumo_real del
      // movimiento inmediatamente siguiente del mismo consumidor (el que usa este
      // odo como punto de partida de su propio tramo).
      if (data.odometro != null) {
        const odoNuevo = data.odometro;
        const consumidorId = data.consumidor_id ?? movimiento.consumidor_id;

        // El siguiente es el movimiento con el odómetro más bajo que supere al editado,
        // del mismo consumidor, con fecha >= a este movimiento.
        const siguiente = movimientos
          .filter(m =>
            m.id !== movimiento.id &&
            (m.tipo === 'COMPRA' || m.tipo === 'DESPACHO') &&
            m.consumidor_id === consumidorId &&
            m.odometro != null &&
            m.odometro > odoNuevo
          )
          .sort((a, b) => a.odometro - b.odometro)[0];

        if (siguiente) {
          const kmSig = siguiente.odometro - odoNuevo;
          const litrosSig = siguiente.litros ?? 0;
          if (kmSig > 0 && litrosSig > 0) {
            await base44.entities.Movimiento.update(siguiente.id, {
              km_recorridos: kmSig,
              consumo_real: kmSig / litrosSig,
            });
          }
        }
      }

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['movimientos'] });
      queryClient.invalidateQueries({ queryKey: ['v-stock-tanques'] });
      toast.success('Movimiento actualizado');
      onClose();
    },
    onError: (err) => {
      toast.error(`Error al guardar: ${err?.message ?? 'Error desconocido'}`);
    },
  });

  const handleSubmit = async () => {
    const tarjeta = tarjetas.find(t => t.id === form.tarjeta_id);
    const consumidor = consumidores.find(c => c.id === form.consumidor_id);
    const consumidorOrigen = consumidores.find(c => c.id === form.consumidor_origen_id);
    const combustible = combustibles.find(c => c.id === form.combustible_id);

    const data = {
      fecha: form.fecha,
      referencia: form.referencia || null,
    };

    if (form.tarjeta_id && tarjeta) {
      data.tarjeta_id = tarjeta.id;
      data.tarjeta_alias = tarjeta.alias || tarjeta.id_tarjeta;
    }
    if (form.consumidor_id && consumidor) {
      data.consumidor_id = consumidor.id;
      data.consumidor_nombre = consumidor.nombre;
    }
    if (form.consumidor_origen_id && consumidorOrigen) {
      data.consumidor_origen_id = consumidorOrigen.id;
      data.consumidor_origen_nombre = consumidorOrigen.nombre;
    }
    if (form.combustible_id && combustible) {
      data.combustible_id = combustible.id;
      data.combustible_nombre = combustible.nombre;
    }
    if (form.monto        !== '') data.monto       = parseFloat(form.monto);
    if (form.litros       !== '') data.litros      = parseFloat(form.litros);
    if (form.precio       !== '') data.precio      = parseFloat(form.precio);
    if (form.nivel_tanque !== '') data.nivel_tanque = parseFloat(form.nivel_tanque);

    // Odómetro para vehículos (COMPRA o DESPACHO)
    if (!esEquipoConsumidor && form.odometro !== '') {
      const odoNuevo = parseFloat(form.odometro);
      data.odometro = odoNuevo;
      const prevConOdo = movimientos
        .filter(m =>
          m.id !== movimiento.id &&
          (m.tipo === 'COMPRA' || m.tipo === 'DESPACHO') &&
          m.consumidor_id === form.consumidor_id &&
          m.odometro != null &&
          (m.fecha || '') <= (form.fecha || '')
        )
        .sort((a, b) => (b.odometro || 0) - (a.odometro || 0))[0];
      if (prevConOdo && odoNuevo > prevConOdo.odometro) {
        const km = odoNuevo - prevConOdo.odometro;
        data.km_recorridos = km;
        const litros = form.litros !== '' ? parseFloat(form.litros) : null;
        if (litros && litros > 0) data.consumo_real = km / litros;
      }
    }

    // Horas de uso para equipos/generadores
    if (esEquipoConsumidor && form.horas_uso !== '') {
      data.horas_uso = parseFloat(form.horas_uso);
    }

    if (adjuntoFile) {
      setIsUploading(true);
      const ext = adjuntoFile.name.split('.').pop();
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('movimiento-adjuntos')
        .upload(path, adjuntoFile);
      setIsUploading(false);
      if (uploadError) { toast.error('Error al subir adjunto'); return; }
      const { data: { publicUrl } } = supabase.storage.from('movimiento-adjuntos').getPublicUrl(path);
      data.adjunto_url = publicUrl;
      data.adjunto_nombre = adjuntoFile.name;
    } else if (quitarAdjunto) {
      data.adjunto_url = null;
      data.adjunto_nombre = null;
    }

    updateMutation.mutate(data);
  };

  if (!movimiento) return null;
  const tipo = movimiento.tipo;

  return (
    <Dialog open={!!movimiento} onOpenChange={onClose}>
      <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Editar Movimiento — {tipo}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          <div>
            <Label className="text-xs text-slate-500">Fecha</Label>
            <Input type="date" value={form.fecha} onChange={e => set('fecha', e.target.value)} className="mt-1" />
          </div>

          {(tipo === 'RECARGA' || tipo === 'COMPRA' || tipo === 'DEPOSITO') && (
            <div>
              <Label className="text-xs text-slate-500">{tipo === 'DEPOSITO' ? 'Tarjeta de retiro asociada (opcional)' : 'Tarjeta'}</Label>
              <Select value={form.tarjeta_id} onValueChange={v => set('tarjeta_id', v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  {tarjetas.map(t => <SelectItem key={t.id} value={t.id}>{t.alias || t.id_tarjeta}</SelectItem>)}
                </SelectContent>
              </Select>
              {tipo === 'DEPOSITO' && <p className="text-[10px] text-slate-400 mt-1">Tarjeta usada para retirar este combustible. Permite calcular saldo disponible.</p>}
            </div>
          )}

          {(tipo === 'COMPRA' || tipo === 'DESPACHO' || tipo === 'DEPOSITO') && (
            <>
              {tipo === 'DESPACHO' && (
                <div>
                  <Label className="text-xs text-slate-500">Origen (Reserva)</Label>
                  <Select value={form.consumidor_origen_id} onValueChange={v => set('consumidor_origen_id', v)}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      {consumidores.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}{c.codigo_interno ? ` · ${c.codigo_interno}` : ''}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label className="text-xs text-slate-500">Tipo de consumidor</Label>
                <Select value={filtroTipoConsumidor} onValueChange={setFiltroTipoConsumidor}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Filtrar tipo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {[...new Map(consumidores.map(c => [c.tipo_consumidor_id, c.tipo_consumidor_nombre])).entries()]
                      .filter(([id]) => !!id)
                      .map(([id, nombre]) => <SelectItem key={id} value={id}>{nombre || 'Tipo'}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-500">Consumidor destino</Label>
                <Select value={form.consumidor_id} onValueChange={v => set('consumidor_id', v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    {consumidoresFiltradosPorTipo.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}{c.codigo_interno ? ` · ${c.codigo_interno}` : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-500">Combustible</Label>
                <Select value={form.combustible_id} onValueChange={v => set('combustible_id', v)} disabled={combustiblesPermitidosConsumidor.length === 1}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    {(combustiblesPermitidosConsumidor.length > 0
                      ? combustibles.filter(c => combustiblesPermitidosConsumidor.includes(c.id))
                      : combustibles
                    ).map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {(tipo === 'RECARGA' || tipo === 'COMPRA' || tipo === 'DEPOSITO') && (
            <div>
              <Label className="text-xs text-slate-500">{tipo === 'DEPOSITO' ? 'Monto (costo adquisición, opcional)' : 'Monto'}</Label>
              <Input type="number" step="0.01" value={form.monto} onChange={e => set('monto', e.target.value)} className="mt-1" />
            </div>
          )}

          {(tipo === 'COMPRA' || tipo === 'DESPACHO' || tipo === 'DEPOSITO') && (
            <div>
              <Label className="text-xs text-slate-500">Litros</Label>
              <Input type="number" step="0.01" value={form.litros} onChange={e => set('litros', e.target.value)} className="mt-1" />
            </div>
          )}
          {tipo === 'COMPRA' && auditoriaCompra && auditoriaCompra.estado !== AUDITORIA_ESTADO.SIN_ESTIMACION && (
            <div className={`rounded-lg border p-2.5 text-xs space-y-1.5 ${
              auditoriaCompra.estado === AUDITORIA_ESTADO.EXCESO
                ? 'bg-red-50 border-red-200 text-red-800'
                : auditoriaCompra.estado === AUDITORIA_ESTADO.SIN_CAPACIDAD
                  ? 'bg-amber-50 border-amber-200 text-amber-800'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}>
              <p className="font-semibold text-[11px] uppercase tracking-wide opacity-70">
                {auditoriaCompra.estado === AUDITORIA_ESTADO.EXCESO
                  ? '⚠ Advertencia — excede capacidad'
                  : auditoriaCompra.estado === AUDITORIA_ESTADO.SIN_CAPACIDAD
                    ? 'ℹ Sin capacidad registrada'
                    : '✓ Carga dentro del rango normal'}
              </p>
              <div className="space-y-0.5">
                <p>
                  <span className="opacity-70">Combustible en tanque antes de esta carga: </span>
                  <b>{auditoriaCompra.remanenteAntes != null ? `${auditoriaCompra.remanenteAntes.toFixed(2)} L` : '—'}</b>
                </p>
                <p>
                  <span className="opacity-70">Estimado en tanque al completar la carga: </span>
                  <b>{auditoriaCompra.combustibleEstimadoPost != null ? `${auditoriaCompra.combustibleEstimadoPost.toFixed(2)} L` : '—'}</b>
                </p>
                <p>
                  <span className="opacity-70">Capacidad máxima del tanque: </span>
                  <b>{capacidadTanque != null ? `${capacidadTanque.toFixed(2)} L` : 'No registrada'}</b>
                </p>
              </div>
              {auditoriaCompra.estado === AUDITORIA_ESTADO.EXCESO && (
                <p className="text-[10px] opacity-80 border-t border-red-200 pt-1.5 mt-1">
                  El total estimado supera la capacidad del tanque. Puede deberse a un registro incorrecto de litros, odómetro o datos históricos. El movimiento se puede guardar igual.
                </p>
              )}
            </div>
          )}

          {tipo === 'COMPRA' && (
            <div>
              <Label className="text-xs text-slate-500">Precio/L</Label>
              <Input type="number" step="0.01" value={form.precio} onChange={e => set('precio', e.target.value)} className="mt-1" />
            </div>
          )}

          {/* Odómetro / Horas de uso — COMPRA y DESPACHO */}
          {(tipo === 'COMPRA' || tipo === 'DESPACHO') && (
            esEquipoConsumidor ? (
              <div>
                <Label className="text-xs text-slate-500">Horas de uso (lectura acumulada)</Label>
                <Input type="number" step="0.1" min="0" value={form.horas_uso} onChange={e => set('horas_uso', e.target.value)} className="mt-1" placeholder="ej. 1250.5" />
              </div>
            ) : (
              <div>
                <Label className="text-xs text-slate-500">
                  Odómetro (km)
                  {tipo === 'DESPACHO' && !movimiento.odometro && (
                    <span className="ml-1.5 text-amber-600 font-normal">— sin lectura registrada</span>
                  )}
                </Label>
                <Input type="number" step="1" min="0" value={form.odometro} onChange={e => set('odometro', e.target.value)} className="mt-1" placeholder="ej. 125000" />
                {tipo === 'DESPACHO' && form.odometro !== '' && (
                  <p className="text-[10px] text-slate-400 mt-1">Se recalcularán km recorridos y consumo real al guardar.</p>
                )}
              </div>
            )
          )}

          {/* Nivel en tanque — COMPRA y DESPACHO */}
          {(tipo === 'COMPRA' || tipo === 'DESPACHO') && !esEquipoConsumidor && (
            <div>
              <Label className="text-xs text-slate-500">Nivel en tanque antes de cargar (L)</Label>
              <Input type="number" step="0.1" min="0" value={form.nivel_tanque} onChange={e => set('nivel_tanque', e.target.value)} className="mt-1" placeholder="Litros que quedaban" />
            </div>
          )}

          <div>
            <Label className="text-xs text-slate-500">Referencia</Label>
            <Input value={form.referencia} onChange={e => set('referencia', e.target.value)} placeholder="Nota, factura..." className="mt-1" />
          </div>

          {/* Adjunto */}
          <div>
            <label className="text-xs text-slate-500 font-medium block mb-1">Adjunto</label>
            {/* Adjunto existente */}
            {movimiento.adjunto_url && !quitarAdjunto && !adjuntoFile && (
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 mb-2">
                <Paperclip className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <a href={movimiento.adjunto_url} target="_blank" rel="noreferrer"
                  className="text-xs text-sky-600 hover:underline truncate flex-1 flex items-center gap-1">
                  {movimiento.adjunto_nombre || 'Ver adjunto'}
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
                <button type="button" onClick={() => setQuitarAdjunto(true)} className="text-slate-400 hover:text-red-500" title="Quitar adjunto">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {/* Nuevo archivo seleccionado */}
            {adjuntoFile ? (
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <Paperclip className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="text-xs text-slate-700 truncate flex-1">{adjuntoFile.name}</span>
                <button type="button" onClick={() => setAdjuntoFile(null)} className="text-slate-400 hover:text-red-500">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <label className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 cursor-pointer hover:bg-slate-50 transition-colors">
                <Paperclip className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs text-slate-400">
                  {movimiento.adjunto_url && !quitarAdjunto ? 'Reemplazar archivo…' : 'Seleccionar archivo…'}
                </span>
                <input type="file" className="hidden" onChange={e => { setAdjuntoFile(e.target.files?.[0] ?? null); setQuitarAdjunto(false); }} />
              </label>
            )}
          </div>

          <Button
            onClick={handleSubmit}
            disabled={updateMutation.isPending || isUploading}
            className="w-full bg-sky-600 hover:bg-sky-700 h-10"
          >
            {(updateMutation.isPending || isUploading) ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            {isUploading ? 'Subiendo archivo…' : 'Guardar cambios'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
