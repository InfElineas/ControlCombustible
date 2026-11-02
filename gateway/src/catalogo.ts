/**
 * Asignación de permisos a roles que se ha de configurar en elineas-auth.
 *
 * El IS es quien manda: esto es solo la REFERENCIA de cómo reproducir los
 * permisos de producción de la base de datos. Sirve para (a) las pruebas que
 * comprueban la matriz completa y (b) `bun run permisos`, que imprime qué dar
 * de alta. `admin` (= superadmin) recibe todo por ser el comodín local del IS.
 */
export const ROLES = ['admin', 'operador', 'cajero', 'economico', 'auditor'] as const
export type Rol = (typeof ROLES)[number]

const S: Rol[] = ['admin']
const SO: Rol[] = ['admin', 'operador']
const SE: Rol[] = ['admin', 'economico']
const TODOS: Rol[] = [...ROLES]

export const PERMISOS_POR_ROL: Record<string, Rol[]> = {
  'catalogos:read': TODOS,
  'catalogos:write': SO,
  'catalogos:delete': S,
  'catalogos:admin': S,
  'finanzas:write': SE,
  'tarjeta:write': ['admin', 'operador', 'economico'],
  'tarjeta:delete': SE,
  'mantenimiento:write': SO,
  'movimiento:create': SO,
  'movimiento:create_despacho': ['cajero'],
  'movimiento:create_deposito': ['economico'],
  'movimiento:update': ['admin', 'operador', 'cajero'],
  'movimiento:delete': SO,
  'movimiento:delete_despacho': ['cajero'],
  'bonificacion:write': ['admin', 'operador', 'cajero', 'economico'],
  'bonificacion:delete': S,
  'bonificacion:cancelar': ['admin', 'operador', 'cajero'],
  'bonificacion:cobrar': ['admin', 'operador', 'economico'],
  'anomalia:write': ['admin', 'operador', 'economico', 'auditor'],
  'adjunto:write': ['admin', 'operador', 'economico'],
  'apk:write': S,
  'usuarios:admin': S,
}

export function permisosDe(rol: Rol): Set<string> {
  return new Set(
    Object.entries(PERMISOS_POR_ROL)
      .filter(([, roles]) => roles.includes(rol))
      .map(([permiso]) => permiso),
  )
}
