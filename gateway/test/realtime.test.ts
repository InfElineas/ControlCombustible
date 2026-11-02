import { describe, expect, test } from 'bun:test'
import { createBroker } from '../src/realtime'
import { fuenteFalsa, mundo } from './helpers'

const auth = (t: string) => ({ authorization: `Bearer ${t}` })

/** Lee del flujo SSE hasta tener `n` fragmentos (o cerrarse). */
async function leer(res: Response, n: number) {
  const r = res.body!.getReader()
  const dec = new TextDecoder()
  const out: string[] = []
  while (out.length < n) {
    const { value, done } = await r.read()
    if (done) break
    out.push(dec.decode(value))
  }
  return { out, r }
}

describe('broker', () => {
  test('arranca la fuente con el primer cliente y la para con el último', () => {
    const f = fuenteFalsa()
    const b = createBroker({ source: f.source, heartbeatMs: 1_000_000 })
    const baja1 = b.subscribe({ send() {}, close() {} })!
    const baja2 = b.subscribe({ send() {}, close() {} })!
    expect(f.arrancada).toBe(1)
    baja1()
    expect(f.parada).toBe(0)
    baja2()
    expect(f.parada).toBe(1)
  })

  test('reparte solo el nombre de la tabla a todos los clientes', () => {
    const f = fuenteFalsa()
    const b = createBroker({ source: f.source, heartbeatMs: 1_000_000 })
    const a: string[] = []
    const c: string[] = []
    b.subscribe({ send: (x) => a.push(x), close() {} })
    b.subscribe({ send: (x) => c.push(x), close() {} })
    f.emitir('movimiento')
    expect(a).toEqual(['data: {"tabla":"movimiento"}\n\n'])
    expect(c).toEqual(a)
    b.shutdown()
  })

  test('un cliente roto no afecta a los demás', () => {
    const f = fuenteFalsa()
    const b = createBroker({ source: f.source, heartbeatMs: 1_000_000 })
    const ok: string[] = []
    b.subscribe({ send() { throw new Error('socket cerrado') }, close() {} })
    b.subscribe({ send: (x) => ok.push(x), close() {} })
    f.emitir('ruta')
    expect(ok.length).toBe(1)
    expect(b.size()).toBe(1)
    b.shutdown()
  })

  test('límite de clientes', () => {
    const b = createBroker({ source: fuenteFalsa().source, maxClients: 2, heartbeatMs: 1_000_000 })
    expect(b.subscribe({ send() {}, close() {} })).not.toBeNull()
    expect(b.subscribe({ send() {}, close() {} })).not.toBeNull()
    expect(b.subscribe({ send() {}, close() {} })).toBeNull()
    b.shutdown()
  })

  test('latido periódico', async () => {
    const f = fuenteFalsa()
    const b = createBroker({ source: f.source, heartbeatMs: 20 })
    const got: string[] = []
    b.subscribe({ send: (x) => got.push(x), close() {} })
    await new Promise((r) => setTimeout(r, 70))
    expect(got.filter((x) => x === ': ping\n\n').length).toBeGreaterThanOrEqual(2)
    b.shutdown()
  })
})

describe('GET /events', () => {
  test('sin sesión → 401; sin acceso al sistema → 403; sin broker no existe', async () => {
    const f = fuenteFalsa()
    const { app, w, token } = await mundo({}, { broker: createBroker({ source: f.source }) })
    w.usuarios.set('pend', { roles: [] })
    expect((await app.request('http://gw/events')).status).toBe(401)
    expect((await app.request(new Request('http://gw/events', { headers: auth(await token('pend')) }))).status).toBe(403)
    expect(f.arrancada).toBe(0)

    const sin = await mundo()
    expect((await sin.app.request('http://gw/events')).status).toBe(404)
  })

  test('un usuario conectado recibe ready y los avisos de cambio', async () => {
    const f = fuenteFalsa()
    const broker = createBroker({ source: f.source, heartbeatMs: 1_000_000 })
    const { app, w, token } = await mundo({}, { broker })
    w.usuarios.set('aud', { roles: ['auditor'] })
    const res = await app.request(new Request('http://gw/events', { headers: auth(await token('aud')) }))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    expect(res.headers.get('cache-control')).toContain('no-cache')
    const lector = leer(res, 2)
    await new Promise((r) => setTimeout(r, 10))
    f.emitir('venta_trabajador')
    const { out, r } = await lector
    expect(out[0]).toContain('event: ready')
    expect(out[1]).toBe('data: {"tabla":"venta_trabajador"}\n\n')
    // Los avisos nunca llevan datos de filas.
    expect(out.join('')).not.toMatch(/litros|monto|record|new|old/i)
    await r.cancel()
    expect(broker.size()).toBe(0)
    expect(f.parada).toBe(1)
  })

  test('al cancelar el cliente se libera su suscripción', async () => {
    const f = fuenteFalsa()
    const broker = createBroker({ source: f.source, heartbeatMs: 1_000_000 })
    const { app, w, token } = await mundo({}, { broker })
    w.usuarios.set('op', { roles: ['operador'] })
    const res = await app.request(new Request('http://gw/events', { headers: auth(await token('op')) }))
    const { r } = await leer(res, 1)
    expect(broker.size()).toBe(1)
    await r.cancel()
    expect(broker.size()).toBe(0)
  })

  test('el servidor llena: avisa con event: busy y cierra', async () => {
    const f = fuenteFalsa()
    const broker = createBroker({ source: f.source, maxClients: 0 })
    const { app, w, token } = await mundo({}, { broker })
    w.usuarios.set('op', { roles: ['operador'] })
    const res = await app.request(new Request('http://gw/events', { headers: auth(await token('op')) }))
    const { out } = await leer(res, 1)
    expect(out[0]).toContain('event: busy')
  })

  test('la conexión se cierra cuando caduca el JWT con el que se abrió', async () => {
    const f = fuenteFalsa()
    const broker = createBroker({ source: f.source, heartbeatMs: 1_000_000 })
    const { app, w, token } = await mundo({ authClockToleranceS: 0 }, { broker })
    w.usuarios.set('op', { roles: ['operador'] })
    w.now = Date.now()
    const t = await token('op', { exp: Math.floor(Date.now() / 1000) + 2 })
    const res = await app.request(new Request('http://gw/events', { headers: auth(t) }))
    const r = res.body!.getReader()
    await r.read() // ready
    const inicio = Date.now()
    const fin = await r.read() // esperar al cierre
    expect(fin.done).toBe(true)
    expect(Date.now() - inicio).toBeGreaterThanOrEqual(500)
    expect(Date.now() - inicio).toBeLessThan(5000)
    expect(broker.size()).toBe(0)
  })
})
