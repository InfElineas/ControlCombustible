import React, { createContext, useContext, useMemo, useState } from 'react';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState({ id: 'local-user', role: localStorage.getItem('user_role') || 'admin' });

  const value = useMemo(() => ({
    user,
    isAuthenticated: true,
    isLoadingAuth: false,
    isLoadingPublicSettings: false,
    authError: null,
    appPublicSettings: null,
    logout: () => {
      localStorage.removeItem('user_role');
      setUser({ id: 'local-user', role: 'admin' });
    },
    navigateToLogin: () => {},
    checkAppState: async () => {},
  }), [user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
