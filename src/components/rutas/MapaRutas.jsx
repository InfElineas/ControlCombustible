import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { gpsApi, metersToKm } from '@/api/gpsClient';
import BackfillGpsDialog from '@/components/rutas/BackfillGpsDialog';

// Fix Leaflet default icons when bundled with Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const HABANA = [23.1136, -82.3666];

// Green dot icon for live GPS vehicle positions
function makeVehicleIcon(moving) {
  const bg = moving ? '#16a34a' : '#94a3b8';
  return L.divIcon({
    className: '',
    html: `<div style="width:18px;height:18px;background:${bg};border:2.5px solid white;border-radius:50%;box-shadow:0 1px 5px rgba(0,0,0,.4)"></div>`,
    iconSize:   [18, 18],
    iconAnchor: [9, 9],
  });
}

function ClickHandler({ onPick }) {
  useMapEvents({ click: e => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

// Pequeño mapa embebido para seleccionar un punto único
export function MapaPicker({ lat, lng, onPick }) {
  const center = lat != null && lng != null ? [lat, lng] : HABANA;
  return (
    <MapContainer center={center} zoom={12} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <ClickHandler onPick={onPick} />
      {lat != null && lng != null && (
        <Marker position={[lat, lng]}>
          <Popup><span className="text-xs font-mono">{lat.toFixed(6)}, {lng.toFixed(6)}</span></Popup>
        </Marker>
      )}
    </MapContainer>
  );
}

// Mapa principal que muestra todas las rutas + posiciones GPS en vivo
export function MapaRutas({ rutas = [], novedadesHoy = [] }) {
  const queryClient = useQueryClient();
  const [clickedCoord, setClickedCoord] = useState(null);
  const [tracks, setTracks]       = useState({});
  const [savingTrack, setSavingTrack] = useState({});

  // Consumidores — para mapear deviceId → nombre del vehículo
  const { data: consumidores = [] } = useQuery({
    queryKey: ['consumidores'],
    queryFn: () => base44.entities.Consumidor.list(),
    staleTime: 60_000,
  });

  // Waypoints: ruta_marcador + marcadores (para polilíneas multi-punto)
  const { data: rutaMarcadores = [] } = useQuery({
    queryKey: ['ruta_marcadores'],
    queryFn: () => base44.entities.RutaMarcador.list('orden'),
    staleTime: 60_000,
  });
  const { data: marcadores = [] } = useQuery({
    queryKey: ['marcadores'],
    queryFn: () => base44.entities.Marcador.list(),
    staleTime: 60_000,
  });

  // Posiciones GPS en vivo (actualiza cada 30 s; falla silenciosamente si el proxy no está desplegado)
  const { data: livePositions = [], dataUpdatedAt } = useQuery({
    queryKey: ['gps-positions-live'],
    queryFn: () => gpsApi.allPositions(),
    refetchInterval: 30_000,
    staleTime: 25_000,
    retry: 1,
    throwOnError: false,
  });

  // IDs de dispositivos GPS vinculados a vehículos del catálogo (para saveTrack)
  const linkedDeviceIds = consumidores
    .filter(c => c.gps_device_id != null)
    .map(c => Number(c.gps_device_id));

  // Todos los dispositivos visibles en el mapa (vinculados o no)
  const allDeviceIds = livePositions
    .filter(p => p.latitude != null && p.longitude != null)
    .map(p => Number(p.deviceId));

  // Resumen del día para TODOS los dispositivos visibles (km recorridos hoy, refresca cada 5 min)
  const { data: todaySummaries = [] } = useQuery({
    queryKey: ['gps-summary-today', new Date().toISOString().slice(0, 10), allDeviceIds.join(',')],
    queryFn: () => {
      const from = new Date(); from.setHours(0, 0, 0, 0);
      const to   = new Date(); to.setHours(23, 59, 59, 999);
      return gpsApi.summaryMultiple(allDeviceIds, from, to);
    },
    enabled:         allDeviceIds.length > 0,
    refetchInterval: 5 * 60_000,
    staleTime:       4 * 60_000,
    retry: 1,
    throwOnError: false,
  });

  const hoy = new Date().toISOString().slice(0, 10);
  const [trackDates, setTrackDates] = useState({});

  const fetchTrack = async (deviceId, fecha) => {
    const dateStr = fecha ?? hoy;
    setTracks(prev => ({ ...prev, [deviceId]: { loading: true, points: prev[deviceId]?.points ?? [], fecha: dateStr } }));
    try {
      const from = new Date(dateStr + 'T00:00:00');
      const to   = new Date(dateStr + 'T23:59:59');
      const route = await gpsApi.route(deviceId, from, to);
      const points = (route ?? [])
        .filter(p => p.latitude != null && p.longitude != null)
        .map(p => [p.latitude, p.longitude]);
      setTracks(prev => ({ ...prev, [deviceId]: { loading: false, points, fecha: dateStr } }));
    } catch {
      setTracks(prev => ({ ...prev, [deviceId]: { loading: false, points: [], fecha: dateStr } }));
    }
  };

  const clearTrack = (deviceId) => setTracks(prev => {
    const next = { ...prev }; delete next[deviceId]; return next;
  });

  const saveTrack = async (deviceId, consumidor, trackPoints, fecha) => {
    if (!consumidor) return;
    setSavingTrack(prev => ({ ...prev, [deviceId]: true }));
    try {
      const today = fecha ?? hoy;

      // Guard against duplicates before inserting
      const { data: existing } = await supabase
        .from('asignacion_ruta')
        .select('id')
        .eq('consumidor_id', consumidor.id)
        .eq('fecha', today)
        .eq('tipo_viaje', 'recorrido_gps')
        .maybeSingle();

      if (existing) {
        toast.info(`El recorrido del ${today} ya está guardado para ${consumidor.nombre}`);
        return;
      }
      const from  = new Date(today + 'T00:00:00');
      const to    = new Date(today + 'T23:59:59');

      const [summary, positions] = await Promise.all([
        gpsApi.summary(deviceId, from, to).catch(() => []),
        gpsApi.position(deviceId).catch(() => []),
      ]);

      const km        = metersToKm(summary?.[0]?.distance ?? 0);
      const odometro  = positions?.[0]?.attributes?.totalDistance != null
        ? metersToKm(positions[0].attributes.totalDistance)
        : null;

      const ptInicio = trackPoints[0];
      const ptFin    = trackPoints[trackPoints.length - 1];

      const obs = [
        ptInicio ? `Inicio: ${ptInicio[0].toFixed(5)}, ${ptInicio[1].toFixed(5)}` : null,
        ptFin    ? `Fin: ${ptFin[0].toFixed(5)}, ${ptFin[1].toFixed(5)}`          : null,
        odometro != null ? `Odómetro: ${odometro.toLocaleString()} km`             : null,
      ].filter(Boolean).join(' | ');

      await base44.entities.AsignacionRuta.create({
        fecha:                  today,
        consumidor_id:          consumidor.id,
        consumidor_nombre:      consumidor.nombre,
        km_reales:              km > 0 ? km : null,
        descripcion_emergencia: `Recorrido GPS — ${consumidor.nombre}`,
        observaciones:          obs || null,
        tipo_viaje:             'recorrido_gps',
        estado:                 'completada',
        fuente:                 'gps',
        ruta_id:                null,
      });

      queryClient.invalidateQueries({ queryKey: ['asignaciones_ruta'] });
      toast.success(`Recorrido guardado${km > 0 ? ` — ${km} km` : ''}`);
    } catch (err) {
      toast.error(`Error al guardar: ${err.message}`);
    } finally {
      setSavingTrack(prev => ({ ...prev, [deviceId]: false }));
    }
  };

  const rutasConCoords = rutas.filter(
    r => r.lat_inicio != null && r.lng_inicio != null && r.lat_fin != null && r.lng_fin != null
  );

  const rutasSinCoords = rutas.filter(r => r.activa).filter(
    r => r.lat_inicio == null || r.lng_inicio == null || r.lat_fin == null || r.lng_fin == null
  );

  // Posiciones válidas con lat/lng
  const posicionesValidas = livePositions.filter(
    p => p.latitude != null && p.longitude != null
  );

  const [vehiculoFiltro, setVehiculoFiltro] = useState('');
  const [showBackfill, setShowBackfill] = useState(false);

  const posicionesFiltradas = vehiculoFiltro.trim()
    ? posicionesValidas.filter(pos => {
        const c = consumidores.find(c => Number(c.gps_device_id) === Number(pos.deviceId));
        const nombre = c?.nombre ?? `GPS #${pos.deviceId}`;
        return nombre.toLowerCase().includes(vehiculoFiltro.toLowerCase());
      })
    : posicionesValidas;

  const updatedAt = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('es-CU', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="space-y-2">
      {/* Filtro de vehículo + botón backfill */}
      <div className="flex items-center gap-2">
        {posicionesValidas.length > 0 && (
          <>
            <div className="relative flex-1 max-w-xs">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              type="text"
              value={vehiculoFiltro}
              onChange={e => setVehiculoFiltro(e.target.value)}
              placeholder="Filtrar vehículo en mapa…"
              className="w-full pl-8 pr-8 h-8 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-400"
            />
            {vehiculoFiltro && (
              <button
                onClick={() => setVehiculoFiltro('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-base leading-none"
              >×</button>
            )}
          </div>
            <span className="text-xs text-slate-400 shrink-0">
              {posicionesFiltradas.length} / {posicionesValidas.length} vehículo{posicionesValidas.length !== 1 ? 's' : ''}
            </span>
          </>
        )}
        <button
          onClick={() => setShowBackfill(true)}
          className="ml-auto shrink-0 flex items-center gap-1.5 h-8 px-3 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          📥 Cargar historial GPS
        </button>
      </div>

      <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm" style={{ height: 480 }}>
        <MapContainer
          center={HABANA}
          zoom={11}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickHandler onPick={(lat, lng) => setClickedCoord({ lat, lng })} />

          {/* Rutas como polilíneas (waypoints si existen, si no inicio→fin) */}
          {rutasConCoords.map(ruta => {
            const nov       = novedadesHoy.find(a => a.ruta_id === ruta.id);
            const cancelada = nov?.estado === 'cancelada';
            const color     = !ruta.activa ? '#94a3b8' : cancelada ? '#ef4444' : '#0ea5e9';
            const weight    = ruta.activa ? 4 : 2;
            const opacity   = ruta.activa ? 0.85 : 0.3;

            // Waypoints ordenados para esta ruta
            const wps = rutaMarcadores
              .filter(rm => rm.ruta_id === ruta.id)
              .sort((a, b) => a.orden - b.orden)
              .map(rm => marcadores.find(m => m.id === rm.marcador_id))
              .filter(Boolean);

            const positions = wps.length >= 2
              ? wps.map(m => [Number(m.lat), Number(m.lng)])
              : [[ruta.lat_inicio, ruta.lng_inicio], [ruta.lat_fin, ruta.lng_fin]];

            const popupContent = (
              <div style={{ minWidth: 160 }}>
                <p style={{ fontWeight: 700, marginBottom: 2 }}>{ruta.nombre}</p>
                {wps.length >= 2 ? (
                  <p style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>
                    {wps.map(m => m.nombre).join(' → ')}
                  </p>
                ) : (ruta.punto_inicio || ruta.punto_fin) && (
                  <p style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>
                    {[ruta.punto_inicio, ruta.punto_fin].filter(Boolean).join(' → ')}
                  </p>
                )}
                {ruta.distancia_km && (
                  <p style={{ fontSize: 11, color: '#0369a1', fontWeight: 600 }}>{ruta.distancia_km} km</p>
                )}
                {nov?.consumidor_nombre && (
                  <p style={{ fontSize: 11, marginTop: 4 }}>Hoy: <b>{nov.consumidor_nombre}</b></p>
                )}
                {cancelada   && <p style={{ fontSize: 11, color: '#ef4444', fontWeight: 600, marginTop: 2 }}>Cancelada hoy</p>}
                {!ruta.activa && <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Ruta inactiva</p>}
                {ruta.grupo  && <p style={{ fontSize: 11, color: '#7c3aed', marginTop: 2 }}>Grupo: {ruta.grupo}</p>}
              </div>
            );

            return (
              <React.Fragment key={ruta.id}>
                <Polyline positions={positions} color={color} weight={weight} opacity={opacity}>
                  <Popup>{popupContent}</Popup>
                </Polyline>

                {/* Marcadores de parada en waypoints (o inicio/fin) */}
                {positions.map((pos, idx) => {
                  const label = wps.length >= 2
                    ? wps[idx]?.nombre
                    : idx === 0 ? (ruta.punto_inicio || 'Inicio') : (ruta.punto_fin || 'Fin');
                  return (
                    <Marker key={idx} position={pos}>
                      <Popup>
                        <div style={{ fontSize: 12 }}>
                          <b>{label}</b><br />
                          <span style={{ color: '#94a3b8' }}>{ruta.nombre}</span>
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
              </React.Fragment>
            );
          })}

          {/* Trayectorias — violeta=hoy, índigo=histórico */}
          {Object.entries(tracks).map(([deviceId, track]) =>
            track.points.length > 1 && (
              <Polyline
                key={`track-${deviceId}`}
                positions={track.points}
                color={track.fecha === hoy ? '#7c3aed' : '#4338ca'}
                weight={4}
                opacity={0.85}
                dashArray="8 4"
              />
            )
          )}

          {/* Marcadores de posición GPS en vivo */}
          {posicionesFiltradas.map(pos => {
            const consumidor  = consumidores.find(c => Number(c.gps_device_id) === Number(pos.deviceId));
            const nombre      = consumidor?.nombre ?? `GPS #${pos.deviceId}`;
            const moving      = (pos.speed ?? 0) > 2;
            const ignicion    = pos.attributes?.ignition;
            const resumenHoy  = todaySummaries.find(s => Number(s.deviceId) === Number(pos.deviceId));
            const kmHoy       = resumenHoy != null ? metersToKm(resumenHoy.distance ?? 0) : null;

            return (
              <Marker
                key={pos.id ?? pos.deviceId}
                position={[pos.latitude, pos.longitude]}
                icon={makeVehicleIcon(moving)}
              >
                <Popup>
                  <div className="min-w-[160px] text-xs">
                    <p className="font-semibold text-sm mb-1">{nombre}</p>
                    {consumidor?.codigo_interno && (
                      <p style={{ color: '#64748b' }} className="mb-1">{consumidor.codigo_interno}</p>
                    )}
                    {consumidor?.tipo_consumidor_nombre && (
                      <p style={{ color: '#94a3b8' }} className="mb-1">{consumidor.tipo_consumidor_nombre}</p>
                    )}
                    {consumidor?.combustible_nombre && (
                      <p style={{ color: '#94a3b8' }} className="mb-1">{consumidor.combustible_nombre}</p>
                    )}
                    <hr style={{ margin: '4px 0', borderColor: '#e2e8f0' }} />
                    <p>Velocidad: <b>{Math.round(pos.speed ?? 0)} km/h</b></p>
                    {kmHoy != null && (
                      <p>Km hoy: <b style={{ color: '#0369a1' }}>{kmHoy} km</b></p>
                    )}
                    {ignicion != null && (
                      <p>Motor: <b style={{ color: ignicion ? '#16a34a' : '#ef4444' }}>
                        {ignicion ? 'encendido' : 'apagado'}
                      </b></p>
                    )}
                    <p style={{ color: '#94a3b8', marginTop: 4, fontFamily: 'monospace' }}>
                      {pos.latitude.toFixed(5)}, {pos.longitude.toFixed(5)}
                    </p>

                    {/* Selector de fecha */}
                    <div style={{ marginTop: 8 }}>
                      <input
                        type="date"
                        value={trackDates[pos.deviceId] ?? hoy}
                        max={hoy}
                        onChange={e => {
                          setTrackDates(prev => ({ ...prev, [pos.deviceId]: e.target.value }));
                          if (tracks[pos.deviceId]) clearTrack(pos.deviceId);
                        }}
                        style={{
                          width: '100%', fontSize: 11, padding: '4px 6px',
                          border: '1px solid #cbd5e1', borderRadius: 4,
                          color: '#1e293b', background: 'white',
                        }}
                      />
                    </div>

                    {/* Botón ver / ocultar recorrido */}
                    {(() => {
                      const fechaSel  = trackDates[pos.deviceId] ?? hoy;
                      const track     = tracks[pos.deviceId];
                      const esHoy     = fechaSel === hoy;
                      const label     = esHoy ? 'de hoy' : fechaSel;
                      return (
                        <button
                          onClick={() => track ? clearTrack(pos.deviceId) : fetchTrack(pos.deviceId, fechaSel)}
                          style={{
                            marginTop: 4, width: '100%', padding: '5px 8px',
                            background: track ? '#f5f3ff' : '#f0f9ff',
                            border: `1px solid ${track ? '#8b5cf6' : '#7dd3fc'}`,
                            borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600,
                            color: track ? '#6d28d9' : '#0369a1',
                          }}
                        >
                          {track?.loading
                            ? 'Cargando recorrido…'
                            : track
                              ? `Ocultar recorrido (${track.fecha === hoy ? 'hoy' : track.fecha})`
                              : `Ver recorrido ${label}`}
                        </button>
                      );
                    })()}

                    {/* Botón guardar — visible cuando el recorrido está cargado */}
                    {tracks[pos.deviceId] && !tracks[pos.deviceId].loading && tracks[pos.deviceId].points.length > 1 && (
                      <button
                        onClick={() => saveTrack(pos.deviceId, consumidor, tracks[pos.deviceId].points, tracks[pos.deviceId].fecha)}
                        disabled={savingTrack[pos.deviceId]}
                        style={{
                          marginTop: 4, width: '100%', padding: '5px 8px',
                          background: savingTrack[pos.deviceId] ? '#f1f5f9' : '#f0fdf4',
                          border: '1px solid #86efac',
                          borderRadius: 6, cursor: savingTrack[pos.deviceId] ? 'default' : 'pointer',
                          fontSize: 11, fontWeight: 600, color: '#15803d',
                        }}
                      >
                        {savingTrack[pos.deviceId]
                          ? 'Guardando…'
                          : `💾 Guardar recorrido${tracks[pos.deviceId].fecha === hoy ? ' de hoy' : ` del ${tracks[pos.deviceId].fecha}`}`}
                      </button>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>

      {/* Inspector de coordenadas */}
      {clickedCoord && (
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 rounded-lg px-3 py-2">
          <span className="shrink-0">Punto seleccionado:</span>
          <code className="font-mono font-semibold text-slate-700 dark:text-slate-200 select-all">
            {clickedCoord.lat.toFixed(6)},&nbsp;{clickedCoord.lng.toFixed(6)}
          </code>
          <span className="text-slate-400 hidden sm:inline">— Cópialo en el campo Lat / Lng del formulario de la ruta</span>
          <button
            className="ml-auto text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-base leading-none"
            onClick={() => setClickedCoord(null)}
          >×</button>
        </div>
      )}

      {/* Leyenda */}
      <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-5 h-1 rounded bg-sky-400"></span>Activa
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-5 h-1 rounded bg-red-400"></span>Cancelada hoy
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-5 h-1 rounded bg-slate-300"></span>Inactiva
        </span>
        {posicionesValidas.length > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3.5 h-3.5 rounded-full bg-green-600 border-2 border-white shadow"></span>
            {vehiculoFiltro ? `${posicionesFiltradas.length} de ${posicionesValidas.length}` : posicionesValidas.length} vehículo{posicionesValidas.length !== 1 ? 's' : ''} en vivo
            {updatedAt && <span className="text-slate-400">({updatedAt})</span>}
          </span>
        )}
        {Object.values(tracks).some(t => t.points?.length > 1 && t.fecha === hoy) && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-5 border-t-2 border-dashed" style={{ borderColor: '#7c3aed' }}></span>
            Recorrido de hoy
          </span>
        )}
        {Object.values(tracks).some(t => t.points?.length > 1 && t.fecha !== hoy) && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-5 border-t-2 border-dashed" style={{ borderColor: '#4338ca' }}></span>
            Recorrido histórico
          </span>
        )}
        {rutasSinCoords.length > 0 && (
          <span className="ml-auto text-amber-500">
            {rutasSinCoords.length} ruta{rutasSinCoords.length !== 1 ? 's' : ''} activa{rutasSinCoords.length !== 1 ? 's' : ''} sin coordenadas
          </span>
        )}
        {rutasConCoords.length === 0 && (
          <span className="ml-auto text-slate-400 italic">
            Agrega coordenadas a las rutas para visualizarlas aquí.
          </span>
        )}
      </div>
      <BackfillGpsDialog
        open={showBackfill}
        onClose={() => setShowBackfill(false)}
        vehiculos={consumidores}
      />
    </div>
  );
}
