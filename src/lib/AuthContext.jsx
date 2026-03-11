import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings, setAppPublicSettings] = useState(null);

  const checkAppState = useCallback(async () => {
    try {
      setAuthError(null);
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
      setAppPublicSettings({ id: 'local-app', public_settings: {} });
    } catch (error) {
      const message = error?.message || 'Error de autenticación';
      const isAuthRequired = message.includes('No hay sesión activa') || message.includes('expiró');
      setAuthError({ type: isAuthRequired ? 'auth_required' : 'unknown', message });
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoadingAuth(false);
      setIsLoadingPublicSettings(false);
    }
  }, []);

  useEffect(() => {
    checkAppState();
  }, [checkAppState]);

  useEffect(() => {
    const syncSession = () => {
      checkAppState();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncSession();
      }
    };

    window.addEventListener('focus', syncSession);
    document.addEventListener('visibilitychange', onVisibilityChange);

    const intervalId = window.setInterval(syncSession, 60_000);

    return () => {
      window.removeEventListener('focus', syncSession);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [checkAppState]);

  const signInWithPassword = async (credentials) => {
    await base44.auth.signInWithPassword(credentials);
    await checkAppState();
  };

  const signUpWithPassword = async (payload) => {
    const result = await base44.auth.signUpWithPassword(payload);
    if (result?.access_token || result?.session?.access_token) {
      await checkAppState();
    }
    return result;
  };

  const logout = async () => {
    setUser(null);
    setIsAuthenticated(false);
    await base44.auth.logout();
  };

  const navigateToLogin = (redirectTo) => {
    base44.auth.redirectToLogin(redirectTo);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoadingAuth,
        isLoadingPublicSettings,
        authError,
        appPublicSettings,
        isSupabaseEnabled: base44.auth.isSupabaseEnabled,
        isSupabaseMode: base44.auth.isSupabaseMode,
        supabaseConfigIssue: base44.auth.supabaseConfigIssue,
        signInWithPassword,
        signUpWithPassword,
        logout,
        navigateToLogin,
        checkAppState,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
