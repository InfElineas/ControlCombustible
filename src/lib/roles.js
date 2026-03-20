export const USER_ROLES = ['superadmin', 'gestor', 'auditor'];

export function normalizeRole(role) {
  return USER_ROLES.includes(role) ? role : 'auditor';
}

export function canManageData(role) {
  return ['superadmin', 'gestor'].includes(normalizeRole(role));
}

export function canManageUsers(role) {
  return normalizeRole(role) === 'superadmin';
}

const PAGE_ROLE_ACCESS = {
  Dashboard: USER_ROLES,
  Movimientos: USER_ROLES,
  Tarjetas: ['superadmin', 'gestor'],
  Vehiculos: ['superadmin', 'gestor'],
  Combustibles: ['superadmin', 'gestor'],
  Precios: ['superadmin', 'gestor'],
  Reportes: USER_ROLES,
};

export function canAccessPage(role, pageName) {
  const normalizedRole = normalizeRole(role);
  const allowedRoles = PAGE_ROLE_ACCESS[pageName];
  return Array.isArray(allowedRoles) ? allowedRoles.includes(normalizedRole) : true;
}
