const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';

/**
 * Obtiene la geometría real por carretera entre una lista de puntos.
 * @param {Array<{lat: number, lng: number}>} waypoints
 * @returns {{ points: [number,number][], distanceKm: number }}
 */
export async function getRouteGeometry(waypoints) {
  if (!waypoints || waypoints.length < 2) return null;
  const coords = waypoints
    .map(p => `${Number(p.lng).toFixed(6)},${Number(p.lat).toFixed(6)}`)
    .join(';');
  const res = await fetch(
    `${OSRM_BASE}/${coords}?overview=full&geometries=geojson`,
  );
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  const json = await res.json();
  if (json.code !== 'Ok' || !json.routes?.[0]) throw new Error('Sin ruta disponible');
  const route = json.routes[0];
  return {
    points:     route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    distanceKm: Math.round(route.distance / 100) / 10,
  };
}
