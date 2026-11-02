import { describe, expect, test } from 'bun:test'
import { PERMISOS_POR_ROL, ROLES, permisosDe, type Rol } from '../src/catalogo'
import { PERMISOS_USADOS, autorizar, embeddedResources, type AuthzInput } from '../src/rules'

const ACTOR = { sub: 'u-1', email: 'a@gmail.com', name: 'A' }

function run(
  rol: Rol | null,
  method: string,
  resource: string,
  extra: Partial<AuthzInput> & { q?: string } = {},
) {
  const { q = '', ...rest } = extra
  const hasBody = method === 'POST' || method === 'PATCH'
  return autorizar({
    method,
    resource,
    query: new URLSearchParams(q || (method === 'PATCH' || method === 'DELETE' ? 'id=eq.1' : '')),
    body: hasBody ? {} : undefined,
    hasBody,
    prefer: null,
    actor: rol ? ACTOR : null,
    permissions: rol ? permisosDe(rol) : new Set(),
    ...rest,
  })
}

const rolesQuePueden = (method: string, resource: string, extra = {}) =>
  ROLES.filter((r) => run(r, method, resource, extra).ok)

const S: Rol[] = ['admin']
const SO: Rol[] = ['admin', 'operador']
const SE: Rol[] = ['admin', 'economico']
const SOE: Rol[] = ['admin', 'operador', 'economico']
const SOCE: Rol[] = ['admin', 'operador', 'cajero', 'economico']

// Matriz esperada, tomada del export de pg_policies de producción (2026-11-02),
// una vez aplicada la migración de cierre. [insert, update, delete]
const ESPERADA: Record<string, [Rol[], Rol[], Rol[]]> = {
  tipo_consumidor: [S, S, S],
  tipo_combustible: [SO, SO, SO],
  vehiculo: [SO, SO, SO],
  config_alerta: [SO, SO, SO],
  ruta: [SO, SO, SO],
  ruta_marcador: [SO, SO, SO],
  marcador: [SO, SO, SO],
  reporte_chat_transporte: [SO, SO, SO],
  historial_mantenimiento: [SO, SO, SO],
  consumidor: [SO, SO, S],
  conductor: [SO, SO, S],
  asignacion_ruta: [SO, SO, S],
  tarjeta: [SOE, SOE, SE],
  precio_combustible: [SE, SE, SE],
  precio_despacho_tipo: [SE, SE, SE],
  concepto_precio: [SE, SE, SE],
  cpp_ajuste: [SE, SE, SE],
  clase_vehiculo: [SE, SE, SE],
  tarifa_transporte: [SE, SE, SE],
  beneficiario: [SOCE, SOCE, S],
  venta_trabajador: [SOCE, SOCE, S],
  anomalia_descartada: [[...SOE, 'auditor'], [], [...SOE, 'auditor']],
  apk_version: [S, S, S],
}

describe('matriz rol × tabla × operación', () => {
  for (const [tabla, [ins, upd, del]] of Object.entries(ESPERADA)) {
    test(`${tabla}: crear`, () => expect(rolesQuePueden('POST', tabla).sort()).toEqual([...ins].sort()))
    test(`${tabla}: actualizar`, () => expect(rolesQuePueden('PATCH', tabla).sort()).toEqual([...upd].sort()))
    test(`${tabla}: borrar`, () => expect(rolesQuePueden('DELETE', tabla).sort()).toEqual([...del].sort()))
  }

  test('todas las tablas y vistas se pueden leer con cualquier rol', () => {
    const lecturas = [...Object.keys(ESPERADA), 'movimiento', 'audit_log',
      'v_stock_tanques', 'v_cpp_por_tanque', 'v_cpp_por_combustible', 'v_vehiculos_transporte']
    for (const t of lecturas) expect(rolesQuePueden('GET', t).length).toBe(ROLES.length)
  })

  test('audit_log: cualquiera escribe, nadie modifica ni borra', () => {
    expect(rolesQuePueden('POST', 'audit_log').length).toBe(ROLES.length)
    expect(rolesQuePueden('PATCH', 'audit_log')).toEqual([])
    expect(rolesQuePueden('DELETE', 'audit_log')).toEqual([])
  })

  test('las vistas son de solo lectura', () => {
    for (const v of ['v_stock_tanques', 'v_cpp_por_tanque', 'v_cpp_por_combustible', 'v_vehiculos_transporte']) {
      expect(rolesQuePueden('POST', v)).toEqual([])
      expect(rolesQuePueden('PATCH', v)).toEqual([])
      expect(rolesQuePueden('DELETE', v)).toEqual([])
    }
  })

  test('user_roles ya no es accesible para nadie', () => {
    for (const m of ['GET', 'POST', 'PATCH', 'DELETE']) expect(rolesQuePueden(m, 'user_roles')).toEqual([])
  })

  test('recursos desconocidos y métodos no previstos se deniegan', () => {
    expect(run('admin', 'GET', 'pg_catalog').ok).toBe(false)
    expect(run('admin', 'GET', '__proto__').ok).toBe(false)
    expect(run('admin', 'GET', 'constructor').ok).toBe(false)
    expect(run('admin', 'PUT', 'ruta').ok).toBe(false)
  })
})

describe('movimiento', () => {
  const insertar = (tipo: string | undefined) =>
    rolesQuePueden('POST', 'movimiento', { body: tipo === undefined ? {} : { tipo } }).sort()

  test('crear por tipo', () => {
    expect(insertar('COMPRA')).toEqual([...SO].sort())
    expect(insertar('DESPACHO')).toEqual(['admin', 'cajero', 'operador'])
    expect(insertar('DEPOSITO')).toEqual(['admin', 'economico', 'operador'])
    expect(insertar('AJUSTE')).toEqual([...SO].sort())
    expect(insertar(undefined)).toEqual([...SO].sort())
  })

  test('una carga en lote se rechaza entera si una fila no está permitida', () => {
    const lote = [{ tipo: 'DESPACHO' }, { tipo: 'COMPRA' }]
    expect(run('cajero', 'POST', 'movimiento', { body: lote }).ok).toBe(false)
    expect(run('operador', 'POST', 'movimiento', { body: lote }).ok).toBe(true)
  })

  test('el cuerpo debe ser objeto(s)', () => {
    expect(run('admin', 'POST', 'movimiento', { body: 'x' }).ok).toBe(false)
    expect(run('admin', 'POST', 'movimiento', { body: [1] }).ok).toBe(false)
  })

  test('actualizar: superadmin, operador y cajero', () => {
    expect(rolesQuePueden('PATCH', 'movimiento').sort()).toEqual(['admin', 'cajero', 'operador'])
  })

  test('borrar: superadmin y operador sin restricción; cajero solo despachos', () => {
    expect(rolesQuePueden('DELETE', 'movimiento').sort()).toEqual(['admin', 'cajero', 'operador'])
    const admin = run('admin', 'DELETE', 'movimiento')
    const cajero = run('cajero', 'DELETE', 'movimiento')
    expect(admin.ok && admin.appendQuery).toEqual([])
    expect(cajero.ok && cajero.appendQuery).toEqual(['tipo=eq.DESPACHO'])
    expect(run('economico', 'DELETE', 'movimiento').ok).toBe(false)
    expect(run('auditor', 'DELETE', 'movimiento').ok).toBe(false)
  })

  test('upsert: exige además permiso de actualizar', () => {
    const opts = { body: { tipo: 'DEPOSITO' }, prefer: 'resolution=merge-duplicates' }
    expect(run('economico', 'POST', 'movimiento', opts).ok).toBe(false) // puede crear, no actualizar
    expect(run('operador', 'POST', 'movimiento', opts).ok).toBe(true)
    expect(run('operador', 'POST', 'movimiento', { body: { tipo: 'DEPOSITO' }, q: 'on_conflict=id' }).ok).toBe(true)
    expect(run('economico', 'POST', 'movimiento', { body: { tipo: 'DEPOSITO' }, q: 'on_conflict=id' }).ok).toBe(false)
  })
})

describe('bonificaciones: separación de funciones (antes en el trigger)', () => {
  const cambiar = (rol: Rol, estado: string) =>
    run(rol, 'PATCH', 'venta_trabajador', { body: { estado } }).ok

  test('cancelar o anular: superadmin, operador, cajero; no económico', () => {
    for (const e of ['CANCELADO', 'ANULADO']) {
      expect(ROLES.filter((r) => cambiar(r, e)).sort()).toEqual(['admin', 'cajero', 'operador'])
    }
  })
  test('cobrar: superadmin, operador, económico; no cajero', () => {
    for (const e of ['PAGADO', 'PAGADO_FINALIZADO']) {
      expect(ROLES.filter((r) => cambiar(r, e)).sort()).toEqual(['admin', 'economico', 'operador'])
    }
  })
  test('otros estados solo piden permiso de escritura', () => {
    expect(ROLES.filter((r) => cambiar(r, 'ENTREGADO')).sort()).toEqual([...SOCE].sort())
  })
  test('también al crear con un estado final', () => {
    expect(run('economico', 'POST', 'venta_trabajador', { body: { estado: 'CANCELADO' } }).ok).toBe(false)
    expect(run('cajero', 'POST', 'venta_trabajador', { body: { estado: 'PAGADO' } }).ok).toBe(false)
  })
})

describe('anónimo', () => {
  test('apk_version se puede leer sin sesión; el resto exige iniciarla', () => {
    expect(run(null, 'GET', 'apk_version').ok).toBe(true)
    const r = run(null, 'GET', 'ruta')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(401)
    expect(run(null, 'POST', 'apk_version').ok).toBe(false)
  })
})

describe('auditoría firmada por el servidor', () => {
  test('sobrescribe user_id, user_email y user_name aunque el cliente los falsifique', () => {
    const d = run('auditor', 'POST', 'audit_log', {
      body: { action: 'X', entity_type: 'Y', user_id: 'otro', user_email: 'falso@x.com', user_name: 'Falso' },
    })
    expect(d.ok && d.body).toEqual({
      action: 'X', entity_type: 'Y', user_id: 'u-1', user_email: 'a@gmail.com', user_name: 'A',
    })
  })
  test('en lote firma todas las filas y conserva el array', () => {
    const d = run('operador', 'POST', 'audit_log', { body: [{ action: 'A', user_id: 'x' }, { action: 'B' }] })
    expect(d.ok && Array.isArray(d.body) && d.body.every((f: { user_id: string }) => f.user_id === 'u-1')).toBe(true)
  })
})

describe('modificaciones masivas', () => {
  test('PATCH y DELETE sin filtro se rechazan', () => {
    for (const m of ['PATCH', 'DELETE']) {
      const d = run('admin', m, 'consumidor', { q: 'select=id&limit=1' })
      expect(d.ok).toBe(false)
      if (!d.ok) expect(d.code).toBe('FILTER_REQUIRED')
    }
  })
  test('con filtro pasan', () => {
    expect(run('admin', 'DELETE', 'consumidor', { q: 'id=eq.5' }).ok).toBe(true)
    expect(run('admin', 'PATCH', 'consumidor', { q: 'or=(a.eq.1,b.eq.2)' }).ok).toBe(true)
  })
})

describe('cuerpo', () => {
  test('POST sin JSON interpretable → 415', () => {
    const d = run('admin', 'POST', 'consumidor', { body: undefined, hasBody: true })
    expect(!d.ok && d.status).toBe(415)
  })
})

describe('embebidos en select', () => {
  test('extracción', () => {
    expect(embeddedResources('*')).toEqual([])
    expect(embeddedResources('orden,marcador_id,marcador(id,nombre,lat)')).toEqual(['marcador'])
    expect(embeddedResources('*,m:marcador(*),user_roles!inner(role)')).toEqual(['marcador', 'user_roles'])
    expect(embeddedResources('id,a(b(c))')).toEqual(['a', 'b'])
    expect(embeddedResources('count()')).toEqual([])
  })
  test('no se puede leer una tabla prohibida a través de otra', () => {
    expect(run('admin', 'GET', 'ruta', { q: 'select=*,user_roles(*)' }).ok).toBe(false)
    expect(run('admin', 'GET', 'ruta', { q: 'select=*,x:user_roles!inner(role)' }).ok).toBe(false)
    expect(run('admin', 'GET', 'ruta', { q: 'select=*,desconocida(*)' }).ok).toBe(false)
    expect(run('auditor', 'GET', 'ruta_marcador', { q: 'select=orden,marcador(id,nombre)' }).ok).toBe(true)
  })
  test('también en escrituras con representación devuelta', () => {
    expect(run('admin', 'PATCH', 'ruta', { q: 'id=eq.1&select=*,user_roles(*)' }).ok).toBe(false)
  })
})

describe('coherencia del catálogo', () => {
  test('todo permiso que usa la pasarela está asignado a algún rol', () => {
    const sinAsignar = PERMISOS_USADOS.filter((p) => !(p in PERMISOS_POR_ROL))
    expect(sinAsignar).toEqual([])
  })
  test('el catálogo no contiene permisos que la pasarela no use', () => {
    const extra = Object.keys(PERMISOS_POR_ROL).filter(
      (p) => !PERMISOS_USADOS.includes(p) && !['adjunto:write', 'usuarios:admin'].includes(p),
    )
    expect(extra).toEqual([])
  })
})
