import React, { useEffect, useState } from 'react';
import { ArrowDownToLine, Sparkles, X } from 'lucide-react';
import { esApp } from '@/lib/authNativa';
import { useVersionVigente } from '@/components/admin/PublicarApk';

const CLAVE_DESCARTADA = 'webcombustible-aviso-version-descartada';
// Lo que el usuario se descargó desde el navegador. Es lo único que la web sabe
// de lo que tiene instalado: dentro de la aplicación se pregunta al sistema.
export const CLAVE_DESCARGADA = 'webcombustible-apk-descargada';

const leer = clave => { try { return localStorage.getItem(clave); } catch { return null; } };
const guardar = (clave, valor) => { try { localStorage.setItem(clave, valor); } catch { /* sin memoria: volverá a salir */ } };

/** Deja constancia de la versión que se acaba de descargar desde la web. */
export function recordarDescarga(version) {
  if (version) guardar(CLAVE_DESCARGADA, String(version));
}

// "1.10" es posterior a "1.9", así que no vale comparar como texto.
function compararVersiones(a, b) {
  const partes = v => String(v ?? '').split(/[^\d]+/).filter(Boolean).map(Number);
  const x = partes(a), y = partes(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Qué versión de la aplicación tiene delante quien mira.
 *
 * Dentro de la aplicación lo dice Android. En el navegador no hay forma de
 * saberlo, así que se recuerda la última que se descargó desde aquí; a quien
 * nunca haya descargado ninguna no se le avisa de actualizaciones, se le ofrece
 * la aplicación con el aviso de descarga de siempre.
 */
export function useVersionInstalada() {
  const [instalada, setInstalada] = useState(() =>
    esApp() ? undefined : (leer(CLAVE_DESCARGADA) ? { version: leer(CLAVE_DESCARGADA) } : null));

  useEffect(() => {
    if (!esApp()) return;
    let vigente = true;
    (async () => {
      try {
        const { App } = await import('@capacitor/app');
        const info = await App.getInfo();
        if (vigente) setInstalada({ version: info?.version, codigo: Number(info?.build) || null });
      } catch {
        // Alguna plataforma no lo expone: sin dato no se puede comparar, y es
        // preferible callar que avisar de una actualización que quizá ya tiene.
        if (vigente) setInstalada(null);
      }
    })();
    return () => { vigente = false; };
  }, []);

  return instalada;
}

/**
 * Aviso flotante de versión nueva, en el móvil y dentro de la aplicación.
 *
 * No sale en el escritorio: el archivo es de Android y allí no se instala.
 */
export default function AvisoActualizacion() {
  const { data: publicada } = useVersionVigente();
  const instalada = useVersionInstalada();
  const [descartada, setDescartada] = useState(() => leer(CLAVE_DESCARTADA));
  const [abriendo, setAbriendo] = useState(false);

  const enApp = esApp();
  const esAndroid = /android/i.test(navigator.userAgent);
  // undefined mientras Android responde: sin ese dato no hay comparación válida.
  if (instalada === undefined) return null;
  if (!enApp && !esAndroid) return null;
  if (!publicada?.version || !instalada?.version) return null;
  if (descartada === publicada.version) return null;

  // Basta con que uno de los dos números sea mayor. El versionCode se teclea a
  // mano al publicar y puede no cuadrar con el del archivo; si mandara él solo,
  // un número mal puesto dejaría a todo el mundo sin enterarse de la versión.
  const codigoPublicado = publicada.version_code ?? null;
  const hayNueva =
    compararVersiones(publicada.version, instalada.version) > 0 ||
    (codigoPublicado != null && instalada.codigo != null && codigoPublicado > instalada.codigo);
  if (!hayNueva) return null;

  const notas = (publicada.notas || '')
    // Las notas se pegan del resumen de la versión, con viñeta ya puesta.
    .split(/\r?\n/).map(l => l.trim().replace(/^[·•\-*]\s*/, '')).filter(Boolean);

  const cerrar = () => { setDescartada(publicada.version); guardar(CLAVE_DESCARTADA, publicada.version); };

  const actualizar = async (e) => {
    recordarDescarga(publicada.version);
    if (!enApp) return;               // en el navegador basta el enlace
    // El WebView no descarga por su cuenta: se abre fuera, donde Android toma
    // el archivo con su gestor de descargas y ofrece instalarlo.
    e.preventDefault();
    setAbriendo(true);
    try {
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url: publicada.archivo_url });
    } catch {
      window.open(publicada.archivo_url, '_blank');
    }
    setAbriendo(false);
  };

  return (
    <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+9rem)] lg:inset-x-auto lg:right-5 lg:bottom-20 lg:w-80 z-50">
      <div className="rounded-2xl border border-sky-200 dark:border-sky-900 bg-white dark:bg-slate-900 shadow-xl p-3.5">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-sky-100 dark:bg-sky-900/60 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-sky-600 dark:text-sky-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Versión {publicada.version} disponible
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Tienes la {instalada.version}.
            </p>
            {notas.length > 0 && (
              <ul className="mt-2 space-y-0.5">
                {notas.slice(0, 3).map((linea, i) => (
                  <li key={i} className="text-[11px] text-slate-600 dark:text-slate-300 flex gap-1.5">
                    <span className="text-slate-300 shrink-0">·</span>
                    <span className="min-w-0">{linea}</span>
                  </li>
                ))}
              </ul>
            )}
            <a
              href={publicada.archivo_url}
              download
              onClick={actualizar}
              className="mt-2.5 inline-flex items-center gap-1.5 px-3 h-9 rounded-lg bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white text-xs font-medium"
            >
              <ArrowDownToLine className="w-3.5 h-3.5" />
              {abriendo ? 'Abriendo…' : 'Actualizar'}
            </a>
            <p className="text-[10px] text-slate-400 mt-1.5">
              Se instala encima: no pierdes nada de lo que tengas guardado.
            </p>
          </div>
          <button
            type="button"
            onClick={cerrar}
            aria-label="Ahora no"
            className="shrink-0 text-slate-300 hover:text-slate-500 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
