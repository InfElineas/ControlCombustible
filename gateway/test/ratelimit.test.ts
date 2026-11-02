import { describe, expect, test } from 'bun:test'
import { createLimiter } from '../src/ratelimit'
import { mundo } from './helpers'

const auth = (t: string) => ({ authorization: `Bearer ${t}` })
const GET = (p: string, h: Record<string, string> = {}) => new Request(`http://gw${p}`, { headers: h })

describe('limitador', () => {
  test('cuenta por ventana y se reinicia', () => {
    let t = 0
    const l = createLimiter({ windowMs: 1000, now: () => t })
    expect(l.hit('k', 2).ok).toBe(true)
    expect(l.hit('k', 2).ok).toBe(true)
    const r = l.hit('k', 2)
    expect(r.ok).toBe(false)
    expect(r.retryAfterS).toBe(1)
    t = 1001
    expect(l.hit('k', 2).ok).toBe(true)
  })
  test('claves independientes y max <= 0 desactiva', () => {
    const l = createLimiter()
    expect(l.hit('a', 1).ok).toBe(true)
    expect(l.hit('a', 1).ok).toBe(false)
    expect(l.hit('b', 1).ok).toBe(true)
    for (let i = 0; i < 50; i++) expect(l.hit('libre', 0).ok).toBe(true)
  })
  test('no crece sin tope con claves aleatorias', () => {
    const l = createLimiter({ maxEntries: 100 })
    for (let i = 0; i < 5000; i++) l.hit(`k${i}`, 10)
    expect(l.size()).toBeLessThanOrEqual(100)
  })
  test('las ventanas caducadas se limpian', () => {
    let t = 0
    const l = createLimiter({ windowMs: 10, maxEntries: 50, now: () => t })
    for (let i = 0; i < 50; i++) l.hit(`k${i}`, 5)
    t = 100
    l.hit('nueva', 5)
    expect(l.size()).toBeLessThan(50)
  })
})

describe('límites en la pasarela', () => {
  test('un usuario autenticado recibe 429 con Retry-After al pasarse; otro no se ve afectado', async () => {
    const { app, w, token } = await mundo({ rateLimitUserPerMin: 3 })
    w.usuarios.set('a', { roles: ['operador'] })
    w.usuarios.set('b', { roles: ['operador'] })
    const ta = await token('a')
    for (let i = 0; i < 3; i++) expect((await app.request(GET('/rest/v1/ruta', auth(ta)))).status).toBe(200)
    const res = await app.request(GET('/rest/v1/ruta', auth(ta)))
    expect(res.status).toBe(429)
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0)
    const j = await res.json()
    expect(j.code).toBe('RATE_LIMITED')
    expect((await app.request(GET('/rest/v1/ruta', auth(await token('b'))))).status).toBe(200)
  })

  test('una oficina entera tras la misma IP no se bloquea mutuamente (el tráfico autenticado no cuenta por IP)', async () => {
    const { app, w, token } = await mundo({ rateLimitAnonPerMin: 2, rateLimitFailPerMin: 2, rateLimitUserPerMin: 1000, trustProxy: true })
    const ip = { 'x-forwarded-for': '203.0.113.7' }
    for (let u = 0; u < 20; u++) w.usuarios.set(`u${u}`, { roles: ['operador'] })
    for (let u = 0; u < 20; u++) {
      const res = await app.request(GET('/rest/v1/ruta', { ...auth(await token(`u${u}`)), ...ip }))
      expect(res.status).toBe(200)
    }
  })

  test('peticiones sin token: límite por IP; otra IP no se ve afectada', async () => {
    const { app } = await mundo({ rateLimitAnonPerMin: 2, trustProxy: true })
    const desde = (ip: string) => app.request(GET('/rest/v1/apk_version', { 'x-forwarded-for': ip }))
    expect((await desde('1.1.1.1')).status).toBe(200)
    expect((await desde('1.1.1.1')).status).toBe(200)
    expect((await desde('1.1.1.1')).status).toBe(429)
    expect((await desde('2.2.2.2')).status).toBe(200)
  })

  test('probar tokens falsos: tras N fallos la IP queda bloqueada (429) sin llegar a verificar', async () => {
    const { app } = await mundo({ rateLimitFailPerMin: 3, trustProxy: true })
    const ip = { 'x-forwarded-for': '9.9.9.9' }
    const falso = auth('a.b.c')
    for (let i = 0; i < 3; i++) expect((await app.request(GET('/rest/v1/ruta', { ...falso, ...ip }))).status).toBe(401)
    expect((await app.request(GET('/rest/v1/ruta', { ...falso, ...ip }))).status).toBe(429)
    // Otra IP sigue pudiendo equivocarse.
    expect((await app.request(GET('/rest/v1/ruta', { ...falso, 'x-forwarded-for': '8.8.8.8' }))).status).toBe(401)
  })

  test('un token caducado y legítimo del bloqueado no permite saltarse el límite', async () => {
    const { app, w, token } = await mundo({ rateLimitFailPerMin: 2, trustProxy: true })
    w.usuarios.set('op', { roles: ['operador'] })
    const ip = { 'x-forwarded-for': '7.7.7.7' }
    const caducado = await token('op', { exp: 1 })
    for (let i = 0; i < 2; i++) await app.request(GET('/rest/v1/ruta', { ...auth(caducado), ...ip }))
    // Aunque ahora traiga un token bueno, desde esa IP se espera a que pase la ventana.
    expect((await app.request(GET('/rest/v1/ruta', { ...auth(await token('op')), ...ip }))).status).toBe(429)
  })

  test('una caída del IS no cuenta como fallo del cliente', async () => {
    const { app, w, token } = await mundo({ rateLimitFailPerMin: 1, trustProxy: true })
    w.usuarios.set('x', { roles: ['admin'], fail: 'down' })
    const ip = { 'x-forwarded-for': '6.6.6.6' }
    for (let i = 0; i < 5; i++) expect((await app.request(GET('/rest/v1/ruta', { ...auth(await token('x')), ...ip }))).status).toBe(502)
  })

  test('sin trustProxy se ignora X-Forwarded-For (no se puede falsear la IP)', async () => {
    const { app } = await mundo({ rateLimitAnonPerMin: 2, trustProxy: false })
    for (let i = 0; i < 2; i++) await app.request(GET('/rest/v1/apk_version', { 'x-forwarded-for': `10.0.0.${i}` }))
    // Todas cuentan contra la misma IP real, por mucho que cambie la cabecera.
    expect((await app.request(GET('/rest/v1/apk_version', { 'x-forwarded-for': '10.0.0.99' }))).status).toBe(429)
  })

  test('0 desactiva los límites', async () => {
    const { app, w, token } = await mundo({ rateLimitUserPerMin: 0 })
    w.usuarios.set('a', { roles: ['operador'] })
    const t = await token('a')
    for (let i = 0; i < 30; i++) expect((await app.request(GET('/rest/v1/ruta', auth(t)))).status).toBe(200)
  })
})
