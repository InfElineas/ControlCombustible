import React, { createContext, useState, useContext, useEffect } from 'react';
import { supabase } from '@/api/supabaseClient';
import { queryClientInstance } from '@/lib/query-client';
import { limpiarCachePersistida } from '@/lib/query-persist';
import { olvidarRolConocido } from '@/components/ui-helpers/useUserRole';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [session, setSession]             = useState(undefined); // undefined = loading
  const [user, setUser]                   = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  useEffect(() => {
    // Obtener sesión inicial
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
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
      setIsLoadingAuth(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const navigateToLogin = () => {
    window.location.href = '/Login';
  };

  const logout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/Login';
  };

  const isAuthenticated = !!session;
  // isLoadingPublicSettings ya no aplica; se expone como false para
  // mantener compatibilidad con el App.jsx original.
  const isLoadingPublicSettings = false;
  const authError = null;

  return (
    <AuthContext.Provider value={{
      user,
      session,
      isAuthenticated,
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
