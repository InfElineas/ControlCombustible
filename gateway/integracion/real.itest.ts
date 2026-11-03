/**
 * Prueba de integración contra un elineas-auth REAL (no es un mock).
 *
 *   IS_URL=http://127.0.0.1:8098 IS_ADMIN_EMAIL=admin@gmail.com \
 *   IS_ADMIN_PASSWORD='...' bun run test:integracion
 *
 * Recorre el camino completo: aprovisiona el sistema, crea usuarios con distintos
 * roles, inicia sesión con el cliente real del frontend (`authClient`), y pasa por
 * la pasarela con tokens reales verificados contra el JWKS real. Solo Supabase
 * está simulado. NO se ejecuta con `bun test` a secas (no termina en .test.ts).
 *
 * Crea usuarios nuevos en cada ejecución: úsese contra un IS de pruebas.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
// @ts-expect-error — módulo JavaScript del frontend, sin declaraciones de tipos
import { crearAuthClient } from '../../src/api/authClient.js'
import { createApp } from '../src/app'
import { permisosDe, type Rol } from '../src/catalogo'
import { loadConfig } from '../src/config'
import { createIdentity } from '../src/identity'
import { createVerifier } from '../src/jwt'
import { aprovisionar } from './aprovisionar'

const IS = (process.env.IS_URL ?? '').replace(/\/+$/, '')
// El sign-in del IS exige captcha; un backend/test usa la clave de servicio de cada sistema
// (se genera en el panel del IS, ficha del sistema). `auth` = administrador, `combustible` = el cliente.
const CLAVE_AUTH = process.env.IS_SERVICE_KEY ?? ''
const CLAVE_COMBUSTIBLE = process.env.IS_COMBUSTIBLE_SERVICE_KEY ?? ''
const habilitado = !!IS && !!process.env.IS_ADMIN_EMAIL && !!process.env.IS_ADMIN_PASSWORD && !!CLAVE_AUTH && !!CLAVE_COMBUSTIBLE
const PASS = 'Contrasena-Test-12345!'
const corrida = Date.now().toString(36)
// El IS limita por IP (sign-in 10/min, sign-up 5/min…). Con TRUST_PROXY_HOPS=1 en el IS de
// pruebas, cada llamada declara una IP distinta, como harían clientes reales distintos.
let contadorIp = 0
const ipFalsa = () => `10.${(contadorIp >> 16) & 255}.${(contadorIp >> 8) & 255}.${++contadorIp & 255}`
const mail = (n: string) => `it-${corrida}-${n}@gmail.com`

describe.skipIf(!habilitado)('integración con elineas-auth real', () => {
  let sesionAdmin = ''
  let rolIds: Record<string, string> = {}
  const usuarios: Record<string, { id: string; email: string }> = {}
  const upstream: { url: string; init: RequestInit }[] = []
  let app: ReturnType<typeof createApp>

  async function admin<T>(ruta: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${IS}${ruta}`, { ...init, headers: { authorization: `Bearer ${sesionAdmin}`, 'content-type': 'application/json', origin: 'http://localhost:5173', 'x-forwarded-for': ipFalsa() } })
    const t = await res.text()
    if (!res.ok) throw new Error(`${ruta} → ${res.status} ${t.slice(0, 160)}`)
    return JSON.parse(t) as T
  }

  /** Cliente de autenticación REAL del frontend, con el IS real y la pasarela en proceso. */
  function cliente() {
    const mem = new Map<string, string>()
    const c = crearAuthClient({
      authUrl: IS,
      apiUrl: 'http://gw.local',
      systemSlug: 'combustible',
      almacen: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) },
      fetchImpl: ((url: string, init?: RequestInit) =>
        String(url).startsWith('http://gw.local')
          ? app.fetch(new Request(String(url), init))
          : fetch(url, { ...init, headers: { ...(init?.headers as Record<string, string>), 'x-forwarded-for': ipFalsa(), ...(String(url).endsWith('/api/auth/sign-in') ? { 'x-service-key': CLAVE_COMBUSTIBLE } : {}) } })) as typeof fetch,
    })
    // Expone el almacenamiento simulado para poder inspeccionar qué se guarda.
    return Object.assign(c, { mem })
  }
  const GW = (path: string, token: string, init: RequestInit = {}) =>
    app.fetch(new Request(`http://gw.local${path}`, { ...init, headers: { authorization: `Bearer ${token}`, ...init.headers } }))

  beforeAll(async () => {
    const login = await fetch(`${IS}/api/auth/sign-in`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ipFalsa(), 'x-service-key': CLAVE_AUTH },
      body: JSON.stringify({ email: process.env.IS_ADMIN_EMAIL, password: process.env.IS_ADMIN_PASSWORD, systemSlug: 'auth' }),
    })
    sesionAdmin = login.headers.get('set-auth-token') ?? ''
    expect(sesionAdmin).not.toBe('')

    const r = await aprovisionar({ isUrl: IS, sesion: sesionAdmin, slug: 'combustible', nombre: 'Control Combustible', aplicar: true })
    rolIds = r.rolIds

    const roles: Record<string, string | null> = { op: 'operador', caj: 'cajero', aud: 'auditor', eco: 'economico', adm: 'admin', sinrol: null }
    for (const [clave, rol] of Object.entries(roles)) {
      const email = mail(clave)
      const { user } = await admin<{ user: { id: string } }>('/api/auth/sign-up', { method: 'POST', body: JSON.stringify({ name: `Test ${clave}`, email, password: PASS }) })
      usuarios[clave] = { id: user.id, email }
      if (rol) await admin('/api/user-roles', { method: 'POST', body: JSON.stringify({ userId: user.id, roleId: rolIds[rol] }) })
    }

    const config = { ...loadConfig({ AUTH_BASE_URL: IS, SUPABASE_URL: 'http://db.test', SUPABASE_SERVICE_ROLE_KEY: 'SERVICE', ALLOWED_ORIGIN: 'https://app.test', RATE_LIMIT_USER_PER_MIN: '0', RATE_LIMIT_ANON_PER_MIN: '0', RATE_LIMIT_FAIL_PER_MIN: '0' }) }
    app = createApp({
      config,
      verify: createVerifier({ jwksUrl: `${IS}/api/auth/jwks`, issuer: null, audience: null, clockToleranceS: 30, timeoutMs: 5000 }),
      // TTL 0: cada petición pregunta al IS, para poder ver los cambios al instante.
      identity: createIdentity({ baseUrl: IS, systemSlug: 'combustible', ttlMs: 0, staleMs: 0, timeoutMs: 5000 }),
      upstream: (async (url: string, init: RequestInit) => {
        upstream.push({ url: String(url), init })
        return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })
      }) as unknown as typeof fetch,
    })
  })

  afterAll(async () => {
    // Limpieza de lo que crea esta prueba (los usuarios). El sistema y los roles se quedan: son el catálogo.
    for (const u of Object.values(usuarios)) {
      await fetch(`${IS}/api/users/${u.id}`, { method: 'DELETE', headers: { authorization: `Bearer ${sesionAdmin}` } }).catch(() => {})
    }
  })

  test('el aprovisionamiento es idempotente (una segunda pasada no crea nada)', async () => {
    const otra = await aprovisionar({ isUrl: IS, sesion: sesionAdmin, slug: 'combustible', nombre: 'Control Combustible', aplicar: true })
    expect(otra.creado.sistema).toBe(false)
    expect(otra.creado.roles).toEqual([])
    expect(Object.keys(otra.rolIds).sort()).toEqual(['admin', 'auditor', 'cajero', 'economico', 'operador'])
  })

  test('inicio de sesión real: guarda token de sesión y el JWT dura 5 minutos', async () => {
    const c = cliente()
    const u = await c.iniciarSesion(usuarios.op!.email, PASS)
    expect(u.id).toBe(usuarios.op!.id)
    const jwt = (await c.obtenerToken())!
    const carga = JSON.parse(Buffer.from(jwt.split('.')[1]!, 'base64url').toString())
    expect(carga.exp - carga.iat).toBe(300)
    expect(carga.sub).toBe(usuarios.op!.id)
    expect(JSON.parse(Buffer.from(jwt.split('.')[0]!, 'base64url').toString()).alg).toBe('EdDSA')
  })

  test('renovar con el token de sesión da un JWT nuevo válido para la pasarela', async () => {
    const c = cliente()
    await c.iniciarSesion(usuarios.op!.email, PASS)
    const t1 = (await c.obtenerToken())!
    await new Promise((r) => setTimeout(r, 1100)) // para que el iat cambie
    const t2 = (await c.obtenerToken({ forzar: true }))!
    expect(t2).not.toBe(t1)
    expect((await GW('/rest/v1/ruta', t2)).status).toBe(200)
  })

  for (const rol of ['operador', 'cajero', 'auditor', 'economico', 'admin'] as Rol[]) {
    test(`los permisos del IS para «${rol}» coinciden EXACTAMENTE con la matriz esperada`, async () => {
      const clave = { operador: 'op', cajero: 'caj', auditor: 'aud', economico: 'eco', admin: 'adm' }[rol]!
      const c = cliente()
      await c.iniciarSesion(usuarios[clave]!.email, PASS)
      const perfil = await c.obtenerPerfil()
      expect(perfil.sinAcceso).toBe(false)
      expect(perfil.roles).toEqual([rol])
      if (rol === 'admin') {
        // Comodín local del IS: devuelve el catálogo COMPLETO (también permisos de otros
        // sistemas). Debe contener todo lo nuestro, y puede traer más.
        expect(perfil.permissions).toEqual(expect.arrayContaining([...permisosDe('admin')]))
      } else {
        expect([...perfil.permissions].sort()).toEqual([...permisosDe(rol)].sort())
      }
    })
  }

  test('un usuario SIN rol en el sistema no puede iniciar sesión (equivale al antiguo «pendiente»)', async () => {
    const c = cliente()
    const err = await c.iniciarSesion(usuarios.sinrol!.email, PASS).catch((e: any) => e)
    expect(err.rechazada).toBe(true)
    expect(c.haySesionGuardada()).toBe(false)
  })

  test('contraseña incorrecta se rechaza sin guardar sesión', async () => {
    const c = cliente()
    const err = await c.iniciarSesion(usuarios.op!.email, 'otra-contraseña-mala-1!').catch((e: any) => e)
    expect(err.rechazada).toBe(true)
    expect(c.haySesionGuardada()).toBe(false)
  })

  test('pasarela de extremo a extremo con tokens reales: lo que cada rol puede hacer', async () => {
    const tokenDe = async (clave: string) => {
      const c = cliente()
      await c.iniciarSesion(usuarios[clave]!.email, PASS)
      return (await c.obtenerToken())!
    }
    const [op, caj, aud] = [await tokenDe('op'), await tokenDe('caj'), await tokenDe('aud')]
    const json = { 'content-type': 'application/json' }
    const post = (t: string, tabla: string, body: unknown) => GW(`/rest/v1/${tabla}`, t, { method: 'POST', headers: json, body: JSON.stringify(body) })

    // lectura: todos
    for (const t of [op, caj, aud]) expect((await GW('/rest/v1/movimiento?select=id', t)).status).toBe(200)
    // el auditor no escribe
    expect((await post(aud, 'ruta', { nombre: 'x' })).status).toBe(403)
    // el cajero: solo despachos
    expect((await post(caj, 'movimiento', { tipo: 'COMPRA' })).status).toBe(403)
    const antes = upstream.length
    expect((await post(caj, 'movimiento', { tipo: 'DESPACHO' })).status).toBe(200)
    expect(upstream.length).toBe(antes + 1)
    expect(new Headers(upstream.at(-1)!.init.headers).get('authorization')).toBe('Bearer SERVICE')
    // el operador crea cualquier tipo
    expect((await post(op, 'movimiento', { tipo: 'COMPRA' })).status).toBe(200)
    // el cajero borra con filtro forzado a DESPACHO
    await GW('/rest/v1/movimiento?id=eq.1', caj, { method: 'DELETE' })
    expect(upstream.at(-1)!.url).toContain('id=eq.1&tipo=eq.DESPACHO')
    // separación de funciones de las bonificaciones
    const patch = (t: string, estado: string) => GW('/rest/v1/venta_trabajador?id=eq.1', t, { method: 'PATCH', headers: json, body: JSON.stringify({ estado }) })
    expect((await patch(caj, 'PAGADO')).status).toBe(403)
    expect((await patch(caj, 'CANCELADO')).status).toBe(200)
    // la identidad que llega a la base de datos es la del token
    const h = new Headers(upstream.at(-1)!.init.headers)
    expect(h.get('x-app-user')).toBe(usuarios.caj!.id)
    expect(h.get('x-app-permissions')).toContain('bonificacion:cancelar')
  })

  test('la auditoría se firma con el usuario real del token', async () => {
    const c = cliente()
    await c.iniciarSesion(usuarios.aud!.email, PASS)
    await GW('/rest/v1/audit_log', (await c.obtenerToken())!, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'CREATE', entity_type: 'X', user_id: 'falso', user_email: 'falso@x.com' }),
    })
    const enviado = JSON.parse(String(upstream.at(-1)!.init.body))
    expect(enviado.user_id).toBe(usuarios.aud!.id)
    expect(enviado.user_email).toBe(usuarios.aud!.email)
  })

  test('quitarle el rol en el IS corta el acceso (la pasarela lo ve en la siguiente petición)', async () => {
    const c = cliente()
    await c.iniciarSesion(usuarios.eco!.email, PASS)
    const token = (await c.obtenerToken())!
    expect((await GW('/rest/v1/ruta', token)).status).toBe(200)

    const lista = await admin<{ userRoles: { id: string; roleId?: string }[] }>(`/api/user-roles?userId=${usuarios.eco!.id}&limit=100`)
    for (const ur of lista.userRoles) await admin(`/api/user-roles/${ur.id}`, { method: 'DELETE' })

    const res = await GW('/rest/v1/ruta', token)
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('NO_ACCESS')
  })

  test('cerrar sesión invalida el token de sesión en el IS', async () => {
    const c = cliente()
    await c.iniciarSesion(usuarios.aud!.email, PASS)
    const sesion = JSON.parse(c.mem.get('webcombustible-is-sesion-v1')!).sessionToken as string
    // Antes de cerrar, ese token renueva JWT.
    const antes = await fetch(`${IS}/api/auth/token`, { headers: { authorization: `Bearer ${sesion}`, 'x-forwarded-for': ipFalsa() } })
    expect(antes.status).toBe(200)

    await c.cerrarSesion()
    expect(c.haySesionGuardada()).toBe(false)
    expect(c.mem.size).toBe(0)
    expect(await c.obtenerToken()).toBeNull()

    // Y en el servidor ya no sirve: un token de sesión robado no renueva nada.
    const despues = await fetch(`${IS}/api/auth/token`, { headers: { authorization: `Bearer ${sesion}`, 'x-forwarded-for': ipFalsa() } })
    expect(despues.status).toBe(401)
  })
})
