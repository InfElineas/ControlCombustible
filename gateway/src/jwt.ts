/**
 * Verificación de JWT de elineas-auth.
 *
 * Solo se acepta EdDSA (Ed25519), el algoritmo que emite el IS. Cualquier otro
 * —incluidos `none` y HS256— se rechaza: aceptar más algoritmos de los que se
 * usan solo amplía la superficie de ataque (confusión de algoritmo).
 *
 * Se verifica en local contra el JWKS, cacheado. Un `kid` desconocido provoca
 * UNA recarga del JWKS (rotación de claves), pero como mucho una cada
 * `minRefreshMs`: sin ese límite, un atacante que mande tokens con `kid`
 * aleatorios obligaría a descargar el JWKS en cada petición.
 */
import { errors } from './errors'

interface Jwk {
  kty: string
  kid?: string
  crv?: string
  x?: string
}

export interface Claims {
  sub: string
  exp: number
  email?: string
  name?: string
  iss?: string
  aud?: string | string[]
  [claim: string]: unknown
}

export interface VerifierOptions {
  jwksUrl: string
  issuer: string | null
  audience: string | null
  clockToleranceS: number
  timeoutMs: number
  /** Vida de la copia del JWKS. */
  jwksTtlMs?: number
  /** Mínimo entre dos recargas forzadas por `kid` desconocido. */
  minRefreshMs?: number
  fetchImpl?: typeof fetch
  now?: () => number
}

const decoder = new TextDecoder()

function base64UrlToBytes(input: string): Uint8Array<ArrayBuffer> {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  let binary: string
  try {
    binary = atob(padded)
  } catch {
    throw errors.unauthorized('El token no es un JWT válido', 'TOKEN_INVALID')
  }
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function decodeJson<T>(segment: string): T {
  try {
    return JSON.parse(decoder.decode(base64UrlToBytes(segment))) as T
  } catch {
    throw errors.unauthorized('El token no es un JWT válido', 'TOKEN_INVALID')
  }
}

export function createVerifier(options: VerifierOptions) {
  const fetchImpl = options.fetchImpl ?? fetch
  const now = options.now ?? (() => Date.now())
  const jwksTtlMs = options.jwksTtlMs ?? 600_000
  const minRefreshMs = options.minRefreshMs ?? 10_000

  let keys: Jwk[] = []
  let fetchedAt = 0
  let lastForcedAt = 0
  let inFlight: Promise<void> | null = null
  const imported = new Map<string, CryptoKey>()

  async function download(): Promise<void> {
    let response: Response
    try {
      response = await fetchImpl(options.jwksUrl, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(options.timeoutMs),
      })
    } catch {
      throw errors.upstream('No se pudo obtener el JWKS del identity server', 'IS_UNAVAILABLE')
    }
    if (!response.ok) {
      throw errors.upstream(`El JWKS respondió ${response.status}`, 'IS_UNAVAILABLE')
    }
    const body = (await response.json()) as { keys?: Jwk[] }
    if (!Array.isArray(body.keys) || body.keys.length === 0) {
      throw errors.upstream('El JWKS no contiene claves', 'IS_UNAVAILABLE')
    }
    keys = body.keys
    imported.clear()
    fetchedAt = now()
  }

  /** Descarga compartida: peticiones concurrentes esperan la misma. */
  function refresh(): Promise<void> {
    inFlight ??= download().finally(() => {
      inFlight = null
    })
    return inFlight
  }

  async function keyFor(kid: string | undefined): Promise<CryptoKey> {
    if (keys.length === 0 || now() - fetchedAt > jwksTtlMs) await refresh()

    const find = () =>
      kid ? keys.find((k) => k.kid === kid) : keys.length === 1 ? keys[0] : undefined

    let jwk = find()
    if (!jwk && now() - lastForcedAt >= minRefreshMs) {
      lastForcedAt = now()
      await refresh()
      jwk = find()
    }
    if (!jwk) throw errors.unauthorized('Clave de firma desconocida', 'TOKEN_INVALID')
    if (jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519' || !jwk.x) {
      throw errors.unauthorized('Clave de firma no soportada', 'TOKEN_INVALID')
    }

    const cacheKey = jwk.kid ?? 'default'
    const cached = imported.get(cacheKey)
    if (cached) return cached
    // Solo el material de la clave: el JWK trae `alg: "EdDSA"` y WebCrypto espera otra cosa.
    const key = await crypto.subtle.importKey(
      'jwk',
      { kty: 'OKP', crv: 'Ed25519', x: jwk.x },
      { name: 'Ed25519' },
      false,
      ['verify'],
    )
    imported.set(cacheKey, key)
    return key
  }

  return async function verify(token: string): Promise<Claims> {
    const parts = token.split('.')
    if (parts.length !== 3) throw errors.unauthorized('El token no es un JWT válido', 'TOKEN_INVALID')
    const [headerB64, payloadB64, signatureB64] = parts as [string, string, string]

    const header = decodeJson<{ alg?: string; kid?: string }>(headerB64)
    if (header.alg !== 'EdDSA') {
      throw errors.unauthorized('Algoritmo de firma no admitido', 'TOKEN_INVALID')
    }

    const key = await keyFor(header.kid)
    const valid = await crypto.subtle.verify(
      { name: 'Ed25519' },
      key,
      base64UrlToBytes(signatureB64),
      new TextEncoder().encode(`${headerB64}.${payloadB64}`),
    )
    if (!valid) throw errors.unauthorized('La firma del token no es válida', 'TOKEN_INVALID')

    const claims = decodeJson<Partial<Claims>>(payloadB64)
    const nowS = Math.floor(now() / 1000)
    const skew = options.clockToleranceS

    // `exp` es obligatorio: un token sin caducidad valdría para siempre.
    if (typeof claims.exp !== 'number') {
      throw errors.unauthorized('El token no tiene caducidad', 'TOKEN_INVALID')
    }
    if (claims.exp + skew < nowS) throw errors.unauthorized('El token ha caducado', 'TOKEN_EXPIRED')
    if (typeof claims.nbf === 'number' && claims.nbf - skew > nowS) {
      throw errors.unauthorized('El token todavía no es válido', 'TOKEN_INVALID')
    }
    if (options.issuer && claims.iss !== options.issuer) {
      throw errors.unauthorized('Emisor no autorizado', 'TOKEN_INVALID')
    }
    if (options.audience) {
      const aud = claims.aud
      const ok = Array.isArray(aud) ? aud.includes(options.audience) : aud === options.audience
      if (!ok) throw errors.unauthorized('El token no es para esta API', 'TOKEN_INVALID')
    }
    if (typeof claims.sub !== 'string' || !claims.sub) {
      throw errors.unauthorized('El token no identifica a ningún usuario', 'TOKEN_INVALID')
    }
    return claims as Claims
  }
}

export type Verifier = ReturnType<typeof createVerifier>
