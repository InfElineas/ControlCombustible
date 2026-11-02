/**
 * Cliente de elineas-auth para resolver QUÉ puede hacer un usuario.
 *
 * El JWT del IS dice quién es el usuario pero no lleva roles ni permisos, así
 * que se le preguntan al IS (`/api/permissions/me` y `/api/user-roles/me`) con
 * el mismo Bearer. El resultado se cachea unos segundos por `sub`.
 *
 * Si el IS no responde NO se degradan permisos en silencio: o se sirve la última
 * respuesta conocida (acotada por `staleMs`) o se devuelve 502. Tratar un fallo
 * como "sin permisos" dejaría a todos fuera; tratarlo como "todos los permisos"
 * sería un agujero.
 */
import { errors } from './errors'

export interface Access {
  roles: string[]
  /** Permisos como `recurso:acción`. */
  permissions: ReadonlySet<string>
}

export interface IdentityOptions {
  baseUrl: string
  systemSlug: string
  ttlMs: number
  staleMs: number
  timeoutMs: number
  fetchImpl?: typeof fetch
  now?: () => number
}

interface Entry {
  value: Access
  fetchedAt: number
}

export function createIdentity(options: IdentityOptions) {
  const fetchImpl = options.fetchImpl ?? fetch
  const now = options.now ?? (() => Date.now())
  const cache = new Map<string, Entry>()
  const inFlight = new Map<string, Promise<Access>>()
  const MAX_ENTRIES = 1000

  async function getJson(path: string, token: string): Promise<unknown> {
    const url = `${options.baseUrl}${path}?systemSlug=${encodeURIComponent(options.systemSlug)}`
    let response: Response
    try {
      response = await fetchImpl(url, {
        headers: { accept: 'application/json', authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(options.timeoutMs),
      })
    } catch {
      throw errors.upstream('El identity server no responde', 'IS_UNAVAILABLE')
    }
    if (response.status === 401 || response.status === 403) {
      // El IS no reconoce la sesión (cerrada, revocada o caducada).
      throw errors.unauthorized('El identity server rechazó la sesión', 'SESSION_REJECTED')
    }
    if (!response.ok) {
      throw errors.upstream(`El identity server respondió ${response.status}`, 'IS_UNAVAILABLE')
    }
    return response.json()
  }

  async function fetchAccess(token: string): Promise<Access> {
    const [permBody, roleBody] = await Promise.all([
      getJson('/api/permissions/me', token),
      getJson('/api/user-roles/me', token),
    ])
    const permissions = new Set<string>()
    const rawPerms = (permBody as { permissions?: unknown })?.permissions
    if (Array.isArray(rawPerms)) {
      for (const p of rawPerms) {
        const { resource, action } = (p ?? {}) as { resource?: unknown; action?: unknown }
        if (typeof resource === 'string' && typeof action === 'string') {
          permissions.add(`${resource}:${action}`)
        }
      }
    }
    const roles: string[] = []
    const rawRoles = (roleBody as { roles?: unknown })?.roles
    if (Array.isArray(rawRoles)) {
      for (const r of rawRoles) {
        const name = typeof r === 'string' ? r : (r as { name?: unknown })?.name
        if (typeof name === 'string' && name) roles.push(name)
      }
    }
    return { roles, permissions }
  }

  return {
    /** Permisos y roles del usuario `sub`, usando `token` para preguntar al IS. */
    async access(sub: string, token: string): Promise<Access> {
      const hit = cache.get(sub)
      if (hit && now() - hit.fetchedAt < options.ttlMs) return hit.value

      const pending = inFlight.get(sub)
      if (pending) return pending

      const promise = fetchAccess(token)
        .then((value) => {
          if (cache.size >= MAX_ENTRIES && !cache.has(sub)) {
            const oldest = cache.keys().next()
            if (!oldest.done) cache.delete(oldest.value)
          }
          cache.set(sub, { value, fetchedAt: now() })
          return value
        })
        .catch((error) => {
          // Sesión rechazada: se olvida lo cacheado, no se sirve nada caducado.
          if (error?.code === 'SESSION_REJECTED') {
            cache.delete(sub)
            throw error
          }
          if (hit && now() - hit.fetchedAt < options.ttlMs + options.staleMs) return hit.value
          throw error
        })
        .finally(() => inFlight.delete(sub))

      inFlight.set(sub, promise)
      return promise
    },
    clear: () => cache.clear(),
  }
}

export type Identity = ReturnType<typeof createIdentity>
