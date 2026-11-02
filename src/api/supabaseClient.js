import { createClient } from '@supabase/supabase-js';
import { getAccessToken } from './authClient';

// Los datos NO se piden a Supabase: se piden a la pasarela (combustible-gateway),
// que valida el JWT de elineas-auth, aplica los permisos del IS y reenvía a
// Supabase con la service_role. supabase-js se sigue usando solo como constructor
// de consultas (.from().select()…), por eso ninguna página cambia.
//
// Con la opción `accessToken` el cliente no gestiona sesión propia: supabase.auth
// deja de existir y cualquier uso que quede lanza un error en vez de fallar en
// silencio.
const API_URL = import.meta.env.VITE_API_URL;

if (!API_URL) {
  console.error('Falta la variable VITE_API_URL (URL de la pasarela).');
}

// supabase-js exige una clave; la pasarela no la usa. Sin sesión, la librería
// enviaría `Bearer <clave>`, que la pasarela rechazaría con 401 incluso en las
// rutas públicas (p. ej. la versión de la APK), así que esa cabecera se quita.
const CLAVE_NULA = 'sin-sesion';

function sinCredencialNula(input, init = {}) {
  const cabeceras = new Headers(init.headers);
  if (cabeceras.get('authorization') === `Bearer ${CLAVE_NULA}`) cabeceras.delete('authorization');
  return fetch(input, { ...init, headers: cabeceras });
}

// Si no se puede obtener un token, el error sale de la petición como un fallo de
// red normal. Así todo lo que ya distingue «sin conexión» de «rechazado» (la cola
// de escritura, los formularios) sigue funcionando sin saber nada de la
// autenticación: un registro hecho sin conexión se queda en espera, no se pierde.
async function tokenParaPeticion() {
  try {
    return (await getAccessToken()) ?? null;
  } catch (e) {
    if (e?.rechazada) throw new Error('JWT: la sesión ya no es válida');
    throw new TypeError(`Failed to fetch: no se pudo renovar la sesión (${e?.codigo ?? 'sin conexión'})`);
  }
}

export const supabase = createClient(API_URL ?? 'http://invalid.local', CLAVE_NULA, {
  accessToken: tokenParaPeticion,
  global: { fetch: sinCredencialNula },
});
