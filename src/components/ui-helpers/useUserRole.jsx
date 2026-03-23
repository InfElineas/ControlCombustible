import { useAuth } from '@/lib/AuthContext';
import { canManageData, canManageUsers, normalizeRole } from '@/lib/roles';

export function useUserRole() {
  const { user, isLoadingAuth } = useAuth();
  const role = normalizeRole(user?.role);
  return {
    user,
    role,
    canEdit: canManageData(role),
    canManageUsers: canManageUsers(role),
    loading: isLoadingAuth,
  };
}
