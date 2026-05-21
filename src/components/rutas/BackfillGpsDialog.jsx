import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabase } from '@/api/supabaseClient';
import { base44 } from '@/api/base44Client';
import { gpsApi, metersToKm } from '@/api/gpsClient';

function daysInRange(desde, hasta) {
  const days = [];
  // Use noon local time to avoid DST edge cases
  let d = new Date(desde + 'T12:00:00');
  const end = new Date(hasta + 'T12:00:00');
  while (d <= end) {
    days.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

const ayer = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const primerDeMayo = `${new Date().getFullYear()}-05-01`;

export default function BackfillGpsDialog({ open, onClose, vehiculos }) {
  const vehiculosGPS = vehiculos.filter(v => v.gps_device_id != null && v.activo !== false);

  const [fechaDesde,  setFechaDesde]  = useState(primerDeMayo);
  const [fechaHasta,  setFechaHasta]  = useState(ayer);
  const [running,     setRunning]     = useState(false);
  const [progress,    setProgress]    = useState(null);
  const [results,     setResults]     = useState(null);
  const [log,         setLog]         = useState([]);

  function addLog(msg) {
    setLog(prev => [...prev.slice(-49), msg]);
  }

  async function iniciar() {
    if (!fechaDesde || !fechaHasta || fechaDesde > fechaHasta) {
      toast.error('Rango de fechas inválido'); return;
    }
    if (vehiculosGPS.length === 0) {
      toast.error('No hay vehículos con GPS vinculado'); return;
    }

    setRunning(true);
    setResults(null);
    setLog([]);

    try {
      const dias = daysInRange(fechaDesde, fechaHasta);
      const deviceIds = vehiculosGPS.map(v => Number(v.gps_device_id));

      // Load existing records to skip duplicates
      const { data: existingRaw = [] } = await supabase
        .from('asignacion_ruta')
        .select('fecha, consumidor_id')
        .eq('tipo_viaje', 'recorrido_gps')
        .gte('fecha', fechaDesde)
        .lte('fecha', fechaHasta);

      const existingSet = new Set(existingRaw.map(r => `${r.consumidor_id}_${r.fecha}`));

      let saved = 0, skipped = 0, sinActividad = 0, errors = 0;

      for (let i = 0; i < dias.length; i++) {
        const dia = dias[i];
        setProgress({ current: i + 1, total: dias.length, dia });

        try {
          const from = new Date(dia + 'T00:00:00');
          const to   = new Date(dia + 'T23:59:59');
          const summaries = await gpsApi.summaryMultiple(deviceIds, from, to);

          for (const veh of vehiculosGPS) {
            const key = `${veh.id}_${dia}`;
            if (existingSet.has(key)) { skipped++; continue; }

            const sum = summaries.find(s => Number(s.deviceId) === Number(veh.gps_device_id));
            const km  = metersToKm(sum?.distance ?? 0);

            if (km <= 0) { sinActividad++; continue; }

            await base44.entities.AsignacionRuta.create({
              fecha:                  dia,
              consumidor_id:          veh.id,
              consumidor_nombre:      veh.nombre,
              km_reales:              km,
              descripcion_emergencia: `Recorrido GPS — ${veh.nombre}`,
              tipo_viaje:             'recorrido_gps',
              estado:                 'completada',
              fuente:                 'gps',
              ruta_id:                null,
            });
            existingSet.add(key);
            saved++;
            addLog(`✓ ${dia} · ${veh.nombre} — ${km} km`);
          }
        } catch (err) {
          errors++;
          addLog(`✗ Error en ${dia}: ${err.message}`);
        }

        // Pause between days to avoid Traccar rate-limiting
        await new Promise(r => setTimeout(r, 400));
      }

      setResults({ saved, skipped, sinActividad, errors, dias: dias.length });
      toast.success(`Historial cargado: ${saved} registro${saved !== 1 ? 's' : ''} guardado${saved !== 1 ? 's' : ''}`);
    } catch (err) {
      toast.error(`Error inesperado: ${err.message}`);
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }

  const pct = progress ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !running) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            📥 Cargar historial GPS masivo
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1 text-xs">
          <p className="text-slate-500">
            Consulta el resumen GPS diario de todos los vehículos vinculados y guarda
            los km recorridos en el histórico de Rutas → Estadísticas.
          </p>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Desde</Label>
              <Input type="date" value={fechaDesde}
                max={fechaHasta} onChange={e => setFechaDesde(e.target.value)}
                className="mt-1 h-8 text-xs" disabled={running} />
            </div>
            <div>
              <Label className="text-xs">Hasta</Label>
              <Input type="date" value={fechaHasta}
                max={ayer} onChange={e => setFechaHasta(e.target.value)}
                className="mt-1 h-8 text-xs" disabled={running} />
            </div>
          </div>

          {/* Vehicles */}
          <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2.5 py-2">
            <p className="font-semibold text-slate-600 dark:text-slate-300 mb-1">
              {vehiculosGPS.length} vehículo{vehiculosGPS.length !== 1 ? 's' : ''} con GPS
            </p>
            {vehiculosGPS.length > 0
              ? <p className="text-slate-400">{vehiculosGPS.map(v => v.nombre).join(' · ')}</p>
              : <p className="text-amber-500">Ve a Configuración → GPS para vincular vehículos.</p>
            }
          </div>

          {/* Progress bar */}
          {running && progress && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-slate-500">
                <span>Procesando {progress.dia} ({progress.current}/{progress.total})</span>
                <span>{pct}%</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2">
                <div
                  className="bg-sky-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}

          {/* Live log */}
          {(running || results) && log.length > 0 && (
            <div className="bg-slate-900 rounded p-2 max-h-28 overflow-y-auto font-mono">
              {log.map((l, i) => (
                <p key={i} className={`text-[10px] ${l.startsWith('✗') ? 'text-red-400' : 'text-emerald-400'}`}>
                  {l}
                </p>
              ))}
            </div>
          )}

          {/* Results summary */}
          {results && (
            <div className="grid grid-cols-2 gap-2">
              <Stat value={results.saved}       label="Guardados"     color="emerald" />
              <Stat value={results.sinActividad} label="Sin actividad" color="slate"  />
              <Stat value={results.skipped}     label="Ya existían"   color="amber"  />
              {results.errors > 0 &&
                <Stat value={results.errors}    label="Errores"       color="red"    />}
            </div>
          )}

          {/* Buttons */}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={onClose} disabled={running}>
              {results ? 'Cerrar' : 'Cancelar'}
            </Button>
            {!results && (
              <Button
                size="sm"
                className="bg-sky-600 hover:bg-sky-700"
                onClick={iniciar}
                disabled={running || vehiculosGPS.length === 0}
              >
                {running ? 'Procesando…' : `Iniciar (${daysInRange(fechaDesde, fechaHasta).length} días)`}
              </Button>
            )}
            {results && (
              <Button size="sm" className="bg-sky-600 hover:bg-sky-700"
                onClick={() => { setResults(null); setLog([]); }}>
                Nueva carga
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ value, label, color }) {
  const colors = {
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    slate:   'bg-slate-50 border-slate-200 text-slate-600',
    amber:   'bg-amber-50 border-amber-200 text-amber-700',
    red:     'bg-red-50 border-red-200 text-red-600',
  };
  return (
    <div className={`border rounded px-2.5 py-2 text-center ${colors[color]}`}>
      <p className="font-bold text-lg leading-none">{value}</p>
      <p className="text-[10px] mt-0.5 opacity-80">{label}</p>
    </div>
  );
}
