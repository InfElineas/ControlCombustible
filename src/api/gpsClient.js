import { supabase } from './supabaseClient';

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gps-proxy`;

async function gpsRequest(path) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('No hay sesión activa');

  const resp = await fetch(`${FUNCTION_URL}?path=${encodeURIComponent(path)}`, {
    headers: { 'Authorization': `Bearer ${session.access_token}` },
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error ?? `GPS error ${resp.status}`);
  }
  return resp.json();
}

// Convierte fecha local a string ISO UTC que acepta Traccar
function toTraccarDate(date) {
  return new Date(date).toISOString();
}

export const gpsApi = {
  // Lista todos los dispositivos registrados en Traccar
  devices: () =>
    gpsRequest('/devices'),

  // Posición actual de un dispositivo específico
  // Retorna array con un objeto { latitude, longitude, speed, course, attributes.totalDistance, ... }
  position: (deviceId) =>
    gpsRequest(`/positions?deviceId=${deviceId}`),

  // Todas las posiciones actuales (útil para el mapa)
  allPositions: () =>
    gpsRequest('/positions'),

  // Resumen de actividad en un período (km recorridos, horas motor, vel. máx)
  // from/to: Date o string ISO. Retorna array de objetos con { deviceId, distance, ... }
  summary: (deviceId, from, to) =>
    gpsRequest(
      `/reports/summary?deviceId=${deviceId}` +
      `&from=${encodeURIComponent(toTraccarDate(from))}` +
      `&to=${encodeURIComponent(toTraccarDate(to))}`,
    ),

  // Trayectoria completa punto a punto
  route: (deviceId, from, to) =>
    gpsRequest(
      `/reports/route?deviceId=${deviceId}` +
      `&from=${encodeURIComponent(toTraccarDate(from))}` +
      `&to=${encodeURIComponent(toTraccarDate(to))}`,
    ),

  // Resumen de varios dispositivos en un período (una sola llamada)
  // deviceIds: number[]  → Traccar acepta múltiples parámetros deviceId en la misma URL
  summaryMultiple: (deviceIds, from, to) => {
    const ids = deviceIds.map(id => `deviceId=${encodeURIComponent(id)}`).join('&');
    return gpsRequest(
      `/reports/summary?${ids}` +
      `&from=${encodeURIComponent(toTraccarDate(from))}` +
      `&to=${encodeURIComponent(toTraccarDate(to))}`,
    );
  },
};

// Convierte totalDistance (metros) a km, redondeado a 1 decimal
export function metersToKm(meters) {
  return Math.round(meters / 100) / 10;
}
