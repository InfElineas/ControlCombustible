import { Capacitor } from '@capacitor/core';
import { supabase } from '@/api/supabaseClient';

// Direccion propia de la aplicacion por la que el navegador devuelve el control
// tras autenticar. Tiene que coincidir con el intent-filter de
// AndroidManifest.xml y estar autorizada en Supabase, en
// Authentication > URL Configuration > Redirect URLs.
export const ENLACE_VUELTA = 'com.mercadoelineas.combustible://login';

export const esApp = () => Capacitor.isNativePlatform();

// Inicio de sesion con Google.
//
// Dentro de la aplicacion no se puede usar el flujo normal del navegador:
// Google rechaza OAuth en WebViews desde 2021, asi que Supabase acababa
// abriendo el navegador del sistema y la sesion se iniciaba alli en lugar de en
// la aplicacion. Aqui se abre el navegador a proposito, pero indicandole que al
// terminar vuelva a la aplicacion por ENLACE_VUELTA; la sesion se completa
// entonces dentro con el codigo que trae de vuelta.
export async function entrarConGoogle() {
  if (!esApp()) {
    // En la web el comportamiento de siempre: redirige y vuelve al origen.
    return supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/' },
    });
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: ENLACE_VUELTA,
      // Sin esto el WebView intentaria navegar el mismo a Google y volveriamos
      // al problema original.
      skipBrowserRedirect: true,
    },
  });
  if (error) return { error };

  const { Browser } = await import('@capacitor/browser');
  await Browser.open({ url: data.url, presentationStyle: 'popover' });
  return { error: null };
}

// Convierte la direccion de vuelta en una sesion abierta.
//
// Devuelve { ok: true } o { ok: false, motivo } con el fallo concreto: un
// mensaje generico obliga a adivinar y aqui hay tres causas muy distintas
// (el proveedor rechazo, la vuelta no trajo credenciales, o el canje fallo).
async function abrirSesionDesde(url) {
  // Las credenciales pueden venir en la consulta como un codigo de un solo uso
  // (flujo PKCE) o en el fragmento como los tokens ya emitidos (flujo
  // implicito, que es el que supabase-js usa por omision). Se leen las dos
  // formas para no depender de la configuracion del cliente.
  const [antesDelFragmento, fragmento = ''] = url.split('#');
  const consulta = antesDelFragmento.includes('?') ? antesDelFragmento.split('?')[1] : '';
  const enConsulta = new URLSearchParams(consulta);
  const enFragmento = new URLSearchParams(fragmento);
  const dato = clave => enConsulta.get(clave) || enFragmento.get(clave);

  const fallo = dato('error_description') || dato('error');
  if (fallo) return { ok: false, motivo: decodeURIComponent(fallo.replace(/\+/g, ' ')) };

  const codigo = dato('code');
  if (codigo) {
    const { error } = await supabase.auth.exchangeCodeForSession(codigo);
    if (error) return { ok: false, motivo: `No se pudo canjear el código: ${error.message}` };
    return { ok: true };
  }

  const acceso = dato('access_token');
  const refresco = dato('refresh_token');
  if (acceso && refresco) {
    const { error } = await supabase.auth.setSession({ access_token: acceso, refresh_token: refresco });
    if (error) return { ok: false, motivo: `No se pudo abrir la sesión: ${error.message}` };
    return { ok: true };
  }

  return { ok: false, motivo: 'La vuelta del navegador no trajo credenciales.' };
}

// Escucha la vuelta del navegador y termina de iniciar la sesion.
//
// Devuelve una funcion para dejar de escuchar. Solo hace algo dentro de la
// aplicacion: en la web el propio Supabase resuelve la vuelta al recargar.
// alTerminar recibe el resultado de abrirSesionDesde.
export function escucharVueltaDeLogin(alTerminar) {
  if (!esApp()) return () => {};

  let suscripcion;
  let vigente = true;
  const yaVistas = new Set();

  const manejar = async (url) => {
    if (!url || !url.startsWith(ENLACE_VUELTA) || yaVistas.has(url)) return;
    // El codigo es de un solo uso: si Android entrega el mismo enlace dos veces
    // (arranque en frio mas evento), el segundo canje fallaria sin motivo real.
    yaVistas.add(url);

    let resultado;
    try {
      resultado = await abrirSesionDesde(url);
    } catch (e) {
      resultado = { ok: false, motivo: e?.message ?? String(e) };
    }
    if (!resultado.ok) console.error('[login] vuelta fallida:', resultado.motivo, url);

    // Se cierra la ventana del navegador en cualquier caso: dejarla abierta
    // sobre la aplicacion desconcierta mas que el propio fallo.
    try {
      const { Browser } = await import('@capacitor/browser');
      await Browser.close();
    } catch { /* en algunos dispositivos ya viene cerrada */ }

    if (vigente) alTerminar?.(resultado);
  };

  (async () => {
    const { App } = await import('@capacitor/app');
    suscripcion = await App.addListener('appUrlOpen', ({ url }) => manejar(url));

    // Si Android mato el proceso mientras el navegador estaba delante, la
    // aplicacion arranca ya con el enlace y el evento anterior nunca llega.
    try {
      const lanzamiento = await App.getLaunchUrl();
      if (lanzamiento?.url) await manejar(lanzamiento.url);
    } catch { /* no todas las plataformas exponen la direccion de arranque */ }
  })();

  return () => { vigente = false; suscripcion?.remove?.(); };
}
