import React, { useEffect, useRef } from 'react';

/**
 * Captcha de Cloudflare Turnstile para el login. elineas-auth lo exige en
 * POST /api/auth/sign-in (cabecera X-Turnstile-Token). Es público: solo lleva la
 * *site key* (VITE_TURNSTILE_SITE_KEY). La clave de servicio del IS NO se usa aquí:
 * es para backends y en el navegador quedaría a la vista de cualquiera.
 *
 * Sin site key no se dibuja nada (el IS tampoco debe exigir captcha en local).
 */
export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';
export const TURNSTILE_ACTIVO = !!TURNSTILE_SITE_KEY;

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let cargando = null;
function cargarScript() {
  if (window.turnstile) return Promise.resolve();
  cargando ??= new Promise((ok, fallo) => {
    const s = document.createElement('script');
    s.src = SCRIPT; s.async = true;
    s.onload = ok;
    s.onerror = () => { cargando = null; fallo(new Error('No se pudo cargar la verificación de seguridad.')); };
    document.head.appendChild(s);
  });
  return cargando;
}

/** @param {{ onToken: (t: string|null) => void }} props */
export default function Turnstile({ onToken }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!TURNSTILE_ACTIVO) return undefined;
    let id = null;
    let vivo = true;
    cargarScript().then(() => {
      if (!vivo || !ref.current) return;
      id = window.turnstile.render(ref.current, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: (t) => onToken(t),
        'expired-callback': () => onToken(null),
        'error-callback': () => onToken(null),
      });
    }).catch(() => onToken(null));
    return () => { vivo = false; try { if (id != null) window.turnstile?.remove(id); } catch { /* ya no está */ } };
  }, []);
  return TURNSTILE_ACTIVO ? <div ref={ref} className="flex justify-center" /> : null;
}
