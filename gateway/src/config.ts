/** Configuración leída del entorno. Falla al arrancar si falta algo obligatorio. */
export interface Config {
  port: number
  /** URL base de elineas-auth (sin barra final). */
  authBaseUrl: string
  authJwksPath: string
  /** Si se define, el claim `iss` debe coincidir. */
  authIssuer: string | null
  authAudience: string | null
  authTimeoutMs: number
  authClockToleranceS: number
  /** Slug del sistema registrado en elineas-auth. */
  systemSlug: string
  /** Segundos que se cachean los permisos de un usuario. */
  permissionTtlS: number
  /** Segundos durante los que se sirven permisos caducados si el IS no responde. */
  permissionStaleS: number
  supabaseUrl: string
  supabaseServiceKey: string
  allowedOrigins: string[]
  maxBodyBytes: number
  /** Tope de una subida al bucket de adjuntos de movimientos. */
  storageMaxAdjuntoBytes: number
  /** Tope de una subida de APK. */
  storageMaxApkBytes: number
  /** Peticiones por minuto de un usuario autenticado (0 = sin límite). */
  rateLimitUserPerMin: number
  /** Peticiones por minuto de una IP sin token. */
  rateLimitAnonPerMin: number
  /** Intentos fallidos de autenticación por minuto de una IP. */
  rateLimitFailPerMin: number
  /** Confiar en X-Forwarded-For (solo detrás de un proxy propio que lo fije). */
  trustProxy: boolean
}

function required(env: Record<string, string | undefined>, key: string): string {
  const value = env[key]?.trim()
  if (!value) throw new Error(`Falta la variable de entorno ${key}`)
  return value
}

function int(env: Record<string, string | undefined>, key: string, fallback: number): number {
  const raw = env[key]?.trim()
  if (!raw) return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 0) throw new Error(`${key} debe ser un entero >= 0`)
  return n
}

const stripSlash = (s: string) => s.replace(/\/+$/, '')

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  return {
    port: int(env, 'PORT', 3010),
    authBaseUrl: stripSlash(required(env, 'AUTH_BASE_URL')),
    authJwksPath: env.AUTH_JWKS_PATH?.trim() || '/api/auth/jwks',
    authIssuer: env.AUTH_ISSUER?.trim() || null,
    authAudience: env.AUTH_AUDIENCE?.trim() || null,
    authTimeoutMs: int(env, 'AUTH_TIMEOUT_MS', 8000),
    authClockToleranceS: int(env, 'AUTH_CLOCK_TOLERANCE', 30),
    systemSlug: env.SYSTEM_SLUG?.trim() || 'combustible',
    permissionTtlS: int(env, 'PERMISSION_TTL_S', 30),
    permissionStaleS: int(env, 'PERMISSION_STALE_S', 300),
    supabaseUrl: stripSlash(required(env, 'SUPABASE_URL')),
    supabaseServiceKey: required(env, 'SUPABASE_SERVICE_ROLE_KEY'),
    allowedOrigins: required(env, 'ALLOWED_ORIGIN')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    maxBodyBytes: int(env, 'MAX_BODY_BYTES', 2_000_000),
    storageMaxAdjuntoBytes: int(env, 'STORAGE_MAX_ADJUNTO_BYTES', 10 * 1024 * 1024),
    storageMaxApkBytes: int(env, 'STORAGE_MAX_APK_BYTES', 200 * 1024 * 1024),
    rateLimitUserPerMin: int(env, 'RATE_LIMIT_USER_PER_MIN', 900),
    rateLimitAnonPerMin: int(env, 'RATE_LIMIT_ANON_PER_MIN', 120),
    rateLimitFailPerMin: int(env, 'RATE_LIMIT_FAIL_PER_MIN', 30),
    trustProxy: /^(1|true|yes)$/i.test(env.TRUST_PROXY?.trim() ?? ''),
  }
}
