/**
 * Da de alta en elineas-auth el sistema `combustible`, sus roles y sus permisos,
 * a partir de src/catalogo.ts. Idempotente: se puede ejecutar las veces que haga
 * falta y solo crea lo que falte.
 *
 * Usa la API de administración del IS, que exige la sesión de un administrador
 * (el token de sesión, no el JWT).
 */
import { PERMISOS_POR_ROL, ROLES } from '../src/catalogo'

export interface OpcionesAprovisionar {
  isUrl: string
  /** Token de sesión (cabecera `set-auth-token`) de un admin del sistema `auth`. */
  sesion: string
  slug: string
  nombre: string
  /** `false` = solo informa de lo que haría. */
  aplicar: boolean
  log?: (mensaje: string) => void
}

export interface ResultadoAprovisionar {
  sistemaId: string | null
  rolIds: Record<string, string>
  creado: { sistema: boolean; roles: string[] }
  asignaciones: number
}

export async function aprovisionar(o: OpcionesAprovisionar): Promise<ResultadoAprovisionar> {
  const log = o.log ?? (() => {})
  const base = o.isUrl.replace(/\/+$/, '')

  async function api<T>(ruta: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${base}${ruta}`, {
      ...init,
      headers: { authorization: `Bearer ${o.sesion}`, 'content-type': 'application/json', ...init.headers },
    })
    const texto = await res.text()
    if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${ruta} → ${res.status}: ${texto.slice(0, 200)}`)
    return (texto ? JSON.parse(texto) : {}) as T
  }

  const resultado: ResultadoAprovisionar = { sistemaId: null, rolIds: {}, creado: { sistema: false, roles: [] }, asignaciones: 0 }

  // 1. Sistema
  const { systems } = await api<{ systems: { id: string; slug: string }[] }>('/api/systems?limit=100')
  let sistema = systems.find((s) => s.slug === o.slug)
  if (sistema) {
    log(`sistema «${o.slug}» ya existe`)
  } else if (o.aplicar) {
    sistema = (await api<{ system: { id: string; slug: string } }>('/api/systems', {
      method: 'POST',
      body: JSON.stringify({ name: o.nombre, slug: o.slug, description: 'Gestión y auditoría de combustible' }),
    })).system
    resultado.creado.sistema = true
    log(`sistema «${o.slug}» CREADO`)
  } else {
    log(`crearía el sistema «${o.slug}»`)
  }
  resultado.sistemaId = sistema?.id ?? null

  // 2. Roles
  const existentes = new Map<string, string>()
  if (sistema) {
    const { roles } = await api<{ roles: { id: string; name: string }[] }>(`/api/roles?systemId=${sistema.id}&limit=100`)
    for (const r of roles) existentes.set(r.name, r.id)
  }
  for (const nombre of ROLES) {
    if (existentes.has(nombre)) {
      log(`rol «${nombre}» ya existe`)
    } else if (o.aplicar && sistema) {
      const { role } = await api<{ role: { id: string } }>('/api/roles', {
        method: 'POST',
        body: JSON.stringify({ systemId: sistema.id, name: nombre, description: `Rol ${nombre} de Control Combustible` }),
      })
      existentes.set(nombre, role.id)
      resultado.creado.roles.push(nombre)
      log(`rol «${nombre}» CREADO`)
    } else {
      log(`crearía el rol «${nombre}»`)
    }
  }
  resultado.rolIds = Object.fromEntries(existentes)

  // 3. Permisos (la asignación crea el permiso si no existe y es idempotente)
  for (const [permiso, roles] of Object.entries(PERMISOS_POR_ROL)) {
    const [recurso, accion] = permiso.split(':') as [string, string]
    for (const rol of roles) {
      const roleId = existentes.get(rol)
      if (!o.aplicar || !sistema || !roleId) { resultado.asignaciones++; continue }
      await api('/api/permissions/assign', {
        method: 'POST',
        body: JSON.stringify({ systemId: sistema.id, roleId, resource: recurso, action: accion }),
      })
      resultado.asignaciones++
    }
  }
  log(`${resultado.asignaciones} asignaciones permiso→rol ${o.aplicar ? 'aplicadas' : 'previstas'}`)
  return resultado
}
