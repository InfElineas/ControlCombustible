import React, { useState, useMemo, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Upload, Link2, Link2Off, Fuel, Route, AlertTriangle,
  CheckCircle2, ChevronDown, ChevronUp, Trash2, Car, Pencil, Check,
} from 'lucide-react';
import ConfirmDialog from '@/components/ui-helpers/ConfirmDialog';

const PAGE_SIZE = 20;

// ── Paginación ────────────────────────────────────────────────────────────────

function Paginacion({ page, total, pageSize, onChange }) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;
  const from = page * pageSize + 1;
  const to   = Math.min((page + 1) * pageSize, total);
  return (
    <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
      <span className="text-xs text-slate-400">{from}–{to} de {total}</span>
      <div className="flex gap-1">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page === 0}
          className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-600 disabled:opacity-30 hover:bg-slate-50 dark:hover:bg-slate-700"
        >‹ Anterior</button>
        <span className="px-2.5 py-1 text-xs text-slate-500">
          {page + 1} / {totalPages}
        </span>
        <button
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages - 1}
          className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-600 disabled:opacity-30 hover:bg-slate-50 dark:hover:bg-slate-700"
        >Siguiente ›</button>
      </div>
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

function normalizarChapa(raw) {
  if (!raw) return '';
  return raw.replace(/[\s\-_.]/g, '').toUpperCase();
}

function matchConsumidor(plateRaw, consumidores) {
  if (!plateRaw) return null;
  const norm = normalizarChapa(plateRaw);
  return consumidores.find(c => {
    const code = normalizarChapa(c.codigo_interno || '');
    const name = normalizarChapa(c.nombre || '');
    return code === norm || name === norm;
  }) || null;
}

function matchAsignacion(fecha, consumidorId, asignaciones) {
  if (!fecha || !consumidorId) return null;
  return asignaciones.find(a => a.fecha === fecha && a.consumidor_id === consumidorId) || null;
}

function confianzaColor(v) {
  if (v >= 0.9) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (v >= 0.7) return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-red-50 text-red-700 border-red-200';
}

function kmDesviacion(kmChat, kmSistema) {
  if (kmChat == null || !kmSistema) return null;
  return ((kmChat - kmSistema) / kmSistema) * 100;
}

// ── Fila de preview (antes de importar) ──────────────────────────────────────

function FilaPreview({ rec, consumidores, asignaciones, onChangeConsumidor, onEdit, onToggleAprobado }) {
  const [open, setOpen] = useState(false);

  const desv    = kmDesviacion(rec.km_total, rec._asig?.km_reales);
  const matchOk = !!rec._consumidor;
  const hasFlag = rec.flags?.length > 0;

  const handleNumEdit = (field, raw) => {
    const val = raw === '' ? null : parseFloat(raw);
    let updates = { [field]: isNaN(val) ? null : val };
    const km  = field === 'km_total'    ? updates.km_total    : rec.km_total;
    const lts = field === 'fuel_liters' ? updates.fuel_liters : rec.fuel_liters;
    if (km > 0 && lts > 0) updates.fuel_l_per_100km = parseFloat(((lts / km) * 100).toFixed(2));
    else if (field === 'km_total' || field === 'fuel_liters') updates.fuel_l_per_100km = null;
    onEdit(rec._idx, updates);
  };

  return (
    <div className={`border rounded-xl overflow-hidden transition-colors ${
      rec._aprobado
        ? 'border-emerald-400 bg-emerald-50/40 dark:border-emerald-700 dark:bg-emerald-900/10'
        : matchOk
          ? 'border-slate-200 dark:border-slate-700'
          : 'border-amber-200 bg-amber-50/30 dark:border-amber-800 dark:bg-amber-900/10'
    }`}>
      <div className="flex items-center gap-2 px-3 py-2.5">
        {/* Botón guardar/desmarcar — no propaga al toggle del acordeón */}
        <button
          onClick={e => { e.stopPropagation(); onToggleAprobado(rec._idx); }}
          title={rec._aprobado ? 'Desmarcar' : 'Guardar este registro'}
          className={`shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
            rec._aprobado
              ? 'border-emerald-500 bg-emerald-500 text-white'
              : 'border-slate-300 dark:border-slate-600 hover:border-emerald-400 text-transparent hover:text-emerald-400'
          }`}
        >
          <Check className="w-3 h-3" />
        </button>

        {/* Resto de la fila — clic abre el acordeón */}
        <div
          className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer"
          onClick={() => setOpen(o => !o)}
        >
          {matchOk
            ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            : <Link2Off className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          }
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 w-24 shrink-0">{rec.reported_date}</span>
          <span className="text-xs text-slate-500 shrink-0 w-24 truncate">
            {rec.vehicle_plate_raw || <span className="italic text-slate-300">Sin chapa</span>}
          </span>
          <span className="text-xs text-slate-700 dark:text-slate-300 flex-1 truncate">
            {rec._consumidor?.nombre || <span className="text-amber-600 font-medium">Sin match</span>}
          </span>
          {rec.fuel_liters != null
            ? <span className="text-xs font-semibold text-sky-700 tabular-nums shrink-0">{rec.fuel_liters} L</span>
            : <span className="text-xs text-red-400 tabular-nums shrink-0 italic">— L</span>
          }
          {rec.km_total != null
            ? <span className="text-xs text-slate-500 tabular-nums shrink-0">{rec.km_total} km</span>
            : <span className="text-xs text-red-400 tabular-nums shrink-0 italic">— km</span>
          }
          {hasFlag && <AlertTriangle className="w-3.5 h-3.5 text-orange-400 shrink-0" />}
          <Badge variant="outline" className={`text-[10px] shrink-0 ${confianzaColor(rec.extraction_confidence)}`}>
            {Math.round((rec.extraction_confidence || 0) * 100)}%
          </Badge>
          {open ? <ChevronUp className="w-3.5 h-3.5 text-slate-400 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
        </div>
      </div>

      {open && (
        <div className="border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 px-3 py-3 space-y-3">

          {/* ── Corrección de datos ── */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 p-2.5 space-y-2">
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Pencil className="w-3 h-3" /> Corregir datos antes de importar
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-400 block mb-0.5">km totales</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={rec.km_total ?? ''}
                  onChange={e => handleNumEdit('km_total', e.target.value)}
                  onClick={e => e.stopPropagation()}
                  placeholder="km"
                  className="w-full h-7 text-xs px-2 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-400"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-0.5">litros</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={rec.fuel_liters ?? ''}
                  onChange={e => handleNumEdit('fuel_liters', e.target.value)}
                  onClick={e => e.stopPropagation()}
                  placeholder="L"
                  className="w-full h-7 text-xs px-2 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-400"
                />
              </div>
            </div>
            {rec.fuel_l_per_100km != null && (
              <p className="text-[10px] text-violet-600 dark:text-violet-400">
                Eficiencia calculada: <b>{rec.fuel_l_per_100km} L/100 km</b>
              </p>
            )}
          </div>

          {/* Vincular vehículo manualmente */}
          {!rec._consumidor && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-amber-700">Vincular vehículo manualmente</p>
              <Select
                value={rec._consumidorManual || ''}
                onValueChange={v => onChangeConsumidor(rec._idx, v)}
              >
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Seleccionar consumidor" /></SelectTrigger>
                <SelectContent>
                  {consumidores.filter(c => c.activo).map(c => (
                    <SelectItem key={c.id} value={c.id} className="text-xs">
                      {c.nombre}{c.codigo_interno ? ` · ${c.codigo_interno}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Info de asignación vinculada */}
          {rec._asig && (
            <div className="text-xs space-y-1 text-slate-600 dark:text-slate-400">
              <p className="font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <Link2 className="w-3 h-3" /> Asignación encontrada en sistema
              </p>
              <p>Estado: <b>{rec._asig.estado}</b> · km sistema: <b>{rec._asig.km_reales ?? '—'}</b></p>
              {desv != null && (
                <p className={`font-medium ${Math.abs(desv) > 20 ? 'text-red-600' : Math.abs(desv) > 10 ? 'text-amber-600' : 'text-emerald-600'}`}>
                  Desviación km: {desv > 0 ? '+' : ''}{desv.toFixed(1)}%
                </p>
              )}
            </div>
          )}

          {/* Desglose km original del chat */}
          {(rec.km_base != null || rec.km_extra != null) && (
            <div className="text-xs text-slate-500 flex gap-4">
              <span className="text-slate-400">Chat:</span>
              {rec.km_base  != null && <span>Base <b className="text-slate-600 dark:text-slate-300">{rec.km_base} km</b></span>}
              {rec.km_extra != null && <span>Extra <b className="text-slate-600 dark:text-slate-300">{rec.km_extra} km</b></span>}
            </div>
          )}

          {/* Ruta */}
          {rec.route_text && (
            <p className="text-xs text-slate-500 italic">"{rec.route_text}"</p>
          )}

          {/* Flags */}
          {hasFlag && (
            <div className="flex gap-1 flex-wrap">
              {rec.flags.map(f => (
                <Badge key={f} variant="outline" className="text-[10px] bg-orange-50 text-orange-700 border-orange-200">{f}</Badge>
              ))}
            </div>
          )}

          {/* Mensaje original */}
          <details className="text-xs">
            <summary className="cursor-pointer text-slate-400 hover:text-slate-600">Ver mensaje original</summary>
            <pre className="mt-1 whitespace-pre-wrap text-slate-500 bg-slate-100 dark:bg-slate-800 rounded p-2 text-[10px]">{rec.raw_text}</pre>
          </details>
        </div>
      )}
    </div>
  );
}

// ── Fila de registro ya importado ────────────────────────────────────────────

function FilaImportada({ rec, asignaciones }) {
  const [open, setOpen] = useState(false);
  const asig = asignaciones.find(a => a.id === rec.asignacion_ruta_id);
  const desv = kmDesviacion(rec.km_total, asig?.km_reales);

  return (
    <div className="border border-slate-100 rounded-xl overflow-hidden">
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-slate-50"
        onClick={() => setOpen(o => !o)}
      >
        <Car className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span className="text-xs font-semibold text-slate-700 w-24 shrink-0">{rec.reported_date}</span>
        <span className="text-xs text-slate-600 flex-1 truncate">
          {rec.consumidor_nombre || rec.vehicle_plate_raw || '—'}
        </span>
        {rec.fuel_liters != null && (
          <span className="text-xs font-semibold text-sky-700 tabular-nums shrink-0">{rec.fuel_liters} L</span>
        )}
        {rec.km_total != null && (
          <span className="text-xs text-slate-500 tabular-nums shrink-0">{rec.km_total} km</span>
        )}
        {rec.fuel_l_per_100km != null && (
          <span className="text-xs text-violet-600 tabular-nums shrink-0">{rec.fuel_l_per_100km} L/100</span>
        )}
        {desv != null && (
          <span className={`text-[10px] font-semibold shrink-0 ${Math.abs(desv) > 20 ? 'text-red-500' : Math.abs(desv) > 10 ? 'text-amber-500' : 'text-emerald-500'}`}>
            {desv > 0 ? '+' : ''}{desv.toFixed(0)}%
          </span>
        )}
        {!rec.asignacion_ruta_id && (
          <Badge variant="outline" className="text-[10px] bg-slate-100 text-slate-500 border-slate-200 shrink-0 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-600">Sin asignación</Badge>
        )}
        {open ? <ChevronUp className="w-3.5 h-3.5 text-slate-400 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
      </div>

      {open && (
        <div className="border-t border-slate-100 bg-slate-50/50 px-3 py-3 space-y-2 text-xs text-slate-600">
          {rec.route_text && <p className="italic text-slate-500">"{rec.route_text}"</p>}
          {(rec.km_base != null || rec.km_extra != null) && (
            <div className="flex gap-4">
              {rec.km_base  != null && <span>Base: <b>{rec.km_base} km</b></span>}
              {rec.km_extra != null && <span>Extra: <b>{rec.km_extra} km</b></span>}
            </div>
          )}
          {asig && <p>Asignación: <b>{asig.estado}</b> · km sistema: <b>{asig.km_reales ?? '—'}</b></p>}
          {rec.sender && <p>Reportado por: <b>{rec.sender}</b></p>}
          {rec.raw_text && (
            <details>
              <summary className="cursor-pointer text-slate-400 hover:text-slate-600">Ver mensaje original</summary>
              <pre className="mt-1 whitespace-pre-wrap text-slate-500 bg-slate-100 rounded p-2 text-[10px]">{rec.raw_text}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tarjeta de historial por vehículo ────────────────────────────────────────

const TRIPS_PER_CARD = 15;

function VehiculoHistorialCard({ grupo }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);

  const trips      = grupo.records; // ya ordenados desc
  const totalKm    = trips.reduce((s, r) => s + (r.km_total    || 0), 0);
  const totalLts   = trips.reduce((s, r) => s + (r.fuel_liters || 0), 0);
  const eficiencias = trips.filter(r => r.fuel_l_per_100km != null);
  const avgEf      = eficiencias.length
    ? eficiencias.reduce((s, r) => s + r.fuel_l_per_100km, 0) / eficiencias.length
    : null;
  const fechaMin   = trips[trips.length - 1]?.reported_date;
  const fechaMax   = trips[0]?.reported_date;

  const tripsPag   = trips.slice(page * TRIPS_PER_CARD, (page + 1) * TRIPS_PER_CARD);
  const totalPages = Math.ceil(trips.length / TRIPS_PER_CARD);

  return (
    <Card className="border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
      {/* Cabecera de la tarjeta */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
        onClick={() => setOpen(o => !o)}
      >
        <Car className="w-4 h-4 text-slate-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
            {grupo.nombre}
            {grupo.plate && grupo.plate !== grupo.nombre && (
              <span className="ml-2 text-xs font-normal text-slate-400">{grupo.plate}</span>
            )}
          </p>
          <div className="flex gap-3 mt-0.5 flex-wrap text-xs text-slate-400">
            {fechaMin && <span>{fechaMin} → {fechaMax}</span>}
          </div>
        </div>

        {/* KPIs compactos */}
        <div className="hidden sm:flex items-center gap-4 shrink-0">
          <div className="text-center">
            <p className="text-[10px] text-slate-400">Viajes</p>
            <p className="text-sm font-bold text-slate-700 dark:text-slate-200 tabular-nums">{trips.length}</p>
          </div>
          {totalKm > 0 && (
            <div className="text-center">
              <p className="text-[10px] text-slate-400">km totales</p>
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200 tabular-nums">{totalKm.toFixed(0)}</p>
            </div>
          )}
          {totalLts > 0 && (
            <div className="text-center">
              <p className="text-[10px] text-slate-400">Litros</p>
              <p className="text-sm font-bold text-sky-600 tabular-nums">{totalLts.toFixed(1)}</p>
            </div>
          )}
          {avgEf != null && (
            <div className="text-center">
              <p className="text-[10px] text-slate-400">L/100 km</p>
              <p className="text-sm font-bold text-violet-600 tabular-nums">{avgEf.toFixed(1)}</p>
            </div>
          )}
        </div>

        {open
          ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
          : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
        }
      </div>

      {/* Lista de viajes */}
      {open && (
        <div className="border-t border-slate-100 dark:border-slate-700">
          {/* KPIs móvil */}
          <div className="sm:hidden flex gap-4 px-4 py-2 bg-slate-50 dark:bg-slate-800/30 text-xs">
            <span><b>{trips.length}</b> viajes</span>
            {totalKm  > 0 && <span><b>{totalKm.toFixed(0)}</b> km</span>}
            {totalLts > 0 && <span className="text-sky-600"><b>{totalLts.toFixed(1)}</b> L</span>}
            {avgEf != null && <span className="text-violet-600"><b>{avgEf.toFixed(1)}</b> L/100</span>}
          </div>

          {/* Tabla de viajes */}
          <div className="divide-y divide-slate-50 dark:divide-slate-800">
            {tripsPag.map(r => (
              <div key={r.id} className="flex items-center gap-2 px-4 py-2">
                <span className="text-xs text-slate-500 w-24 shrink-0">{r.reported_date}</span>
                <span className="text-xs text-slate-400 flex-1 truncate italic">
                  {r.route_text || '—'}
                </span>
                {r.km_total != null && (
                  <span className="text-xs text-slate-600 dark:text-slate-300 tabular-nums shrink-0 w-14 text-right">
                    {r.km_total} km
                  </span>
                )}
                {r.fuel_liters != null && (
                  <span className="text-xs text-sky-600 tabular-nums shrink-0 w-14 text-right">
                    {r.fuel_liters} L
                  </span>
                )}
                {r.fuel_l_per_100km != null && (
                  <span className="text-xs text-violet-500 tabular-nums shrink-0 w-16 text-right">
                    {r.fuel_l_per_100km} L/100
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Paginación interna */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-2 border-t border-slate-50 dark:border-slate-800">
              <span className="text-[10px] text-slate-400">
                {page * TRIPS_PER_CARD + 1}–{Math.min((page + 1) * TRIPS_PER_CARD, trips.length)} de {trips.length}
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

// ── Componente principal ──────────────────────────────────────────────────────

export default function ReporteChatPanel({ consumidores, asignaciones }) {
  const queryClient = useQueryClient();
  const fileRef = useRef(null);

  const [fase, setFase]           = useState('lista'); // 'lista' | 'preview'
  const [vistaMode, setVistaMode] = useState('cronologico'); // 'cronologico' | 'por_vehiculo'
  const [previewRows, setPreviewRows] = useState([]);
  const [soloConMatch, setSoloConMatch] = useState(false);
  const [deleteId, setDeleteId]   = useState(null);
  const [listaPage, setListaPage] = useState(0);
  const [previewPage, setPreviewPage] = useState(0);

  const vehiculos = useMemo(
    () => consumidores.filter(c => c.activo),
    [consumidores]
  );

  const { data: reportes = [], isLoading, error: reportesError } = useQuery({
    queryKey: ['reporte_chat_transporte'],
    queryFn: () => base44.entities.ReporteChatTransporte.list('-reported_date', 2000),
    retry: false,
  });

  const tablaMissing = reportesError?.message?.includes('404') ||
                       reportesError?.message?.includes('relation') ||
                       reportesError?.code === 'PGRST116';

  const importMut = useMutation({
    mutationFn: async (rows) => {
      for (const row of rows) {
        await base44.entities.ReporteChatTransporte.create(row);
      }
    },
    onSuccess: (_, rows) => {
      queryClient.invalidateQueries({ queryKey: ['reporte_chat_transporte'] });
      toast.success(`${rows.length} reportes importados correctamente`);
      setFase('lista');
      setPreviewRows([]);
      setSoloConMatch(false);
    },
    onError: () => toast.error('Error al importar. Verifica la consola.'),
  });

  const deleteMut = useMutation({
    mutationFn: id => base44.entities.ReporteChatTransporte.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reporte_chat_transporte'] });
      toast.success('Registro eliminado');
      setDeleteId(null);
    },
  });

  // Parsear JSON y construir preview
  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target.result);
        const transportReports = json.transport_reports ?? json;
        if (!Array.isArray(transportReports)) throw new Error('Formato inválido');

        // Claves de registros ya importados para deduplicación
        const existingIds = new Set(
          reportes.map(x => x.source_message_id).filter(Boolean)
        );
        const existingFallback = new Set(
          reportes.map(x =>
            `${x.reported_date}|${normalizarChapa(x.vehicle_plate_raw || '')}|${x.fuel_liters ?? ''}`
          )
        );

        const rows = transportReports.map((r, idx) => {
          const consumidor = matchConsumidor(r.vehicle_plate, vehiculos);
          const asig = matchAsignacion(r.reported_date, consumidor?.id, asignaciones);
          const sourceId = r.source_message_id || r.id || null;
          const fallbackKey = `${r.reported_date}|${normalizarChapa(r.vehicle_plate || '')}|${r.fuel_liters ?? ''}`;
          const isDuplicate = (sourceId && existingIds.has(sourceId)) || existingFallback.has(fallbackKey);
          return {
            _idx: idx,
            _consumidor: consumidor,
            _consumidorManual: '',
            _asig: asig,
            _isDuplicate: isDuplicate,
            // campos de la tabla
            source_message_id:     sourceId,
            reported_date:         r.reported_date,
            sender:                r.sender || null,
            vehicle_plate_raw:     r.vehicle_plate || null,
            vehicle_type:          r.vehicle_type || null,
            route_text:            r.route_text || null,
            km_base:               r.km_base ?? null,
            km_extra:              r.km_extra ?? null,
            km_total:              r.km_total ?? null,
            fuel_liters:           r.fuel_liters ?? null,
            fuel_l_per_100km:      r.fuel_l_per_100km ?? null,
            extraction_confidence: r.extraction_confidence ?? null,
            flags:                 r.flags ?? [],
            raw_text:              r.raw_text || null,
          };
        });

        setPreviewRows(rows);
        setPreviewPage(0);
        setFase('preview');
      } catch {
        toast.error('No se pudo leer el JSON. Verifica el formato.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Filas que efectivamente se importarán: aprobadas y sin duplicados
  const rowsToImport = useMemo(() =>
    previewRows.filter(r => r._aprobado && !r._isDuplicate),
  [previewRows]);

  const handleEdit = (idx, updates) => {
    setPreviewRows(prev => prev.map(r => r._idx !== idx ? r : { ...r, ...updates }));
  };

  const handleSoloConMatch = (v) => { setSoloConMatch(v); setPreviewPage(0); };

  const handleToggleAprobado = (idx) => {
    setPreviewRows(prev => prev.map(r =>
      r._idx !== idx ? r : { ...r, _aprobado: !r._aprobado }
    ));
  };

  const handleChangeConsumidor = (idx, consumidorId) => {
    setPreviewRows(prev => prev.map(r => {
      if (r._idx !== idx) return r;
      const c = vehiculos.find(v => v.id === consumidorId);
      const asig = matchAsignacion(r.reported_date, consumidorId, asignaciones);
      return { ...r, _consumidor: c, _consumidorManual: consumidorId, _asig: asig };
    }));
  };

  const handleImport = () => {
    const payload = rowsToImport.map(r => {
      const consumidor = r._consumidor;
      const asig = r._asig;
      return {
        source_message_id:     r.source_message_id,
        reported_date:         r.reported_date,
        sender:                r.sender,
        vehicle_plate_raw:     r.vehicle_plate_raw,
        vehicle_type:          r.vehicle_type,
        route_text:            r.route_text,
        km_base:               r.km_base,
        km_extra:              r.km_extra,
        km_total:              r.km_total,
        fuel_liters:           r.fuel_liters,
        fuel_l_per_100km:      r.fuel_l_per_100km,
        extraction_confidence: r.extraction_confidence,
        flags:                 r.flags,
        raw_text:              r.raw_text,
        consumidor_id:         consumidor?.id || null,
        consumidor_nombre:     consumidor?.nombre || null,
        asignacion_ruta_id:    asig?.id || null,
      };
    });
    importMut.mutate(payload);
  };

  // ── Estadísticas de registros importados ──────────────────────────────────

  const stats = useMemo(() => {
    if (!reportes.length) return null;
    const conMatch     = reportes.filter(r => r.asignacion_ruta_id).length;
    const huerfanos    = reportes.length - conMatch;
    const totalLitros  = reportes.reduce((s, r) => s + (r.fuel_liters || 0), 0);
    const totalKm      = reportes.reduce((s, r) => s + (r.km_total || 0), 0);
    const promedioEf   = reportes.filter(r => r.fuel_l_per_100km).length > 0
      ? reportes.filter(r => r.fuel_l_per_100km).reduce((s, r) => s + r.fuel_l_per_100km, 0) /
        reportes.filter(r => r.fuel_l_per_100km).length
      : null;
    return { conMatch, huerfanos, totalLitros, totalKm, promedioEf };
  }, [reportes]);

  // Agrupamiento por vehículo para la vista "Por vehículo"
  const porVehiculo = useMemo(() => {
    const groups = {};
    [...reportes].sort((a, b) => b.reported_date?.localeCompare(a.reported_date)).forEach(r => {
      const key    = r.consumidor_id || `plate_${r.vehicle_plate_raw}` || 'sin_id';
      const nombre = r.consumidor_nombre || r.vehicle_plate_raw || 'Sin identificar';
      if (!groups[key]) groups[key] = { key, nombre, plate: r.vehicle_plate_raw, records: [] };
      groups[key].records.push(r);
    });
    return Object.values(groups).sort((a, b) => b.records.length - a.records.length);
  }, [reportes]);

  // ── FASE: LISTA ────────────────────────────────────────────────────────────

  if (fase === 'lista') {
    const reportesPag = reportes.slice(listaPage * PAGE_SIZE, (listaPage + 1) * PAGE_SIZE);

    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Reportes de chat importados</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Datos extraídos del chat de WhatsApp, vinculados a las asignaciones del sistema.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Toggle de vista */}
            {reportes.length > 0 && (
              <div className="flex gap-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
                {[
                  { value: 'cronologico',  label: 'Cronológico' },
                  { value: 'por_vehiculo', label: 'Por vehículo' },
                ].map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => { setVistaMode(value); setListaPage(0); }}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                      vistaMode === value
                        ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                    }`}
                  >{label}</button>
                ))}
              </div>
            )}
            <Button size="sm" onClick={() => fileRef.current?.click()} className="gap-1.5">
              <Upload className="w-3.5 h-3.5" /> Importar JSON
            </Button>
            <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleFile} />
          </div>
        </div>

        {/* Estadísticas rápidas */}
        {stats && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: 'Total reportes', value: reportes.length,                icon: <Route className="w-4 h-4 text-slate-400" /> },
              { label: 'Con asignación', value: stats.conMatch,                 icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" /> },
              { label: 'Huérfanos',      value: stats.huerfanos,                icon: <Link2Off className="w-4 h-4 text-amber-500" /> },
              { label: 'Litros totales', value: `${stats.totalLitros.toFixed(1)} L`, icon: <Fuel className="w-4 h-4 text-sky-500" /> },
            ].map(({ label, value, icon }) => (
              <Card key={label} className="border-0 shadow-sm">
                <CardContent className="p-3 flex items-center gap-2">
                  {icon}
                  <div>
                    <p className="text-xs text-slate-500">{label}</p>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums">{value}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Eficiencia promedio */}
        {stats?.promedioEf != null && (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-3 flex items-center gap-3">
              <Fuel className="w-4 h-4 text-violet-500 shrink-0" />
              <div>
                <p className="text-xs text-slate-500">Eficiencia promedio de flota (chat)</p>
                <p className="text-lg font-bold text-violet-700 tabular-nums">{stats.promedioEf.toFixed(2)} L/100 km</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Error: tabla no existe */}
        {tablaMissing && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-3 text-xs text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold">La tabla no existe en Supabase todavía.</p>
              <p>Ejecuta el bloque <b>sección 16</b> del archivo <code>MIGRACION_GLOBAL.sql</code> en el SQL Editor de Supabase y recarga la página.</p>
            </div>
          </div>
        )}

        {/* Vista: Por vehículo */}
        {!isLoading && !tablaMissing && vistaMode === 'por_vehiculo' && reportes.length > 0 && (
          <div className="space-y-3">
            {porVehiculo.map(grupo => (
              <VehiculoHistorialCard key={grupo.key} grupo={grupo} />
            ))}
          </div>
        )}

        {/* Vista: Cronológica */}
        {vistaMode === 'cronologico' && (isLoading ? (
          <p className="text-xs text-slate-400 py-8 text-center">Cargando...</p>
        ) : !tablaMissing && reportes.length === 0 ? (
          <div className="py-14 text-center space-y-2">
            <Upload className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-sm text-slate-400">Ningún reporte importado aún.</p>
            <p className="text-xs text-slate-300">Usa el botón "Importar JSON" para cargar el archivo exportado del chat.</p>
          </div>
        ) : !tablaMissing ? (
          <div className="space-y-2">
            {reportesPag.map(r => (
              <div key={r.id} className="relative group">
                <FilaImportada rec={r} asignaciones={asignaciones} />
                <button
                  onClick={() => setDeleteId(r.id)}
                  className="absolute top-2 right-8 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-50 text-red-400"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <Paginacion
              page={listaPage}
              total={reportes.length}
              pageSize={PAGE_SIZE}
              onChange={p => { setListaPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            />
          </div>
        ) : null)}

        <ConfirmDialog
          open={!!deleteId}
          onOpenChange={open => { if (!open) setDeleteId(null); }}
          title="Eliminar reporte"
          description="¿Seguro que deseas eliminar este reporte importado del chat?"
          onConfirm={() => deleteMut.mutate(deleteId)}
          destructive
        />
      </div>
    );
  }

  // ── FASE: PREVIEW ──────────────────────────────────────────────────────────

  const aprobados  = previewRows.filter(r => r._aprobado).length;
  const duplicados = previewRows.filter(r => r._isDuplicate).length;
  const visibles   = previewRows.filter(r => !soloConMatch || !!r._consumidor);
  const visiblesPag = visibles.slice(previewPage * PAGE_SIZE, (previewPage + 1) * PAGE_SIZE);

  return (
    <div className="space-y-4">
      {/* Header preview */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Revisión de registros — {previewRows.length} en total
          </p>
          <p className="text-xs text-slate-400">
            Marca ✓ en cada fila que quieras importar. Corrige los datos si es necesario antes de marcar.
          </p>
          <div className="flex gap-3 mt-0.5 text-xs flex-wrap">
            <span className={`font-semibold ${aprobados > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
              {aprobados} guardado{aprobados !== 1 ? 's' : ''}
            </span>
            {duplicados > 0 && (
              <span className="text-slate-400">{duplicados} duplicado{duplicados !== 1 ? 's' : ''} (se omitirán)</span>
            )}
          </div>
        </div>
        <div className="flex gap-2 items-center flex-wrap shrink-0">
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={soloConMatch}
              onChange={e => handleSoloConMatch(e.target.checked)}
              className="accent-sky-600 w-3.5 h-3.5"
            />
            <span className="text-xs text-slate-600 dark:text-slate-300">Solo con match</span>
          </label>
          <Button size="sm" variant="outline" onClick={() => { setFase('lista'); setPreviewRows([]); setSoloConMatch(false); }}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleImport}
            disabled={importMut.isPending || rowsToImport.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {importMut.isPending
              ? 'Importando...'
              : `Importar ${rowsToImport.length} guardado${rowsToImport.length !== 1 ? 's' : ''}`
            }
          </Button>
        </div>
      </div>

      {duplicados > 0 && (
        <div className="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" />
          <span>
            {duplicados} registro{duplicados !== 1 ? 's' : ''} ya exist{duplicados !== 1 ? 'en' : 'e'} en el sistema.
            Aunque los marques, no se importarán.
          </span>
        </div>
      )}

      <div className="space-y-2">
        {visiblesPag.map(r =>
          r._isDuplicate ? (
            <div
              key={r._idx}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-100 bg-slate-50/60 opacity-40 dark:border-slate-700 dark:bg-slate-800/30"
            >
              <div className="w-6 h-6 shrink-0 rounded-full border-2 border-slate-200 dark:border-slate-600" />
              <span className="text-xs text-slate-400 w-24 shrink-0">{r.reported_date}</span>
              <span className="text-xs text-slate-400 shrink-0 w-24 truncate">{r.vehicle_plate_raw || '—'}</span>
              <span className="text-xs text-slate-400 flex-1 truncate">{r._consumidor?.nombre || '—'}</span>
              <Badge variant="outline" className="text-[10px] shrink-0 bg-slate-50 text-slate-400 border-slate-200">Ya importado</Badge>
            </div>
          ) : (
            <FilaPreview
              key={r._idx}
              rec={r}
              consumidores={vehiculos}
              asignaciones={asignaciones}
              onChangeConsumidor={handleChangeConsumidor}
              onEdit={handleEdit}
              onToggleAprobado={handleToggleAprobado}
            />
          )
        )}
      </div>

      <Paginacion
        page={previewPage}
        total={visibles.length}
        pageSize={PAGE_SIZE}
        onChange={p => { setPreviewPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
      />

      {/* Botón inferior */}
      <div className="pt-2 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between gap-2">
        <span className="text-xs text-slate-400">
          {aprobados === 0
            ? 'Marca registros con ✓ para habilitarlos'
            : `${aprobados} registro${aprobados !== 1 ? 's' : ''} listo${aprobados !== 1 ? 's' : ''} para importar`
          }
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => { setFase('lista'); setPreviewRows([]); setSoloConMatch(false); }}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleImport}
            disabled={importMut.isPending || rowsToImport.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {importMut.isPending
              ? 'Importando...'
              : `Importar ${rowsToImport.length} guardado${rowsToImport.length !== 1 ? 's' : ''}`
            }
          </Button>
        </div>
      </div>
    </div>
  );
}
