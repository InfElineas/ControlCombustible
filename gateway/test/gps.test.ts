import { describe, expect, test } from 'bun:test'
import { mundo } from './helpers'

const auth = (t: string) => ({ authorization: `Bearer ${t}` })
const gps = (path: string, headers: Record<string, string> = {}) =>
  new Request(`http://gw/functions/v1/gps-proxy?path=${encodeURIComponent(path)}`, { headers })

describe('gps-proxy a través de la pasarela', () => {
  test('cualquier rol con acceso puede consultar; se llama con la service_role', async () => {
    const { app, w, token } = await mundo()
    w.usuarios.set('aud', { roles: ['auditor'] })
    const res = await app.request(gps('/reports/summary?deviceId=1&from=2026-01-01T00%3A00%3A00Z', auth(await token('aud'))))
    expect(res.status).toBe(200)
    const call = w.upstreamCalls[0]!
    expect(call.url).toContain('http://db.test/functions/v1/gps-proxy?path=%2Freports%2Fsummary%3FdeviceId%3D1')
    expect(new Headers(call.init.headers).get('authorization')).toBe('Bearer SERVICE-KEY')
  })

  test('sin sesión → 401; sin acceso al sistema → 403', async () => {
    const { app, w, token } = await mundo()
    w.usuarios.set('pend', { roles: [] })
    expect((await app.request(gps('/devices'))).status).toBe(401)
    expect((await app.request(gps('/devices', auth(await token('pend'))))).status).toBe(403)
    expect(w.upstreamCalls.length).toBe(0)
  })

  test('solo rutas de Traccar permitidas', async () => {
    const { app, w, token } = await mundo()
    w.usuarios.set('adm', { roles: ['admin'] })
    const t = await token('adm')
    for (const ok of ['/devices', '/positions', '/positions?deviceId=3', '/reports/route?deviceId=1']) {
      expect((await app.request(gps(ok, auth(t)))).status).toBe(200)
    }
    for (const mal of ['/users', '/server', '/devices/../users', '/positionsx', '//evil', '/devices#x', 'http://evil/x', '/commands/send', '/session']) {
      expect((await app.request(gps(mal, auth(t)))).status).toBe(403)
    }
  })

  test('por defecto consulta /devices', async () => {
    const { app, w, token } = await mundo()
    w.usuarios.set('op', { roles: ['operador'] })
    const res = await app.request(new Request('http://gw/functions/v1/gps-proxy', { headers: auth(await token('op')) }))
    expect(res.status).toBe(200)
    expect(w.upstreamCalls[0]!.url).toContain('path=%2Fdevices')
  })
})
