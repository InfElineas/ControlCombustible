import { describe, expect, test } from 'bun:test'
import { mundo } from './helpers'

const GET = (path: string, headers: Record<string, string> = {}) => new Request(`http://gw${path}`, { headers })
const auth = (t: string) => ({ authorization: `Bearer ${t}` })

describe('pasarela', () => {
  test('sin token: 401, salvo lo público', async () => {
    const { app, w } = await mundo()
    expect((await app.request(GET('/rest/v1/ruta'))).status).toBe(401)
    expect(w.upstreamCalls.length).toBe(0)
    expect((await app.request(GET('/rest/v1/apk_version?select=*'))).status).toBe(200)
    expect(w.upstreamCalls.length).toBe(1)
  })

  test('reenvía con la service_role y NUNCA con el token del usuario', async () => {
    const { app, w, token } = await mundo()
    w.usuarios.set('op', { roles: ['operador'] })
    const t = await token('op')
    const res = await app.request(GET('/rest/v1/ruta?select=id', { ...auth(t), apikey: 'ANON', 'accept-profile': 'auth', 'content-profile': 'auth' }))
    expect(res.status).toBe(200)
    const h = new Headers(w.upstreamCalls[0]!.init.headers)
    expect(h.get('authorization')).toBe('Bearer SERVICE-KEY')
    expect(h.get('apikey')).toBe('SERVICE-KEY')
    expect(h.get('accept-profile')).toBeNull()
    expect(h.get('content-profile')).toBeNull()
    expect(h.get('x-app-user')).toBe('op')
  })

  test('x-app-user / x-app-permissions del cliente no se pueden suplantar', async () => {
    const { app, w, token } = await mundo()
    w.usuarios.set('aud', { roles: ['auditor'] })
    await app.request(GET('/rest/v1/ruta', { ...auth(await token('aud')), 'x-app-user': 'admin', 'x-app-permissions': 'catalogos:admin' }))
    const h = new Headers(w.upstreamCalls[0]!.init.headers)
    expect(h.get('x-app-user')).toBe('aud')
    expect(h.get('x-app-permissions')).not.toContain('catalogos:admin')
  })

  test('no devuelve cabeceras internas de la respuesta (set-cookie)', async () => {
    const { app, w, token } = await mundo()
    w.usuarios.set('op', { roles: ['operador'] })
    const res = await app.request(GET('/rest/v1/ruta', auth(await token('op'))))
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(res.headers.get('content-range')).toBe('0-0/0')
  })

  test('respeta la query original byte a byte y añade el filtro del cajero', async () => {
    const { app, w, token } = await mundo()
    w.usuarios.set('caj', { roles: ['cajero'] })
    const q = 'id=eq.5&nota=ilike.*a+b%20c*'
    const res = await app.request(new Request(`http://gw/rest/v1/movimiento?${q}`, { method: 'DELETE', headers: auth(await token('caj')) }))
    expect(res.status).toBe(200)
    expect(w.upstreamCalls[0]!.url).toBe(`http://db.test/rest/v1/movimiento?${q}&tipo=eq.DESPACHO`)
  })

  test('el cajero no puede crear una compra; el operador sí', async () => {
    const { app, w, token } = await mundo()
    w.usuarios.set('caj', { roles: ['cajero'] })
    w.usuarios.set('op', { roles: ['operador'] })
    const post = async (u: string) =>
      app.request(new Request('http://gw/rest/v1/movimiento', {
        method: 'POST', headers: { ...auth(await token(u)), 'content-type': 'application/json' },
        body: JSON.stringify({ tipo: 'COMPRA', litros: 5 }),
      }))
    expect((await post('caj')).status).toBe(403)
    expect(w.upstreamCalls.length).toBe(0)
    expect((await post('op')).status).toBe(200)
  })

  test('la auditoría se firma con el usuario del token', async () => {
    const { app, w, token } = await mundo()
    w.usuarios.set('aud', { roles: ['auditor'] })
    await app.request(new Request('http://gw/rest/v1/audit_log', {
      method: 'POST', headers: { ...auth(await token('aud')), 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'CREATE', entity_type: 'X', user_id: 'falso', user_email: 'falso@x.com' }),
    }))
    const enviado = JSON.parse(String(w.upstreamCalls[0]!.init.body))
    expect(enviado.user_id).toBe('aud')
    expect(enviado.user_email).toBe('aud@gmail.com')
  })

  test('usuario sin ningún permiso (pendiente/deshabilitado) → 403 NO_ACCESS', async () => {
    const { app, w, token } = await mundo()
    w.usuarios.set('pend', { roles: [] })
    const res = await app.request(GET('/rest/v1/ruta', auth(await token('pend'))))
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('NO_ACCESS')
  })

  test('token caducado → 401 TOKEN_EXPIRED', async () => {
    const { app, w, token } = await mundo()
    w.usuarios.set('op', { roles: ['operador'] })
    const res = await app.request(GET('/rest/v1/ruta', auth(await token('op', { exp: 1 }))))
    expect(res.status).toBe(401)
    expect((await res.json()).error.code).toBe('TOKEN_EXPIRED')
  })

  test('rpc/*, auth/v1, storage y el esquema OpenAPI no existen', async () => {
    const { app, w, token } = await mundo()
    w.usuarios.set('adm', { roles: ['admin'] })
    const t = await token('adm')
    for (const p of ['/rest/v1/rpc/get_or_create_user_role', '/rest/v1/', '/auth/v1/user', '/storage/v1/object/x', '/rest/v1/user_roles/x']) {
      expect((await app.request(GET(p, auth(t)))).status).toBe(404)
    }
    expect((await app.request(GET('/rest/v1/user_roles', auth(t)))).status).toBe(403)
    expect(w.upstreamCalls.length).toBe(0)
  })

  test('cuerpo demasiado grande → 413', async () => {
    const { app, w, token } = await mundo()
    w.usuarios.set('op', { roles: ['operador'] })
    const res = await app.request(new Request('http://gw/rest/v1/ruta', {
      method: 'POST', headers: { ...auth(await token('op')), 'content-type': 'application/json' },
      body: JSON.stringify({ x: 'a'.repeat(2000) }),
    }))
    expect(res.status).toBe(413)
  })

  test('CORS: solo los orígenes configurados', async () => {
    const { app } = await mundo()
    const ok = await app.request(new Request('http://gw/health', { headers: { origin: 'https://app.test' } }))
    const mal = await app.request(new Request('http://gw/health', { headers: { origin: 'https://evil.test' } }))
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://app.test')
    expect(mal.headers.get('access-control-allow-origin')).toBeNull()
  })

  test('/me devuelve roles y permisos', async () => {
    const { app, w, token } = await mundo()
    w.usuarios.set('caj', { roles: ['cajero'] })
    const res = await app.request(GET('/me', auth(await token('caj'))))
    const j = await res.json()
    expect(j.roles).toEqual(['cajero'])
    expect(j.permissions).toContain('movimiento:create_despacho')
    expect(j.permissions).not.toContain('movimiento:create')
  })
})

describe('resiliencia frente al identity server', () => {
  test('cachea permisos: una segunda petición no vuelve a preguntar', async () => {
    const { app, w, token } = await mundo()
    w.usuarios.set('op', { roles: ['operador'] })
    const t = await token('op')
    await app.request(GET('/rest/v1/ruta', auth(t)))
    const antes = w.isCalls.length
    await app.request(GET('/rest/v1/ruta', auth(t)))
    expect(w.isCalls.length).toBe(antes)
  })

  test('si el IS cae, usa los permisos conocidos (hasta el límite) y luego devuelve 502', async () => {
    const { app, w, token } = await mundo()
    w.usuarios.set('op', { roles: ['operador'] })
    const t = await token('op', { exp: Math.floor(w.now / 1000) + 10_000 })
    expect((await app.request(GET('/rest/v1/ruta', auth(t)))).status).toBe(200)
    w.usuarios.get('op')!.fail = 'down'
    w.now += 60_000 // caduca el TTL de 30 s
    expect((await app.request(GET('/rest/v1/ruta', auth(t)))).status).toBe(200) // stale
    w.now += 400_000 // más allá de TTL + stale
    const res = await app.request(GET('/rest/v1/ruta', auth(await token('op', { exp: Math.floor(w.now / 1000) + 300 }))))
    expect(res.status).toBe(502)
  })

  test('si el IS rechaza la sesión, se corta aunque hubiera caché', async () => {
    const { app, w, token } = await mundo()
    w.usuarios.set('op', { roles: ['operador'] })
    const t = await token('op', { exp: Math.floor(w.now / 1000) + 10_000 })
    expect((await app.request(GET('/rest/v1/ruta', auth(t)))).status).toBe(200)
    w.usuarios.get('op')!.fail = 'rejected'
    w.now += 60_000
    expect((await app.request(GET('/rest/v1/ruta', auth(t)))).status).toBe(401)
  })

  test('un IS caído sin caché previa nunca concede acceso', async () => {
    const { app, w, token } = await mundo()
    w.usuarios.set('nuevo', { roles: ['admin'], fail: 'down' })
    const res = await app.request(GET('/rest/v1/ruta', auth(await token('nuevo'))))
    expect(res.status).toBe(502)
    expect(w.upstreamCalls.length).toBe(0)
  })
})

describe('formato de los errores (lo que lee supabase-js)', () => {
  test('code y message van en el nivel superior, además de anidados', async () => {
    const { app, w, token } = await mundo()
    w.usuarios.set('aud', { roles: ['auditor'] })
    const casos: [Request, number, string][] = [
      [GET('/rest/v1/ruta'), 401, 'UNAUTHORIZED'],
      [new Request('http://gw/rest/v1/ruta', { method: 'POST', headers: { ...auth(await token('aud')), 'content-type': 'application/json' }, body: '{}' }), 403, 'FORBIDDEN'],
      [GET('/rest/v1/inexistente', auth(await token('aud'))), 403, 'FORBIDDEN'],
      [GET('/otra/cosa'), 404, 'NOT_FOUND'],
    ]
    for (const [req, estado, codigo] of casos) {
      const res = await app.request(req)
      const j = await res.json()
      expect(res.status).toBe(estado)
      expect(j.code).toBe(codigo)
      expect(typeof j.message).toBe('string')
      expect(j.message.length).toBeGreaterThan(0)
      expect(j.error).toEqual({ code: codigo, message: j.message })
    }
  })

  test('los fallos transitorios llevan un código que el cliente reconoce', async () => {
    const { app, w, token } = await mundo()
    w.usuarios.set('x', { roles: ['admin'], fail: 'down' })
    const caido = await (await app.request(GET('/rest/v1/ruta', auth(await token('x'))))).json()
    expect(caido.code).toBe('IS_UNAVAILABLE')
    w.usuarios.set('y', { roles: ['admin'] })
    const caduco = await (await app.request(GET('/rest/v1/ruta', auth(await token('y', { exp: 1 }))))).json()
    expect(caduco.code).toBe('TOKEN_EXPIRED')
  })
})
