import React, { useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { MapPin, Pencil, Trash2, Crosshair } from 'lucide-react';
import ConfirmDialog from '@/components/ui-helpers/ConfirmDialog';

const HABANA = [23.1136, -82.3666];

const COLORES = [
  { hex: '#ef4444', label: 'Rojo'     },
  { hex: '#f97316', label: 'Naranja'  },
  { hex: '#eab308', label: 'Amarillo' },
  { hex: '#22c55e', label: 'Verde'    },
  { hex: '#3b82f6', label: 'Azul'     },
  { hex: '#8b5cf6', label: 'Violeta'  },
  { hex: '#ec4899', label: 'Rosa'     },
];

function makePinIcon(nombre, color) {
  const label = nombre.length > 14 ? nombre.slice(0, 13) + '…' : nombre;
  return L.divIcon({
    className: '',
    iconAnchor: [10, 28],
    popupAnchor: [0, -30],
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;pointer-events:none">
        <div style="
          background:white;border:1px solid #cbd5e1;border-radius:4px;
          padding:1px 5px;font-size:11px;font-weight:600;white-space:nowrap;
          color:#1e293b;box-shadow:0 1px 3px rgba(0,0,0,.18);margin-bottom:2px
        ">${label}</div>
        <div style="
          width:18px;height:18px;border-radius:50%;
          background:${color};border:2.5px solid white;
          box-shadow:0 1px 4px rgba(0,0,0,.35)
        "></div>
        <div style="width:2px;height:8px;background:${color};opacity:.8"></div>
      </div>`,
  });
}

function MapSearch() {
  const map = useMap();
  const [query, setQuery]           = useState('');
  const [results, setResults]       = useState([]);
  const [loading, setLoading]       = useState(false);
  const [showResults, setShowResults] = useState(false);

  async function handleSearch(e) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?` +
        `q=${encodeURIComponent(query)}&format=json&limit=6&countrycodes=cu&addressdetails=1`,
        { headers: { 'Accept-Language': 'es' } },
      );
      const data = await resp.json();
      setResults(data);
      setShowResults(true);
    } catch {
      toast.error('Error al buscar ubicación');
    } finally {
      setLoading(false);
    }
  }

  function selectResult(r) {
    map.flyTo([parseFloat(r.lat), parseFloat(r.lon)], 17, { duration: 1.2 });
    setShowResults(false);
    setQuery(r.display_name.split(',')[0]);
  }

  return (
    <div
      style={{ position: 'absolute', top: 10, left: 50, zIndex: 1000, width: 290, fontFamily: 'inherit' }}
      onClick={e => e.stopPropagation()}
    >
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: 4 }}>
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); if (!e.target.value) setShowResults(false); }}
          placeholder="Buscar lugar en Cuba…"
          style={{
            flex: 1, padding: '7px 10px', borderRadius: 6,
            border: '1px solid #cbd5e1', fontSize: 12,
            boxShadow: '0 1px 5px rgba(0,0,0,.18)',
            outline: 'none', background: 'white', color: '#1e293b',
          }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '7px 10px', borderRadius: 6, background: 'white',
            border: '1px solid #cbd5e1', cursor: 'pointer',
            boxShadow: '0 1px 5px rgba(0,0,0,.18)',
            display: 'flex', alignItems: 'center',
          }}
        >
          {loading
            ? <span style={{ fontSize: 11, color: '#94a3b8' }}>…</span>
            : <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          }
        </button>
      </form>

      {showResults && (
        <ul style={{
          marginTop: 4, background: 'white', border: '1px solid #e2e8f0',
          borderRadius: 6, padding: 0, listStyle: 'none',
          boxShadow: '0 4px 14px rgba(0,0,0,.16)', maxHeight: 220, overflowY: 'auto',
        }}>
          {results.length === 0 ? (
            <li style={{ padding: '9px 12px', fontSize: 12, color: '#94a3b8' }}>
              Sin resultados
            </li>
          ) : results.map(r => (
            <li
              key={r.place_id}
              onClick={() => selectResult(r)}
              style={{ padding: '8px 12px', fontSize: 12, cursor: 'pointer', borderBottom: '1px solid #f1f5f9', color: '#1e293b' }}
              onMouseOver={e => e.currentTarget.style.background = '#f8fafc'}
              onMouseOut={e => e.currentTarget.style.background = 'white'}
            >
              <div style={{ fontWeight: 600 }}>{r.display_name.split(',')[0]}</div>
              <div style={{ color: '#94a3b8', fontSize: 11 }}>
                {r.display_name.split(',').slice(1, 3).join(', ').trim()}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ClickHandler({ enabled, onMapClick }) {
  useMapEvents({
    click(e) {
      if (enabled) onMapClick(e.latlng);
    },
  });
  return null;
}

const EMPTY_FORM = { nombre: '', descripcion: '', color: '#3b82f6' };

export default function MarcadoresPanel({ canWrite }) {
  const qc = useQueryClient();
  const [addMode, setAddMode]       = useState(false);
  const [dialog, setDialog]         = useState(null); // null | { mode:'create'|'edit', data }
  const [pendingLatLng, setPending] = useState(null);
  const [deleteTarget, setDelete]   = useState(null);
  const [form, setForm]             = useState(EMPTY_FORM);

  const { data: marcadores = [], isLoading } = useQuery({
    queryKey: ['marcadores'],
    queryFn: () => base44.entities.Marcador.list('-created_date'),
  });

  const active = marcadores.filter(m => m.activo);

  const createMut = useMutation({
    mutationFn: data => base44.entities.Marcador.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['marcadores'] }); toast.success('Marcador creado'); },
    onError: e => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Marcador.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['marcadores'] }); toast.success('Marcador actualizado'); },
    onError: e => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: id => base44.entities.Marcador.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['marcadores'] }); toast.success('Marcador eliminado'); },
    onError: e => toast.error(e.message),
  });

  const handleMapClick = useCallback((latlng) => {
    setPending(latlng);
    setForm(EMPTY_FORM);
    setDialog({ mode: 'create' });
    setAddMode(false);
  }, []);

  function openEdit(m) {
    setForm({ nombre: m.nombre, descripcion: m.descripcion || '', color: m.color || '#3b82f6' });
    setDialog({ mode: 'edit', data: m });
  }

  function handleSave() {
    if (!form.nombre.trim()) { toast.error('El nombre es obligatorio'); return; }

    if (dialog.mode === 'create') {
      if (!pendingLatLng) { toast.error('No hay coordenadas'); return; }
      createMut.mutate({
        nombre: form.nombre.trim(),
        descripcion: form.descripcion.trim() || null,
        color: form.color,
        lat: pendingLatLng.lat,
        lng: pendingLatLng.lng,
      });
    } else {
      updateMut.mutate({
        id: dialog.data.id,
        data: {
          nombre: form.nombre.trim(),
          descripcion: form.descripcion.trim() || null,
          color: form.color,
        },
      });
    }
    setDialog(null);
    setPending(null);
  }

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const mapCenter = active.length > 0
    ? [active[0].lat, active[0].lng]
    : HABANA;

  return (
    <div className="flex flex-col lg:flex-row gap-4" style={{ minHeight: 520 }}>
      {/* ── Sidebar: lista ─────────────────────────────────────────── */}
      <div className="lg:w-72 flex-shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">
            Marcadores ({active.length})
          </h3>
          {canWrite && (
            <Button
              size="sm"
              variant={addMode ? 'default' : 'outline'}
              className={`h-7 text-xs gap-1 ${addMode ? 'bg-sky-600 hover:bg-sky-700' : ''}`}
              onClick={() => setAddMode(v => !v)}
            >
              <Crosshair className="w-3.5 h-3.5" />
              {addMode ? 'Haz clic en el mapa' : 'Añadir marcador'}
            </Button>
          )}
        </div>

        {addMode && (
          <p className="text-xs text-sky-600 bg-sky-50 border border-sky-200 rounded px-2 py-1.5">
            Haz clic en cualquier punto del mapa para colocar el marcador.
          </p>
        )}

        {isLoading ? (
          <p className="text-xs text-slate-400">Cargando…</p>
        ) : active.length === 0 ? (
          <p className="text-xs text-slate-400">No hay marcadores. Usa "Añadir marcador" para colocar uno en el mapa.</p>
        ) : (
          <ul className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
            {active.map(m => (
              <li
                key={m.id}
                className="flex items-start gap-2 bg-white border border-slate-200 rounded-md px-2.5 py-2 shadow-sm"
              >
                <span
                  className="mt-0.5 w-3 h-3 rounded-full flex-shrink-0 border border-white shadow"
                  style={{ background: m.color || '#3b82f6' }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-800 truncate">{m.nombre}</p>
                  {m.descripcion && (
                    <p className="text-xs text-slate-400 truncate">{m.descripcion}</p>
                  )}
                  <p className="text-[10px] text-slate-300 mt-0.5">
                    {Number(m.lat).toFixed(5)}, {Number(m.lng).toFixed(5)}
                  </p>
                </div>
                {canWrite && (
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() => openEdit(m)}
                      className="text-slate-400 hover:text-sky-600 transition-colors"
                      title="Editar"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDelete(m)}
                      className="text-slate-400 hover:text-red-500 transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Mapa ───────────────────────────────────────────────────── */}
      <div className="flex-1 rounded-xl overflow-hidden border border-slate-200 shadow-sm" style={{ minHeight: 460 }}>
        <MapContainer
          center={mapCenter}
          zoom={12}
          style={{ height: '100%', width: '100%', minHeight: 460 }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>'
          />
          <MapSearch />
          <ClickHandler enabled={addMode} onMapClick={handleMapClick} />

          {active.map(m => (
            <Marker
              key={m.id}
              position={[m.lat, m.lng]}
              icon={makePinIcon(m.nombre, m.color || '#3b82f6')}
            >
              <Popup>
                <div style={{ minWidth: 160 }}>
                  <p style={{ fontWeight: 700, marginBottom: 2 }}>{m.nombre}</p>
                  {m.descripcion && (
                    <p style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{m.descripcion}</p>
                  )}
                  <p style={{ fontSize: 11, color: '#94a3b8' }}>
                    {Number(m.lat).toFixed(5)}, {Number(m.lng).toFixed(5)}
                  </p>
                  {canWrite && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <button
                        onClick={() => openEdit(m)}
                        style={{
                          fontSize: 11, padding: '2px 8px', borderRadius: 4,
                          background: '#f1f5f9', border: '1px solid #cbd5e1', cursor: 'pointer',
                        }}
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => setDelete(m)}
                        style={{
                          fontSize: 11, padding: '2px 8px', borderRadius: 4,
                          background: '#fee2e2', border: '1px solid #fca5a5',
                          color: '#dc2626', cursor: 'pointer',
                        }}
                      >
                        Eliminar
                      </button>
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* ── Diálogo: crear / editar ─────────────────────────────────── */}
      <Dialog open={!!dialog} onOpenChange={open => { if (!open) setDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <MapPin className="w-4 h-4 text-sky-500" />
              {dialog?.mode === 'create' ? 'Nuevo marcador' : 'Editar marcador'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 pt-1">
            {dialog?.mode === 'create' && pendingLatLng && (
              <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded px-2 py-1.5">
                Posición: {pendingLatLng.lat.toFixed(5)}, {pendingLatLng.lng.toFixed(5)}
              </p>
            )}

            <div className="space-y-1">
              <Label className="text-xs">Nombre *</Label>
              <Input
                value={form.nombre}
                onChange={e => set('nombre', e.target.value)}
                placeholder="Ej: Almacén Cerro"
                className="h-8 text-xs"
                autoFocus
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Descripción</Label>
              <Input
                value={form.descripcion}
                onChange={e => set('descripcion', e.target.value)}
                placeholder="Opcional"
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Color</Label>
              <div className="flex gap-2 flex-wrap">
                {COLORES.map(c => (
                  <button
                    key={c.hex}
                    title={c.label}
                    onClick={() => set('color', c.hex)}
                    style={{
                      width: 24, height: 24, borderRadius: '50%',
                      background: c.hex,
                      border: form.color === c.hex ? '3px solid #0ea5e9' : '2px solid #e2e8f0',
                      cursor: 'pointer',
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setDialog(null)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={createMut.isPending || updateMut.isPending}
              >
                Guardar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Confirmar eliminar ─────────────────────────────────────── */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={open => { if (!open) setDelete(null); }}
        title="Eliminar marcador"
        description={`¿Eliminar "${deleteTarget?.nombre}"? Esta acción no se puede deshacer.`}
        destructive
        onConfirm={() => { deleteMut.mutate(deleteTarget.id); setDelete(null); }}
      />
    </div>
  );
}
