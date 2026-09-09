import React, { useState } from 'react';
import { Smartphone, Download, X } from 'lucide-react';
import { esApp } from '@/lib/authNativa';

// Dirección del archivo de instalación. Se puede cambiar sin tocar el código con
// VITE_URL_APK; por omisión se busca en el propio dominio, que es lo que hay que
// subir al hosting junto al resto de la web.
export const URL_APK = import.meta.env.VITE_URL_APK || '/app/control-combustible.apk';

const CLAVE_DESCARTE = 'webcombustible-aviso-app-descartado';

const esAndroid = () => /android/i.test(navigator.userAgent);

const DESCRIPCION = 'Consulta los datos y registra bonificaciones y novedades de ruta aunque te quedes sin cobertura; se envían solas al recuperarla.';

/**
 * Invita a instalar la aplicación de Android.
 *
 * No aparece dentro de la propia aplicación, donde no tendría sentido, ni en un
 * iPhone, porque el archivo es de Android y allí no se puede instalar.
 *
 * variante "tarjeta" para la pantalla de inicio de sesión; "banner" para dentro,
 * donde se puede cerrar y no vuelve a molestar.
 */
export default function DescargarApp({ variante = 'tarjeta' }) {
  const [cerrado, setCerrado] = useState(() => {
    try { return localStorage.getItem(CLAVE_DESCARTE) === '1'; } catch { return false; }
  });

  const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (esApp() || esIOS) return null;

  const cerrar = () => {
    setCerrado(true);
    try { localStorage.setItem(CLAVE_DESCARTE, '1'); } catch { /* sin memoria: volverá a salir */ }
  };

  if (variante === 'banner') {
    if (cerrado) return null;
    return (
      <div className="bg-sky-50 dark:bg-sky-950/40 border-b border-sky-100 dark:border-sky-900 px-4 py-2.5">
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <Smartphone className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-sky-800 dark:text-sky-200">
              Hay aplicación para el móvil
            </p>
            <p className="text-[11px] text-sky-700/80 dark:text-sky-300/80 mt-0.5">
              {esAndroid()
                ? DESCRIPCION
                : `${DESCRIPCION} Ábrelo desde el teléfono para instalarla.`}
            </p>
          </div>
          <a
            href={URL_APK}
            download
            className="shrink-0 inline-flex items-center gap-1.5 px-3 h-8 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium"
          >
            <Download className="w-3.5 h-3.5" /> Descargar
          </a>
          <button
            type="button"
            onClick={cerrar}
            aria-label="No volver a mostrar"
            className="shrink-0 text-sky-400 hover:text-sky-600 dark:hover:text-sky-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-5 rounded-xl border border-sky-100 dark:border-sky-900 bg-sky-50/60 dark:bg-sky-950/30 px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-sky-100 dark:bg-sky-900/60 flex items-center justify-center shrink-0">
          <Smartphone className="w-4 h-4 text-sky-600 dark:text-sky-400" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            Aplicación para Android
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
            {DESCRIPCION}
          </p>
          <a
            href={URL_APK}
            download
            className="mt-2 inline-flex items-center gap-1.5 px-3 h-8 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium"
          >
            <Download className="w-3.5 h-3.5" /> Descargar
          </a>
          {esAndroid() && (
            <p className="text-[10px] text-slate-400 mt-2">
              Al abrir el archivo, Android pedirá permiso para instalar desde el navegador.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
