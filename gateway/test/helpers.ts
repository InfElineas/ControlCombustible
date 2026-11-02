import { createApp } from '../src/app'
import type { Limiter } from '../src/ratelimit'
import { type Broker, type ChangeSource } from '../src/realtime'
import { permisosDe, type Rol } from '../src/catalogo'
import type { Config } from '../src/config'
import { createIdentity } from '../src/identity'
import { createVerifier } from '../src/jwt'

const enc = new TextEncoder()
const b64u = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const json = (o: unknown) => b64u(enc.encode(JSON.stringify(o)))

export async function newKey(kid = 'k1') {
  const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const jwk = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as JsonWebKey
  return { kid, privateKey: pair.privateKey, jwk: { ...jwk, kid, alg: 'EdDSA' } }
}
export type TestKey = Awaited<ReturnType<typeof newKey>>

export async function sign(
  key: TestKey,
  claims: Record<string, unknown>,
  header: Record<string, unknown> = {},
) {
  const h = json({ alg: 'EdDSA', kid: key.kid, typ: 'JWT', ...header })
  const p = json(claims)
  const sig = await crypto.subtle.sign({ name: 'Ed25519' }, key.privateKey, enc.encode(`${h}.${p}`))
  return `${h}.${p}.${b64u(sig)}`
}

export const NOW = 1_800_000_000_000 // ms, fijo
export const nowS = Math.floor(NOW / 1000)

export const CONFIG: Config = {
  port: 0,
  authBaseUrl: 'http://is.test',
  authJwksPath: '/api/auth/jwks',
  authIssuer: null,
  authAudience: null,
  authTimeoutMs: 1000,
  authClockToleranceS: 30,
  systemSlug: 'combustible',
  permissionTtlS: 30,
  permissionStaleS: 300,
  supabaseUrl: 'http://db.test',
  supabaseServiceKey: 'SERVICE-KEY',
  allowedOrigins: ['https://app.test'],
  maxBodyBytes: 1000,
  storageMaxAdjuntoBytes: 100,
  storageMaxApkBytes: 1000,
  // Muy altos por defecto: las pruebas de límites los bajan a propósito.
  rateLimitUserPerMin: 100_000,
  rateLimitAnonPerMin: 100_000,
  rateLimitFailPerMin: 100_000,
  trustProxy: false,
}

export interface World {
  key: TestKey
  /** Rol del usuario -> permisos que devolverá el IS. `null` = el IS falla. */
  usuarios: Map<string, { roles: Rol[]; fail?: 'down' | 'rejected' }>
  upstreamCalls: { url: string; init: RequestInit; bodyText?: string }[]
  isCalls: string[]
  jwksCalls: number
  now: number
}

/** Origen de cambios simulado. */
export function fuenteFalsa() {
  let alCambiar: ((t: string) => void) | null = null
  const f = {
    arrancada: 0,
    parada: 0,
    emitir: (t: string) => alCambiar?.(t),
    source: {
      start(cb) { f.arrancada++; alCambiar = cb },
      stop() { f.parada++; alCambiar = null },
    } as ChangeSource,
  }
  return f
}

export async function mundo(overrides: Partial<Config> = {}, opciones: { broker?: Broker; limiter?: Limiter } = {}) {
  const key = await newKey()
  const w: World = { key, usuarios: new Map(), upstreamCalls: [], isCalls: [], jwksCalls: 0, now: NOW }
  const config = { ...CONFIG, ...overrides }

  const isFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/api/auth/jwks')) {
      w.jwksCalls++
      return Response.json({ keys: [w.key.jwk] })
    }
    w.isCalls.push(url)
    const token = new Headers(init?.headers).get('authorization')?.replace('Bearer ', '') ?? ''
    const sub = JSON.parse(atob(token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'))).sub as string
    const u = w.usuarios.get(sub)
    if (!u || u.fail === 'down') throw new Error('IS caído')
    if (u.fail === 'rejected') return new Response('{}', { status: 401 })
    if (url.includes('/permissions/me')) {
      const perms = new Set<string>()
      for (const r of u.roles) for (const p of permisosDe(r)) perms.add(p)
      return Response.json({
        permissions: [...perms].map((p) => ({ resource: p.split(':')[0], action: p.split(':')[1] })),
      })
    }
    return Response.json({ roles: u.roles.map((name) => ({ name })) })
  }) as typeof fetch

  const upstream = (async (url: string, init: RequestInit) => {
    const body = init.body
    let bodyText: string | undefined
    if (body && typeof body === 'object' && 'getReader' in body) {
      bodyText = await new Response(body as ReadableStream).text() // consume el flujo (y dispara el límite)
    }
    w.upstreamCalls.push({ url: String(url), init, bodyText })
    return new Response('[]', { status: 200, headers: { 'content-type': 'application/json', 'content-range': '0-0/0', 'set-cookie': 'x=1' } })
  }) as unknown as typeof fetch

  const verify = createVerifier({
    jwksUrl: `${config.authBaseUrl}${config.authJwksPath}`,
    issuer: config.authIssuer,
    audience: config.authAudience,
    clockToleranceS: config.authClockToleranceS,
    timeoutMs: 1000,
    fetchImpl: isFetch,
    now: () => w.now,
  })
  const identity = createIdentity({
    baseUrl: config.authBaseUrl,
    systemSlug: config.systemSlug,
    ttlMs: config.permissionTtlS * 1000,
    staleMs: config.permissionStaleS * 1000,
    timeoutMs: 1000,
    fetchImpl: isFetch,
    now: () => w.now,
  })
  const app = createApp({ config, verify, identity, upstream, broker: opciones.broker, limiter: opciones.limiter })

  /** Token válido para `sub`. */
  const token = (sub: string, extra: Record<string, unknown> = {}) =>
    sign(key, { sub, email: `${sub}@gmail.com`, name: sub, exp: nowS + 300, iat: nowS, ...extra })

  return { w, app, token, config }
}
