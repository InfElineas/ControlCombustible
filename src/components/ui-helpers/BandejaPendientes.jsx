import React, { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CloudUpload, RefreshCw, Trash2, AlertTriangle, Clock, CheckCircle2 } from 'lucide-react';
import { leerCola, alCambiarCola, procesarCola, descartar, volverAIntentar } from '@/lib/colaEscritura';

const ETIQUETA_TIPO = { bonificacion: 'Bonificación', novedad_ruta: 'Ruta',
  movimiento: 'Movimiento', transicion_venta: 'Estado' };

const cuando = (iso) => {
  const d = new Date(iso);
  return d.toLocaleString('es-CU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

/** Lee la cola y se mantiene al día con sus cambios. */
export function useColaPendiente() {
  const [items, setItems] = useState([]);
  const refrescar = useCallback(() => { leerCola().then(setItems); }, []);
  useEffect(() => {
    refrescar();
    return alCambiarCola(refrescar);
  }, [refrescar]);
  return {
    items,
    pendientes: items.filter(i => i.estado === 'pendiente').length,
    rechazadas: items.filter(i => i.estado === 'rechazado').length,
    total: items.length,
  };
}

export default function BandejaPendientes({ abierto, onCerrar }) {
  const { items, pendientes, rechazadas } = useColaPendiente();
  const [enviando, setEnviando] = useState(false);
  const qc = useQueryClient();

  const enviar = async () => {
    setEnviando(true);
    const r = await procesarCola();
    setEnviando(false);
    if (r.enviadas) {
      qc.invalidateQueries({ queryKey: ['ventas'] });
      qc.invalidateQueries({ queryKey: ['asignaciones_ruta'] });
      qc.invalidateQueries({ queryKey: ['movimientos'] });
      qc.invalidateQueries({ queryKey: ['v-stock-tanques'] });
      toast.success(r.enviadas === 1 ? 'Se envió 1 registro' : `Se enviaron ${r.enviadas} registros`);
    }
    if (r.rechazadas) toast.error('El servidor rechazó algún registro. Revísalo en la bandeja.');
    if (!r.enviadas && !r.rechazadas) toast.info('No se pudo enviar todavía. Se reintentará al recuperar la conexión.');
  };

  return (
    <Dialog open={abierto} onOpenChange={a => { if (!a) onCerrar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center shrink-0">
              <CloudUpload className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            </div>
            Sin enviar al servidor
          </DialogTitle>
        </DialogHeader>

        {items.length === 0 ? (
          <div className="text-center py-6 space-y-2">
            <CheckCircle2 className="w-9 h-9 text-emerald-500 mx-auto" />
            <p className="text-sm text-slate-500">No queda nada por enviar.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Estos registros se guardaron en el teléfono. Se envían solos al recuperar
              la conexión; hasta entonces no están en el servidor y nadie más los ve.
            </p>

            <div className="max-h-64 overflow-y-auto space-y-1.5 -mx-1 px-1">
              {items.map(item => {
                const malo = item.estado === 'rechazado';
                return (
                  <div key={item.id}
                    className={`rounded-lg border px-3 py-2 text-xs ${malo
                      ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-900/20'
                      : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800'}`}>
                    <div className="flex items-center gap-2">
                      {malo
                        ? <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                        : <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                      <span className="font-medium text-slate-700 dark:text-slate-200 shrink-0">
                        {ETIQUETA_TIPO[item.tipo] ?? item.tipo}
                      </span>
                      <span className="flex-1 truncate text-slate-500 dark:text-slate-400">{item.resumen}</span>
                      <span className="text-[10px] text-slate-400 shrink-0">{cuando(item.creadoEn)}</span>
                    </div>
                    {malo && (
                      <>
                        <p className="text-[11px] text-red-600 dark:text-red-400 mt-1">{item.error}</p>
                        <div className="flex gap-1 mt-1.5">
                          <Button size="sm" variant="ghost" className="h-6 text-[11px] px-2"
                            onClick={() => volverAIntentar(item.id)}>
                            <RefreshCw className="w-3 h-3 mr-1" /> Reintentar
                          </Button>
                          <Button size="sm" variant="ghost" className="h-6 text-[11px] px-2 text-red-500 hover:text-red-600"
                            onClick={() => descartar(item.id)}>
                            <Trash2 className="w-3 h-3 mr-1" /> Descartar
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-slate-400">
                {pendientes} en espera{rechazadas ? ` · ${rechazadas} rechazado${rechazadas > 1 ? 's' : ''}` : ''}
              </span>
              <Button size="sm" onClick={enviar} disabled={enviando || !pendientes}>
                {enviando ? 'Enviando…' : 'Enviar ahora'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
