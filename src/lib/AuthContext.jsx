import React, { createContext, useState, useContext, useEffect } from 'react';
import { supabase } from '@/api/supabaseClient';
import { queryClientInstance } from '@/lib/query-client';
import { limpiarCachePersistida } from '@/lib/query-persist';
import { olvidarRolConocido, hayCredencialGuardada, ESPERA_MAXIMA_MS } from '@/components/ui-helpers/useUserRole';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [session, setSession]             = useState(undefined); // undefined = loading
  const [user, setUser]                   = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [sesionOffline, setSesionOffline] = useState(false);

  useEffect(() => {
    let resuelta = false;

    // Sin red, getSession() no responde hasta que auth-js agota sus reintentos
    // de refresco: medido, más de treinta segundos con la aplicación en blanco.
    // Pasado el plazo se entra con la credencial guardada y, si la respuesta
    // llega después, el estado se corrige solo.
    const plazo = setTimeout(() => {
      if (resuelta) return;
      if (hayCredencialGuardada()) {
        setSesionOffline(true);
        setIsLoadingAuth(false);
      }
    }, ESPERA_MAXIMA_MS);

    // Obtener sesión inicial
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      resuelta = true;
      clearTimeout(plazo);
      setSession(s);
      setUser(s?.user ?? null);
      // getSession() devuelve null en cuanto el token de acceso caduca —dura una
      // hora— y no hay red para refrescarlo, aunque la sesión siga guardada en
      // el dispositivo. Sin esta comprobación la aplicación se quedaba en la
      // pantalla de inicio de sesión, que sin conexión no lleva a ninguna parte,
      // y los datos ya descargados eran inalcanzables.
      setSesionOffline(!s && hayCredencialGuardada());
      setIsLoadingAuth(false);
    });

    // Escuchar cambios de sesión (login / logout / token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      // Al cerrar sesión hay que borrar la caché guardada en el dispositivo:
      // contiene datos de operación y quien entre después no debe verlos. Se
      // hace aquí, sobre el evento, porque el cierre de sesión se dispara desde
      // varios sitios de la interfaz y así queda cubierto en todos.
      if (event === 'SIGNED_OUT') {
        limpiarCachePersistida().catch(() => {});
        queryClientInstance.clear();
        olvidarRolConocido();
      }
      setSession(s);
      setUser(s?.user ?? null);
      setSesionOffline(event !== 'SIGNED_OUT' && !s && hayCredencialGuardada());
      setIsLoadingAuth(false);
    });

    return () => {
      clearTimeout(plazo);
      subscription.unsubscribe();
    };
  }, []);

  const navigateToLogin = () => {
    window.location.href = '/Login';
  };

  const logout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/Login';
  };

  // Una sesión guardada que no se ha podido refrescar sigue dando acceso a la
  // aplicación en modo solo lectura: el servidor rechaza cualquier escritura por
  // su cuenta, así que no hay nada que ganar cerrando la puerta aquí.
  const isAuthenticated = !!session || sesionOffline;
  // isLoadingPublicSettings ya no aplica; se expone como false para
  // mantener compatibilidad con el App.jsx original.
  const isLoadingPublicSettings = false;
  const authError = null;

  return (
    <AuthContext.Provider value={{
      user,
      session,
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
