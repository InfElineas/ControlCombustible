import { useAuth } from '@/lib/AuthContext';

export function useUserRole() {
  const { user, isLoadingAuth } = useAuth();
  const isAdmin = user?.role === 'admin';
  return { user, isAdmin, loading: isLoadingAuth };
}
