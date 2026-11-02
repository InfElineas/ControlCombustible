import { describe, expect, test } from 'bun:test'
import { rutaSegura } from '../src/storage'
import { mundo } from './helpers'

const auth = (t: string) => ({ authorization: `Bearer ${t}` })
const subir = (path: string, headers: Record<string, string>, body: string, method = 'POST') =>
  new Request(`http://gw/storage/v1/object/${path}`, { method, headers, body })

describe('rutaSegura', () => {
  test('acepta nombres normales', () => {
    expect(rutaSegura('3f2a-uuid.pdf')).toBe('3f2a-uuid.pdf')
    expect(rutaSegura('control-combustible-1.2.3-ab12cd34.apk')).toBe('control-combustible-1.2.3-ab12cd34.apk')
    expect(rutaSegura('carpeta/archivo con espacio.png')).toBe('carpeta/archivo%20con%20espacio.png')
  })
  test('rechaza recorridos de directorio y rarezas', () => {
    for (const r of ['', '..', '../x', 'a/../b', '%2e%2e/x', '..%2Fx', 'a//b', '/x', 'a\\b', 'a\0b', '.', 'a/./b', 'x'.repeat(201), 'a/b/c/d/e', 'a?b', 'a#b', 'a%']) {
      expect(rutaSegura(r)).toBeNull()
    }
  })
})

describe('subida', () => {
  test('el operador sube un adjunto: llega íntegro y con la service_role', async () => {
    const { app, w, token } = await mundo()
    w.usuarios.set('op', { roles: ['operador'] })
    const res = await app.request(subir('movimiento-adjuntos/abc.pdf',
      { ...auth(await token('op')), 'content-length': '5', 'content-type': 'application/pdf', 'x-upsert': 'false' }, 'HOLA!'))
    expect(res.status).toBe(200)
    const call = w.upstreamCalls[0]!
    expect(call.url).toBe('http://db.test/storage/v1/object/movimiento-adjuntos/abc.pdf')
    expect(call.bodyText).toBe('HOLA!')
    const h = new Headers(call.init.headers)
    expect(h.get('authorization')).toBe('Bearer SERVICE-KEY')
    expect(h.get('content-type')).toBe('application/pdf')
    expect(h.get('x-upsert')).toBe('false')
  })

  test('permisos por bucket: el auditor no sube adjuntos; el operador no sube APK', async () => {
    const { app, w, token } = await mundo()
    w.usuarios.set('aud', { roles: ['auditor'] })
    w.usuarios.set('op', { roles: ['operador'] })
    w.usuarios.set('adm', { roles: ['admin'] })
    const go = async (u: string, b: string) =>
      (await app.request(subir(`${b}/f.bin`, { ...auth(await token(u)), 'content-length': '3' }, 'abc'))).status
    expect(await go('aud', 'movimiento-adjuntos')).toBe(403)
    expect(await go('op', 'apk')).toBe(403)
    expect(await go('adm', 'apk')).toBe(200)
    expect(await go('op', 'movimiento-adjuntos')).toBe(200)
  })

  test('sin token → 401; bucket desconocido → 404', async () => {
    const { app, w, token } = await mundo()
    w.usuarios.set('adm', { roles: ['admin'] })
    expect((await app.request(subir('apk/f.bin', { 'content-length': '3' }, 'abc'))).status).toBe(401)
    expect((await app.request(subir('otro/f.bin', { ...auth(await token('adm')), 'content-length': '3' }, 'abc'))).status).toBe(404)
    expect(w.upstreamCalls.length).toBe(0)
  })

  test('límites de tamaño: 413 por Content-Length y corte si mienten', async () => {
    const { app, w, token } = await mundo()
    w.usuarios.set('op', { roles: ['operador'] })
    const t = await token('op')
    const grande = await app.request(subir('movimiento-adjuntos/f.bin', { ...auth(t), 'content-length': '101' }, 'x'.repeat(101)))
    expect(grande.status).toBe(413)
    expect(w.upstreamCalls.length).toBe(0)
    // Declara 10 bytes pero manda 500: el flujo se corta antes de llegar entero a Supabase.
    const miente = await app.request(subir('movimiento-adjuntos/f.bin', { ...auth(t), 'content-length': '10' }, 'x'.repeat(500)))
    expect(miente.status).toBeGreaterThanOrEqual(400)
  })

  test('sin Content-Length → 400', async () => {
    const { app, w, token } = await mundo()
    w.usuarios.set('op', { roles: ['operador'] })
    const res = await app.request(subir('movimiento-adjuntos/f.bin', auth(await token('op')), 'abc'))
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('LENGTH_REQUIRED')
  })

  test('rutas con recorrido de directorio se rechazan', async () => {
    const { app, w, token } = await mundo()
    w.usuarios.set('adm', { roles: ['admin'] })
    const t = await token('adm')
    for (const p of ['apk/..%2Fotro/f.bin', 'apk/%2e%2e/f.bin', 'apk/a%5Cb.bin']) {
      const res = await app.request(subir(p, { ...auth(t), 'content-length': '3' }, 'abc'))
      // 400 si llega a la ruta; 404 si el parseador de URL ya la normalizó a otra distinta.
      expect([400, 404]).toContain(res.status)
    }
    expect(w.upstreamCalls.length).toBe(0)
  })
})

describe('borrado', () => {
  const del = (path: string, headers: Record<string, string>, body?: unknown) =>
    new Request(`http://gw/storage/v1/object/${path}`, {
      method: 'DELETE', headers: { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    })

  test('varios archivos (prefixes) con permiso', async () => {
    const { app, w, token } = await mundo()
    w.usuarios.set('adm', { roles: ['admin'] })
    const res = await app.request(del('apk', auth(await token('adm')), { prefixes: ['a.apk', 'b.apk'] }))
    expect(res.status).toBe(200)
    expect(w.upstreamCalls[0]!.url).toBe('http://db.test/storage/v1/object/apk')
    expect(JSON.parse(String(w.upstreamCalls[0]!.init.body))).toEqual({ prefixes: ['a.apk', 'b.apk'] })
  })

  test('uno solo por ruta', async () => {
    const { app, w, token } = await mundo()
    w.usuarios.set('op', { roles: ['operador'] })
    expect((await app.request(del('movimiento-adjuntos/x.pdf', auth(await token('op'))))).status).toBe(200)
    expect(w.upstreamCalls[0]!.url).toBe('http://db.test/storage/v1/object/movimiento-adjuntos/x.pdf')
  })

  test('sin permiso, con rutas malas o con lista inválida se rechaza', async () => {
    const { app, w, token } = await mundo()
    w.usuarios.set('aud', { roles: ['auditor'] })
    w.usuarios.set('adm', { roles: ['admin'] })
    expect((await app.request(del('movimiento-adjuntos', auth(await token('aud')), { prefixes: ['a.pdf'] }))).status).toBe(403)
    const t = await token('adm')
    expect((await app.request(del('apk', auth(t), { prefixes: ['../x'] }))).status).toBe(400)
    expect((await app.request(del('apk', auth(t), { prefixes: [] }))).status).toBe(400)
    expect((await app.request(del('apk', auth(t), { prefixes: 'a' }))).status).toBe(400)
    expect((await app.request(del('apk', auth(t), { prefixes: Array(101).fill('a.apk') }))).status).toBe(400)
    expect(w.upstreamCalls.length).toBe(0)
  })
})

describe('lo que no existe', () => {
  test('descargas, listados y URL firmadas no pasan por la pasarela', async () => {
    const { app, w, token } = await mundo()
    w.usuarios.set('adm', { roles: ['admin'] })
    const t = await token('adm')
    for (const [m, p] of [['GET', '/storage/v1/object/public/apk/a.apk'], ['POST', '/storage/v1/object/list/apk'], ['POST', '/storage/v1/object/sign/apk/a.apk'], ['GET', '/storage/v1/bucket']] as const) {
      const res = await app.request(new Request(`http://gw${p}`, { method: m, headers: { ...auth(t), 'content-length': '0' } }))
      expect([404, 400, 403]).toContain(res.status)
    }
    expect(w.upstreamCalls.length).toBe(0)
  })

  test('CORS: supabase-js puede hacer la preflight con sus cabeceras', async () => {
    const { app } = await mundo()
    const res = await app.request(new Request('http://gw/rest/v1/ruta', {
      method: 'OPTIONS',
      headers: { origin: 'https://app.test', 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,content-type,x-client-info,apikey,prefer,x-upsert' },
    }))
    const permitidas = (res.headers.get('access-control-allow-headers') ?? '').toLowerCase()
    for (const h of ['x-client-info', 'x-upsert', 'apikey', 'prefer']) expect(permitidas).toContain(h)
  })
})
