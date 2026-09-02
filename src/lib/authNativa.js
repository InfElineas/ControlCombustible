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

// Escucha la vuelta del navegador y termina de iniciar la sesion.
//
// Devuelve una funcion para dejar de escuchar. Solo hace algo dentro de la
// aplicacion: en la web el propio Supabase resuelve la vuelta al recargar.
export function escucharVueltaDeLogin(alEntrar) {
  if (!esApp()) return () => {};

  let suscripcion;
  let vigente = true;

  (async () => {
    const { App } = await import('@capacitor/app');
    suscripcion = await App.addListener('appUrlOpen', async ({ url }) => {
      if (!url || !url.startsWith(ENLACE_VUELTA)) return;

      try {
        // El navegador vuelve con un codigo de un solo uso que se canjea por la
        // sesion. Es el flujo PKCE, el que Supabase usa por omision.
        const query = url.includes('?') ? url.split('?')[1] : '';
        const code = new URLSearchParams(query).get('code');
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }
      } catch (e) {
        console.error('[login] no se pudo completar la sesion:', e?.message ?? e);
      } finally {
        // Se cierra la ventana del navegador en cualquier caso: dejarla abierta
        // sobre la aplicacion desconcierta mas que el propio fallo.
        try {
          const { Browser } = await import('@capacitor/browser');
          await Browser.close();
        } catch { /* en algunos dispositivos ya viene cerrada */ }
        if (vigente) alEntrar?.();
      }
    });
  })();

  return () => { vigente = false; suscripcion?.remove?.(); };
}
