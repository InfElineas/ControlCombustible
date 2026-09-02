import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';

// Estado de conexión, tanto en el navegador como dentro de la APK.
//
// En Android el plugin de red de Capacitor es fiable; en el navegador solo
// existe navigator.onLine, que detecta la falta de interfaz de red pero no un
// portal cautivo ni un servidor caído. Sirve para avisar, no para dar por hecho
// que hay servicio.
export function useConexion() {
  const [online, setOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine !== false,
  );

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      let suscripcion;
      let vigente = true;
      (async () => {
        const { Network } = await import('@capacitor/network');
        const estado = await Network.getStatus();
        if (vigente) setOnline(estado.connected);
        suscripcion = await Network.addListener(
          'networkStatusChange', s => setOnline(s.connected),
        );
      })();
      return () => { vigente = false; suscripcion?.remove?.(); };
    }

    const conectar = () => setOnline(true);
    const desconectar = () => setOnline(false);
    window.addEventListener('online', conectar);
    window.addEventListener('offline', desconectar);
    return () => {
      window.removeEventListener('online', conectar);
      window.removeEventListener('offline', desconectar);
    };
  }, []);

  return online;
}
