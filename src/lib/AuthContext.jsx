import React, { createContext, useState, useContext, useEffect } from 'react';
import { authClient } from '@/api/authClient';
import { queryClientInstance } from '@/lib/query-client';
import { limpiarCachePersistida } from '@/lib/query-persist';
import { limpiarCola } from '@/lib/colaEscritura';
import { olvidarRolConocido, ESPERA_MAXIMA_MS } from '@/components/ui-helpers/useUserRole';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [usuario, setUsuario]             = useState(() => authClient.usuarioActual());
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [sesionOffline, setSesionOffline] = useState(false);

  useEffect(() => {
    let vivo = true;

    // Al cerrar sesión hay que borrar la caché guardada en el dispositivo:
    // contiene datos de operación y quien entre después no debe verlos. Se hace
    // aquí, sobre el evento, porque el cierre de sesión se dispara desde varios
    // sitios de la interfaz y así queda cubierto en todos. También ocurre si el
    // servidor de identidad da la sesión por muerta.
    const baja = authClient.suscribir((evento) => {
      if (!vivo) return;
      if (evento === 'SIGNED_OUT') {
        limpiarCachePersistida().catch(() => {});
        limpiarCola().catch(() => {});
        queryClientInstance.clear();
        olvidarRolConocido();
        setUsuario(null);
        setSesionOffline(false);
        setIsLoadingAuth(false);
      } else if (evento === 'SIGNED_IN') {
        setUsuario(authClient.usuarioActual());
        setSesionOffline(false);
        setIsLoadingAuth(false);
      } else if (evento === 'TOKEN_REFRESHED') {
        // Se pudo renovar: la sesión está validada, ya no es solo la guardada.
        setSesionOffline(false);
      }
    });

    // Arranque. Sin sesión guardada no hay nada que validar. Con ella se intenta
    // renovar el token; si no hay red (o tarda más del plazo) se entra con lo
    // guardado en modo sin conexión y, si la respuesta llega después, el estado
    // se corrige solo. Solo se expulsa al usuario si el servidor de identidad
    // dice que la sesión ya no vale.
    (async () => {
      if (!authClient.haySesionGuardada()) {
        if (vivo) setIsLoadingAuth(false);
        return;
      }
      const renovacion = authClient.obtenerToken().then(() => 'ok', (e) => e);
      const plazo = new Promise(r => setTimeout(() => r('plazo'), ESPERA_MAXIMA_MS));
      const primero = await Promise.race([renovacion, plazo]);
      if (!vivo) return;

      if (primero === 'ok') {
        setUsuario(authClient.usuarioActual());
        setSesionOffline(false);
      } else if (primero?.rechazada) {
        // El cliente ya emitió SIGNED_OUT y limpió todo.
      } else {
        setUsuario(authClient.usuarioActual());
        setSesionOffline(true);
        // Si la respuesta llega después del plazo, se corrige sola.
        renovacion.then((r) => { if (vivo && r === 'ok') setSesionOffline(false); });
      }
      setIsLoadingAuth(false);
    })();

    return () => { vivo = false; baja(); };
  }, []);

  const navigateToLogin = () => {
    window.location.href = '/Login';
  };

  const logout = async () => {
    await authClient.cerrarSesion();
    window.location.href = '/Login';
  };

  // Una sesión guardada que no se ha podido renovar sigue dando acceso a la
  // aplicación en modo solo lectura de lo ya descargado, más la cola de escritura
  // pendiente: la pasarela rechaza cualquier escritura sin un token válido, así
  // que no hay nada que ganar cerrando la puerta aquí.
  const isAuthenticated = !!usuario;
  // isLoadingPublicSettings ya no aplica; se expone como false para
  // mantener compatibilidad con el App.jsx original.
  const isLoadingPublicSettings = false;
  const authError = null;

  return (
    <AuthContext.Provider value={{
      user: usuario,
      session: usuario ? { user: usuario } : null,
      isAuthenticated,
      sesionOffline,
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      logout,
      navigateToLogin,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
