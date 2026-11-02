/**
 * Reglas de autorización: traducen una petición PostgREST a los permisos del IS
 * que exige. NO deciden quién tiene cada permiso: eso vive en elineas-auth.
 *
 * Reproduce las políticas RLS de producción (export del 2026-11-02, ya sin las
 * políticas abiertas que cerró la migración 2026-11-02_cerrar_politicas_abiertas).
 * Todo lo que no figure aquí se DENIEGA: tabla desconocida, función RPC, método
 * raro, etc.
 *
 * Función pura, sin E/S, para poder probar la matriz completa.
 */

export interface Actor {
  sub: string
  email: string | null
  name: string | null
}

export interface AuthzInput {
  method: string
  /** Primer segmento tras /rest/v1/ (tabla o vista). */
  resource: string
  query: URLSearchParams
  /** Cuerpo ya interpretado como JSON, o `undefined` si no había / no era JSON. */
  body: unknown
  /** `true` si la petición traía cuerpo (aunque no fuese JSON válido). */
  hasBody: boolean
  prefer: string | null
  actor: Actor | null
  permissions: ReadonlySet<string>
}

export type Decision =
  | {
      ok: true
      /** Filtros crudos (`clave=valor`) que la pasarela añade a la query original. */
      appendQuery: string[]
      /** Cuerpo a reenviar si la pasarela lo reescribió. */
      body?: unknown
    }
  | { ok: false; status: 400 | 401 | 403 | 415; code: string; message: string }

/** Requisito de una operación. */
type Req = string | 'public' | 'authenticated'

interface Spec {
  read?: Req
  insert?: Req
  update?: Req
  delete?: Req
}

const READ = 'catalogos:read'

const soloLectura: Spec = { read: READ }
const todoCon = (permiso: string): Spec => ({
  read: READ,
  insert: permiso,
  update: permiso,
  delete: permiso,
})

/** Tablas y vistas expuestas. Lo que no esté aquí no existe para la pasarela. */
const TABLAS: Record<string, Spec> = {
  // Catálogos de operación: superadmin y operador.
  tipo_combustible: todoCon('catalogos:write'),
  vehiculo: todoCon('catalogos:write'),
  config_alerta: todoCon('catalogos:write'),
  ruta: todoCon('catalogos:write'),
  ruta_marcador: todoCon('catalogos:write'),
  marcador: todoCon('catalogos:write'),
  reporte_chat_transporte: todoCon('catalogos:write'),
  // Estos tres: borrar es solo del superadmin.
  consumidor: { ...todoCon('catalogos:write'), delete: 'catalogos:delete' },
  conductor: { ...todoCon('catalogos:write'), delete: 'catalogos:delete' },
  asignacion_ruta: { ...todoCon('catalogos:write'), delete: 'catalogos:delete' },
  // Solo superadmin.
  tipo_consumidor: todoCon('catalogos:admin'),
  // Finanzas: superadmin y económico.
  precio_combustible: todoCon('finanzas:write'),
  precio_despacho_tipo: todoCon('finanzas:write'),
  concepto_precio: todoCon('finanzas:write'),
  cpp_ajuste: todoCon('finanzas:write'),
  clase_vehiculo: todoCon('finanzas:write'),
  tarifa_transporte: todoCon('finanzas:write'),
  tarjeta: { ...todoCon('tarjeta:write'), delete: 'tarjeta:delete' },
  historial_mantenimiento: todoCon('mantenimiento:write'),
  // Bonificaciones (ver además `reglaEstadoVenta`).
  beneficiario: { ...todoCon('bonificacion:write'), delete: 'bonificacion:delete' },
  venta_trabajador: { ...todoCon('bonificacion:write'), delete: 'bonificacion:delete' },
  anomalia_descartada: { read: READ, insert: 'anomalia:write', delete: 'anomalia:write' },
  // Movimientos: reglas por contenido en `reglaMovimiento`. Aquí solo la base.
  movimiento: { read: READ },
  // El log se escribe desde el cliente, pero la pasarela fija quién lo firma. Sin update ni delete.
  audit_log: { read: READ, insert: 'authenticated' },
  // Público: la app lo consulta antes de iniciar sesión para ofrecer la actualización.
  apk_version: {
    read: 'public',
    insert: 'apk:write',
    update: 'apk:write',
    delete: 'apk:write',
  },
  // Vistas: solo lectura.
  v_stock_tanques: soloLectura,
  v_cpp_por_tanque: soloLectura,
  v_cpp_por_combustible: soloLectura,
  v_vehiculos_transporte: soloLectura,
}
// NO están, y por tanto se deniegan: user_roles (ahora lo gestiona el IS) y toda función rpc/*.

/** Todos los permisos que la pasarela puede exigir. Para dar de alta el catálogo en el IS. */
export const PERMISOS_USADOS: readonly string[] = [
  ...new Set([
    ...Object.values(TABLAS).flatMap((s) =>
      [s.read, s.insert, s.update, s.delete].filter(
        (r): r is string => !!r && r !== 'public' && r !== 'authenticated',
      ),
    ),
    'movimiento:create',
    'movimiento:create_despacho',
    'movimiento:create_deposito',
    'movimiento:update',
    'movimiento:delete',
    'movimiento:delete_despacho',
    'bonificacion:cancelar',
    'bonificacion:cobrar',
  ]),
].sort()

const RESERVADOS = new Set(['select', 'order', 'limit', 'offset', 'columns', 'on_conflict'])
const AGREGADOS = new Set(['count', 'sum', 'avg', 'min', 'max'])

const deny = (
  status: 400 | 401 | 403 | 415,
  code: string,
  message: string,
): Decision => ({ ok: false, status, code, message })

const forbidden = (message: string) => deny(403, 'FORBIDDEN', message)

/** ¿Cumple el actor este requisito? `null` = sí; si no, la respuesta de rechazo. */
function check(req: Req | undefined, input: AuthzInput, que: string): Decision | null {
  if (req === undefined) return forbidden(`Operación no permitida sobre ${input.resource}: ${que}`)
  if (req === 'public') return null
  if (!input.actor) return deny(401, 'UNAUTHORIZED', 'Se requiere iniciar sesión')
  if (req === 'authenticated') return null
  if (!input.permissions.has(req)) return forbidden(`Requiere el permiso "${req}"`)
  return null
}

/** Nombres de tablas embebidas en un parámetro `select` de PostgREST. */
export function embeddedResources(select: string): string[] {
  const names: string[] = []
  const re = /(?:^|[,(])\s*(?:[A-Za-z_]\w*\s*:\s*)?([A-Za-z_]\w*)(?:![\w.]+)*\s*(?=\()/g
  for (let m = re.exec(select); m; m = re.exec(select)) {
    const name = m[1]!
    if (!AGREGADOS.has(name)) names.push(name)
  }
  return names
}

function items(body: unknown): Record<string, unknown>[] | null {
  const list = Array.isArray(body) ? body : [body]
  return list.every((i) => i && typeof i === 'object' && !Array.isArray(i))
    ? (list as Record<string, unknown>[])
    : null
}

/** movimiento: quién puede crear qué tipo y quién puede borrar. */
function reglaMovimiento(op: 'insert' | 'update' | 'delete', input: AuthzInput): Decision | null {
  const tiene = (p: string) => input.permissions.has(p)

  if (op === 'update') return check('movimiento:update', input, 'update')

  if (op === 'insert') {
    if (!input.actor) return deny(401, 'UNAUTHORIZED', 'Se requiere iniciar sesión')
    const lista = items(input.body)
    if (!lista) return deny(400, 'BAD_BODY', 'El cuerpo debe ser un objeto JSON o un array de objetos')
    for (const fila of lista) {
      const tipo = fila.tipo
      const puede =
        tiene('movimiento:create') ||
        (tipo === 'DESPACHO' && tiene('movimiento:create_despacho')) ||
        (tipo === 'DEPOSITO' && tiene('movimiento:create_deposito'))
      if (!puede) {
        return forbidden(`No puede registrar movimientos de tipo ${String(tipo ?? '(sin tipo)')}`)
      }
    }
    return null
  }

  // delete
  if (!input.actor) return deny(401, 'UNAUTHORIZED', 'Se requiere iniciar sesión')
  if (tiene('movimiento:delete')) return null
  if (tiene('movimiento:delete_despacho')) return null // el filtro tipo=DESPACHO lo añade `autorizar`
  return forbidden('Requiere el permiso "movimiento:delete"')
}

/**
 * Separación de funciones en las bonificaciones (antes en el trigger
 * validate_venta_update, que con la service_role ya no puede saber quién escribe):
 * cancelar/anular y cobrar son permisos distintos.
 */
function reglaEstadoVenta(input: AuthzInput): Decision | null {
  const lista = items(input.body)
  if (!lista) return null // el cuerpo inválido lo rechaza antes el chequeo de método
  for (const fila of lista) {
    const estado = fila.estado
    if (estado === 'CANCELADO' || estado === 'ANULADO') {
      const d = check('bonificacion:cancelar', input, 'cancelar')
      if (d) return d
    } else if (estado === 'PAGADO' || estado === 'PAGADO_FINALIZADO') {
      const d = check('bonificacion:cobrar', input, 'cobrar')
      if (d) return d
    }
  }
  return null
}

export function autorizar(input: AuthzInput): Decision {
  const { resource, method, actor } = input
  const query = input.query

  const spec = Object.hasOwn(TABLAS, resource) ? TABLAS[resource] : undefined
  if (!spec) return forbidden(`Recurso no disponible: ${resource}`)

  const m = method.toUpperCase()
  if (!['GET', 'HEAD', 'POST', 'PATCH', 'DELETE'].includes(m)) {
    return forbidden(`Método no permitido: ${m}`)
  }

  // Embebidos: leer una tabla a través de otra exige poder leerla directamente.
  const select = query.get('select')
  if (select) {
    for (const nombre of embeddedResources(select)) {
      const s = Object.hasOwn(TABLAS, nombre) ? TABLAS[nombre] : undefined
      const d = s ? check(s.read, input, `incluir ${nombre}`) : forbidden(`Recurso no disponible: ${nombre}`)
      if (d) return d
    }
  }

  // Lectura
  if (m === 'GET' || m === 'HEAD') {
    const d = check(spec.read, input, 'leer')
    return d ?? { ok: true, appendQuery: [] }
  }

  // Escrituras: exigen cuerpo JSON interpretable cuando lo llevan (POST/PATCH).
  if ((m === 'POST' || m === 'PATCH') && input.hasBody && input.body === undefined) {
    return deny(415, 'UNSUPPORTED_BODY', 'El cuerpo debe ser JSON')
  }

  if (m === 'POST') {
    if (input.body === undefined) return deny(400, 'BAD_BODY', 'Falta el cuerpo de la petición')
    const prefer = input.prefer ?? ''
    const esUpsert = query.has('on_conflict') || /resolution=(merge|ignore)-duplicates/i.test(prefer)

    let d: Decision | null =
      resource === 'movimiento' ? reglaMovimiento('insert', input) : check(spec.insert, input, 'crear')
    if (d) return d
    if (esUpsert) {
      // Un upsert puede actualizar filas existentes: también exige permiso de update.
      d = resource === 'movimiento' ? reglaMovimiento('update', input) : check(spec.update, input, 'actualizar')
      if (d) return d
    }

    if (resource === 'venta_trabajador') {
      d = reglaEstadoVenta(input)
      if (d) return d
    }

    if (resource === 'audit_log') {
      // El autor lo fija la pasarela, no el cliente: no se puede falsificar.
      const lista = items(input.body)
      if (!lista || !actor) return deny(400, 'BAD_BODY', 'Cuerpo inválido')
      const firmado = lista.map((fila) => ({
        ...fila,
        user_id: actor.sub,
        user_email: actor.email,
        user_name: actor.name ?? actor.email,
      }))
      return { ok: true, appendQuery: [], body: Array.isArray(input.body) ? firmado : firmado[0] }
    }
    return { ok: true, appendQuery: [] }
  }

  // PATCH y DELETE: sin filtro afectarían a toda la tabla. Se exige al menos uno.
  const hayFiltro = [...query.keys()].some((k) => !RESERVADOS.has(k))
  if (!hayFiltro) return deny(400, 'FILTER_REQUIRED', 'Las modificaciones y borrados requieren un filtro')

  if (m === 'PATCH') {
    if (input.body === undefined) return deny(400, 'BAD_BODY', 'Falta el cuerpo de la petición')
    let d: Decision | null =
      resource === 'movimiento' ? reglaMovimiento('update', input) : check(spec.update, input, 'actualizar')
    if (d) return d
    if (resource === 'venta_trabajador') {
      d = reglaEstadoVenta(input)
      if (d) return d
    }
    return { ok: true, appendQuery: [] }
  }

  // DELETE
  const d = resource === 'movimiento' ? reglaMovimiento('delete', input) : check(spec.delete, input, 'borrar')
  if (d) return d
  if (resource === 'movimiento' && !input.permissions.has('movimiento:delete')) {
    // Solo puede borrar despachos: se impone en el propio filtro, así que ni
    // siquiera con un id ajeno puede tocar otro tipo.
    return { ok: true, appendQuery: ['tipo=eq.DESPACHO'] }
  }
  return { ok: true, appendQuery: [] }
}
