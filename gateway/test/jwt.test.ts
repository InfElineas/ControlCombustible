import { describe, expect, test } from 'bun:test'
import { createVerifier } from '../src/jwt'
import { NOW, newKey, nowS, sign } from './helpers'

async function setup(extra: { issuer?: string; audience?: string } = {}) {
  const key = await newKey()
  let calls = 0
  let clock = NOW
  const verify = createVerifier({
    jwksUrl: 'http://is.test/jwks',
    issuer: extra.issuer ?? null,
    audience: extra.audience ?? null,
    clockToleranceS: 30,
    timeoutMs: 1000,
    minRefreshMs: 10_000,
    fetchImpl: (async () => {
      calls++
      return Response.json({ keys: [key.jwk] })
    }) as unknown as typeof fetch,
    now: () => clock,
  })
  return { key, verify, calls: () => calls, tick: (ms: number) => (clock += ms) }
}
const claims = (o: Record<string, unknown> = {}) => ({ sub: 'u1', exp: nowS + 300, ...o })

describe('verificación de JWT', () => {
  test('acepta un token válido', async () => {
    const { key, verify } = await setup()
    expect((await verify(await sign(key, claims()))).sub).toBe('u1')
  })

  test('rechaza un token caducado (tolerancia 30 s)', async () => {
    const { key, verify } = await setup()
    await expect(verify(await sign(key, claims({ exp: nowS - 31 })))).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' })
    expect((await verify(await sign(key, claims({ exp: nowS - 10 })))).sub).toBe('u1')
  })

  test('exige exp y sub', async () => {
    const { key, verify } = await setup()
    await expect(verify(await sign(key, { sub: 'u1' }))).rejects.toMatchObject({ status: 401 })
    await expect(verify(await sign(key, { exp: nowS + 5 }))).rejects.toMatchObject({ status: 401 })
  })

  test('rechaza firma de otra clave y payload manipulado', async () => {
    const { key, verify } = await setup()
    const otra = await newKey('k1') // mismo kid, otra clave
    await expect(verify(await sign(otra, claims()))).rejects.toMatchObject({ status: 401 })
    const t = (await sign(key, claims())).split('.')
    const forjado = Buffer.from(JSON.stringify(claims({ sub: 'admin' }))).toString('base64url')
    await expect(verify(`${t[0]}.${forjado}.${t[2]}`)).rejects.toMatchObject({ status: 401 })
  })

  test('solo EdDSA: none, HS256 y RS256 se rechazan', async () => {
    const { key, verify } = await setup()
    for (const alg of ['none', 'HS256', 'RS256', 'ES256']) {
      await expect(verify(await sign(key, claims(), { alg }))).rejects.toMatchObject({ status: 401 })
    }
    const h = Buffer.from('{"alg":"none"}').toString('base64url')
    const p = Buffer.from(JSON.stringify(claims())).toString('base64url')
    await expect(verify(`${h}.${p}.`)).rejects.toMatchObject({ status: 401 })
  })

  test('basura que no es un JWT', async () => {
    const { verify } = await setup()
    for (const t of ['', 'abc', 'a.b', 'a.b.c.d', '....', '%%%.%%%.%%%']) {
      await expect(verify(t)).rejects.toMatchObject({ status: 401 })
    }
  })

  test('emisor y audiencia, si están configurados', async () => {
    const { key, verify } = await setup({ issuer: 'https://is', audience: 'combustible' })
    expect((await verify(await sign(key, claims({ iss: 'https://is', aud: ['x', 'combustible'] })))).sub).toBe('u1')
    await expect(verify(await sign(key, claims({ iss: 'https://otro', aud: 'combustible' })))).rejects.toMatchObject({ status: 401 })
    await expect(verify(await sign(key, claims({ iss: 'https://is', aud: 'otra' })))).rejects.toMatchObject({ status: 401 })
    await expect(verify(await sign(key, claims({ iss: 'https://is' })))).rejects.toMatchObject({ status: 401 })
  })

  test('descarga el JWKS una vez y lo reutiliza', async () => {
    const { key, verify, calls } = await setup()
    for (let i = 0; i < 20; i++) await verify(await sign(key, claims()))
    expect(calls()).toBe(1)
  })

  test('un kid desconocido NO fuerza una descarga por petición (anti-abuso)', async () => {
    const { key, verify, calls } = await setup()
    await verify(await sign(key, claims()))
    for (let i = 0; i < 50; i++) {
      await expect(verify(await sign(key, claims(), { kid: `falso-${i}` }))).rejects.toMatchObject({ status: 401 })
    }
    expect(calls()).toBeLessThanOrEqual(2) // la inicial + como mucho una recarga
  })

  test('rotación de claves: un kid nuevo provoca una recarga y se acepta', async () => {
    const k1 = await newKey('k1')
    const k2 = await newKey('k2')
    let keys = [k1.jwk]
    let clock = NOW
    const verify = createVerifier({
      jwksUrl: 'http://is.test/jwks', issuer: null, audience: null, clockToleranceS: 30, timeoutMs: 1000,
      fetchImpl: (async () => Response.json({ keys })) as unknown as typeof fetch, now: () => clock,
    })
    await verify(await sign(k1, claims()))
    keys = [k1.jwk, k2.jwk]
    clock += 11_000
    expect((await verify(await sign(k2, claims()))).sub).toBe('u1')
  })
})
