import { Capacitor } from '@capacitor/core';
import { authClient } from '@/api/authClient';

export const esApp = () => Capacitor.isNativePlatform();

// Dirección a la que el servidor de identidad devuelve el control tras Google.
//
//   · Web:  la propia pantalla de login, que recoge ?code=…&state=….
//   · App:  tiene que ser una dirección https que Android abra en la aplicación
//           (Android App Link verificado). elineas-auth solo admite como destino
//           orígenes https (o localhost), así que ya no vale el enlace propio
//           `com.mercadoelineas.combustible://login` que usaba Supabase. Se
//           configura con VITE_NATIVE_REDIRECT y exige el intent-filter con
//           autoVerify en AndroidManifest.xml y su assetlinks.json en el servidor.
const redirectWeb = () => `${window.location.origin}/Login`;
const redirectApp = () => import.meta.env.VITE_NATIVE_REDIRECT || '';

// Mensajes para los códigos con los que elineas-auth rechaza el acceso.
export function motivoDeError(codigo) {
  switch (codigo) {
    case 'ACCOUNT_NOT_FOUND':
      return 'No hay ninguna cuenta con ese correo de Google. Pide a un administrador que te dé de alta.';
    case 'NO_ROLES_IN_SYSTEM':
      return 'Tu cuenta existe, pero todavía no tiene acceso a esta aplicación.';
    case 'GOOGLE_ACCESS_DENIED':
      return 'Cancelaste el acceso con Google.';
    case 'FLUJO_CADUCADO':
    case 'STATE_INVALIDO':
      return 'El inicio de sesión caducó o no es válido. Vuelve a intentarlo.';
    case 'SIN_RED':
      return 'No hay conexión. El inicio de sesión necesita red.';
    case 'SYSTEM_NOT_FOUND':
      return 'La aplicación no está dada de alta en el servidor de identidad.';
    default:
      return 'No se pudo completar el inicio de sesión. Inténtalo de nuevo.';
  }
}

// Inicio de sesión con Google.
//
// Dentro de la aplicación no se puede navegar el propio WebView hacia Google:
// Google rechaza OAuth en WebViews. Se abre el navegador del sistema y se vuelve
// por la dirección de la aplicación.
export async function entrarConGoogle() {
  try {
    if (!esApp()) {
      window.location.assign(await authClient.urlGoogle(redirectWeb()));
      return { error: null };
    }
    const destino = redirectApp();
    if (!destino) {
      return { error: new Error('Falta VITE_NATIVE_REDIRECT: sin ella la app no puede recibir la vuelta de Google.') };
    }
    const url = await authClient.urlGoogle(destino);
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url, presentationStyle: 'popover' });
    return { error: null };
  } catch (e) {
    return { error: new Error(motivoDeError(e?.codigo)) };
  }
}

// En la web: si la dirección actual es la vuelta de Google, termina la sesión.
// Devuelve null si no lo es; si lo es, { ok: true } o { ok: false, motivo }.
export async function terminarGoogleEnLaWeb() {
  if (esApp()) return null;
  const consulta = new URLSearchParams(window.location.search);
  if (!consulta.has('code') && !consulta.has('error')) return null;
  const direccion = window.location.href;
  // Se limpia la dirección en cuanto se lee: el código es de un solo uso.
  window.history.replaceState(null, '', window.location.pathname);
  try {
    await authClient.completarGoogle(direccion);
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: motivoDeError(e?.codigo) };
  }
}

// Escucha la vuelta del navegador en la aplicación y termina de iniciar la
// sesión. Devuelve una función para dejar de escuchar. En la web no hace nada.
export function escucharVueltaDeLogin(alTerminar) {
  if (!esApp()) return () => {};

  let suscripcion;
  let vigente = true;
  const yaVistas = new Set();

  const manejar = async (url) => {
    const destino = redirectApp();
    if (!url || !destino || !url.startsWith(destino) || yaVistas.has(url)) return;
    // El código es de un solo uso: si Android entrega el mismo enlace dos veces
    // (arranque en frío más evento), el segundo canje fallaría sin motivo real.
    yaVistas.add(url);

    let resultado;
    try {
      await authClient.completarGoogle(url);
      resultado = { ok: true };
    } catch (e) {
      console.error('[login] vuelta fallida:', e?.codigo, e?.message);
      resultado = { ok: false, motivo: motivoDeError(e?.codigo) };
    }

    // Se cierra la ventana del navegador en cualquier caso: dejarla abierta
    // sobre la aplicación desconcierta más que el propio fallo.
    try {
      const { Browser } = await import('@capacitor/browser');
      await Browser.close();
    } catch { /* en algunos dispositivos ya viene cerrada */ }

    if (vigente) alTerminar?.(resultado);
  };

  (async () => {
    const { App } = await import('@capacitor/app');
    suscripcion = await App.addListener('appUrlOpen', ({ url }) => manejar(url));

    // Si Android mató el proceso mientras el navegador estaba delante, la
    // aplicación arranca ya con el enlace y el evento anterior nunca llega.
    try {
      const lanzamiento = await App.getLaunchUrl();
      if (lanzamiento?.url) await manejar(lanzamiento.url);
    } catch { /* no todas las plataformas exponen la dirección de arranque */ }
  })();

  return () => { vigente = false; suscripcion?.remove?.(); };
}
