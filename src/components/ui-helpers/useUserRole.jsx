import { useAuth } from '@/lib/AuthContext';

export function useUserRole() {
  const { user, isLoadingAuth } = useAuth();
  const isAdmin = ['admin', 'superadmin'].includes(user?.role);
  return { user, isAdmin, loading: isLoadingAuth };
}
