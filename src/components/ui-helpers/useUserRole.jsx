import { useMemo } from 'react';

export function useUserRole() {
  const user = useMemo(() => {
    const role = localStorage.getItem('user_role') || 'admin';
    return { id: 'local-user', role };
  }, []);

  const isAdmin = user.role === 'admin';
  return { user, isAdmin, loading: false };
}
