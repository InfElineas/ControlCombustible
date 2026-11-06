// Administración delegada del sistema `combustible` en elineas-auth.
// Todas las llamadas usan la sesión del admin; el IS acota cada una a su sistema.
import { authClient } from '@/api/authClient';

const SLUG = import.meta.env?.VITE_SYSTEM_SLUG || 'combustible';
const q = (o) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};
const SLUG_TRANSFER = import.meta.env?.VITE_TRANSFER_SLUG || 'transferencias';
const api = (ruta, metodo, cuerpo) => authClient.administrar(ruta, { metodo, cuerpo });

/** Sistema `combustible` entre los que administra el usuario. */
export async function sistemaPropio() {
  const { systems = [] } = await api('/api/systems/managed');
  const s = systems.find((x) => x.slug === SLUG);
  if (!s) throw new Error('No administras el sistema ' + SLUG + ' en elineas-auth.');
  return s;
}

/**
 * Sistema `transferencias` (elineas-transferencia) si el usuario también lo administra en el IS;
 * `null` si no: entonces la interfaz simplemente no ofrece asignar sus roles.
 */
export async function sistemaTransferencias() {
  const { systems = [] } = await api('/api/systems/managed');
  return systems.find((x) => x.slug === SLUG_TRANSFER) ?? null;
}

// ── Usuarios ────────────────────────────────────────────────────────────────
export const listarUsuarios = (systemId, search) =>
  api(`/api/users/admin/managed${q({ systemId, search, limit: 100 })}`).then((r) => r.users ?? []);

export const editarUsuario = (id, datos) => api(`/api/users/admin/managed/${id}`, 'PATCH', datos);
export const reenviarInvitacion = (id) => api(`/api/users/admin/managed/${id}/invite`, 'POST');
export const fijarContrasena = (id, newPassword, currentPassword) =>
  api(`/api/users/admin/managed/${id}/change-password`, 'POST', { newPassword, currentPassword, revokeSessions: true });

/** Invita a un usuario (sin contraseña: recibe un enlace para fijarla) y le da el rol. */
export async function invitarUsuario({ name, email, roleId, transferRoleId }) {
  const r = await api('/api/auth/sign-up', 'POST', { name, email, systemSlug: SLUG });
  const userId = r?.user?.id;
  if (!userId) throw new Error('El IS no devolvió el usuario creado.');
  await api('/api/user-roles', 'POST', { userId, roleId });
  if (transferRoleId) await api('/api/user-roles', 'POST', { userId, roleId: transferRoleId });
  return userId;
}

// ── Roles de un usuario ─────────────────────────────────────────────────────
/**
 * Deja al usuario con un único rol en el sistema (añade el nuevo y retira los demás).
 * Con `roleId` vacío le retira todos los roles del sistema (sin acceso).
 */
export async function cambiarRol(userId, systemId, roleId) {
  const { userRoles = [] } = await api(`/api/user-roles${q({ userId, systemId, limit: 100 })}`);
  const actuales = userRoles.filter((ur) => ur.system?.id === systemId || !ur.system);
  if (roleId && !actuales.some((ur) => ur.roleId === roleId)) {
    await api('/api/user-roles', 'POST', { userId, roleId });
  }
  // Primero se añade y luego se quita: el último admin nunca queda sin rol a medias.
  for (const ur of actuales) {
    if (ur.roleId !== roleId) await api(`/api/user-roles/${ur.id}`, 'DELETE');
  }
}

/**
 * Roles que tienen los usuarios en un sistema, como [{ userId, id (rol), name }].
 * Hace falta aparte: el listado de usuarios solo trae los roles del sistema por el que se filtra.
 */
export async function asignacionesDeSistema(systemId) {
  const salida = [];
  for (let page = 1; page <= 20; page++) {
    const r = await api(`/api/user-roles${q({ systemId, page, limit: 100 })}`);
    for (const ur of r.userRoles ?? []) salida.push({ userId: ur.userId, id: ur.roleId, name: ur.role?.name ?? '' });
    if (page >= (r.pagination?.totalPages ?? 1)) break;
  }
  return salida;
}

/** Da o quita UN rol sin tocar los demás (el IS admite varios roles por usuario y sistema). */
export async function alternarRol(userId, systemId, roleId, dar) {
  const { userRoles = [] } = await api(`/api/user-roles${q({ userId, systemId, limit: 100 })}`);
  const existente = userRoles.find((ur) => ur.roleId === roleId);
  if (dar && !existente) await api('/api/user-roles', 'POST', { userId, roleId });
  if (!dar && existente) await api(`/api/user-roles/${existente.id}`, 'DELETE');
}

// ── Roles y permisos ────────────────────────────────────────────────────────
export const listarRoles = (systemId) =>
  api(`/api/roles${q({ systemId, limit: 100 })}`).then((r) => r.roles ?? []);
export const crearRol = (systemId, name, description) => api('/api/roles', 'POST', { systemId, name, description });
export const borrarRol = (id) => api(`/api/roles/${id}`, 'DELETE');

/** Permisos del sistema, cada uno con los roles que lo llevan. */
export async function listarPermisos(systemId) {
  const { systems = [] } = await api('/api/permissions/by-system');
  return systems.find((s) => s.system?.id === systemId)?.permissions ?? [];
}
export const darPermiso = (permisoId, roleId) => api(`/api/permissions/${permisoId}/roles/${roleId}`, 'PUT');
export const quitarPermiso = (permisoId, roleId) => api(`/api/permissions/${permisoId}/roles/${roleId}`, 'DELETE');
export const crearPermiso = (systemId, roleId, resource, action, description) =>
  api('/api/permissions/assign', 'POST', { systemId, roleId, resource, action, description });
