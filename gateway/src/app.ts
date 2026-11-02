import { Hono, type Context } from 'hono'
import { getConnInfo } from 'hono/bun'
import { cors } from 'hono/cors'
import type { Config } from './config'
import { HttpError, cuerpoError, errors } from './errors'
import type { Identity } from './identity'
import type { Verifier } from './jwt'
import { autorizar, type Actor } from './rules'
import { createLimiter, type Limiter } from './ratelimit'
import type { Broker } from './realtime'
import { buckets, limitarFlujo, rutaSegura } from './storage'

export interface Deps {
  config: Config
  verify: Verifier
  identity: Identity
  /** `fetch` hacia Supabase; inyectable para las pruebas. */
  upstream?: typeof fetch
  /** Reparte los avisos de cambios por SSE. Sin él, /events no existe. */
  broker?: Broker
  limiter?: Limiter
}

/** Cabeceras de la petición que se reenvían a PostgREST. El resto se descarta. */
const REENVIAR = ['content-type', 'accept', 'prefer', 'range', 'range-unit']
/** Cabeceras de la respuesta de PostgREST que se devuelven al cliente. */
const DEVOLVER = ['content-type', 'content-range', 'preference-applied', 'content-location', 'location']

function bearer(header: string | undefined): string | null {
  const m = header ? /^Bearer\s+(.+)$/i.exec(header.trim()) : null
  return m?.[1]?.trim() || null
}

export function createApp(deps: Deps) {
  const { config, verify, identity } = deps
  const upstream = deps.upstream ?? fetch
  const limiter = deps.limiter ?? createLimiter()
  const app = new Hono()

  app.use(
    '*',
    cors({
      origin: (origin) => (config.allowedOrigins.includes(origin) ? origin : null),
      allowMethods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: [
        'authorization', 'content-type', 'prefer', 'range', 'range-unit', 'accept', 'apikey',
        // las envía supabase-js
        'x-client-info', 'x-upsert', 'cache-control', 'accept-profile', 'content-profile',
      ],
      exposeHeaders: ['content-range', 'preference-applied'],
      maxAge: 600,
    }),
  )

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      if (err.retryAfterS) c.header('Retry-After', String(err.retryAfterS))
      return c.json(cuerpoError(err.code, err.message), err.status)
    }
    console.error('error no controlado', err)
    return c.json(cuerpoError('INTERNAL', 'Error interno'), 500 as never)
  })

  app.get('/health', (c) => c.json({ ok: true }))

  /** IP del cliente. Detrás de un proxy propio hay que confiar en X-Forwarded-For. */
  function ipDe(c: Context): string {
    if (config.trustProxy) {
      const xff = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
      if (xff) return xff
    }
    try {
      // Una IPv4 puede llegar como `::ffff:1.2.3.4`: se normaliza para que un mismo
      // cliente no tenga dos cubos distintos.
      return (getConnInfo(c).remote.address ?? 'desconocida').replace(/^::ffff:/i, '')
    } catch {
      return 'desconocida'
    }
  }

  function limitar(clave: string, max: number, mensaje: string) {
    const r = limiter.hit(clave, max)
    if (!r.ok) throw new HttpError(429, 'RATE_LIMITED', mensaje, r.retryAfterS)
  }

  /** Autentica (si hay token) y resuelve permisos. */
  async function identificar(c: Context) {
    const token = bearer(c.req.header('authorization'))
    const ip = ipDe(c)
    if (!token) {
      limitar(`anon:${ip}`, config.rateLimitAnonPerMin, 'Demasiadas peticiones sin sesión')
      return { actor: null, access: null, exp: 0 }
    }
    // Antes de verificar: quien ya acumuló fallos no sigue probando tokens.
    if (limiter.peek(`fail:${ip}`) >= config.rateLimitFailPerMin && config.rateLimitFailPerMin > 0) {
      limitar(`fail:${ip}`, config.rateLimitFailPerMin, 'Demasiados intentos con un token inválido')
    }
    let claims
    try {
      claims = await verify(token)
    } catch (e) {
      // Solo los rechazos del token cuentan; una caída del IS no es culpa del cliente.
      if (e instanceof HttpError && e.status === 401) limiter.hit(`fail:${ip}`, config.rateLimitFailPerMin)
      throw e
    }
    limitar(`user:${claims.sub}`, config.rateLimitUserPerMin, 'Demasiadas peticiones. Espera un momento.')
    const access = await identity.access(claims.sub, token)
    // Sin ningún permiso en este sistema = sin acceso (equivale al antiguo estado
    // 'pending'/'disabled'): el IS lo expresa dejando al usuario sin rol.
    if (access.permissions.size === 0) {
      throw errors.forbidden('Su usuario no tiene acceso a este sistema', 'NO_ACCESS')
    }
    const exp = claims.exp
    const actor: Actor = {
      sub: claims.sub,
      email: typeof claims.email === 'string' ? claims.email : null,
      name: typeof claims.name === 'string' ? claims.name : null,
    }
    return { actor, access, exp }
  }

  /** Quién soy y qué puedo hacer: alimenta useUserRole en el frontend. */
  app.get('/me', async (c) => {
    const { actor, access } = await identificar(c)
    if (!actor || !access) throw errors.unauthorized('Se requiere iniciar sesión')
    return c.json({
      sub: actor.sub,
      email: actor.email,
      name: actor.name,
      roles: access.roles,
      permissions: [...access.permissions].sort(),
    })
  })

  app.all('/rest/v1/:resource', async (c) => {
    const resource = c.req.param('resource')
    const method = c.req.method
    const url = new URL(c.req.url)

    const { actor, access } = await identificar(c)

    // Cuerpo (solo POST/PATCH). Se limita el tamaño antes de leerlo.
    let raw: ArrayBuffer | undefined
    let body: unknown
    let hasBody = false
    if (method === 'POST' || method === 'PATCH') {
      const declared = Number(c.req.header('content-length') ?? 0)
      if (declared > config.maxBodyBytes) throw new HttpError(413, 'BODY_TOO_LARGE', 'Cuerpo demasiado grande')
      raw = await c.req.arrayBuffer()
      if (raw.byteLength > config.maxBodyBytes) throw new HttpError(413, 'BODY_TOO_LARGE', 'Cuerpo demasiado grande')
      hasBody = raw.byteLength > 0
      if (hasBody && /json/i.test(c.req.header('content-type') ?? '')) {
        try {
          body = JSON.parse(new TextDecoder().decode(raw))
        } catch {
          body = undefined
        }
      }
    }

    const decision = autorizar({
      method,
      resource,
      query: url.searchParams,
      body,
      hasBody,
      prefer: c.req.header('prefer') ?? null,
      actor,
      permissions: access?.permissions ?? new Set(),
    })
    if (!decision.ok) {
      return c.json(cuerpoError(decision.code, decision.message), decision.status)
    }

    // Query original sin reserializar, más los filtros que añade la pasarela.
    const rawQuery = [url.search.replace(/^\?/, ''), ...decision.appendQuery].filter(Boolean).join('&')
    const target = `${config.supabaseUrl}/rest/v1/${encodeURIComponent(resource)}${rawQuery ? `?${rawQuery}` : ''}`

    const headers = new Headers()
    for (const name of REENVIAR) {
      const value = c.req.header(name)
      if (value) headers.set(name, value)
    }
    // Credencial de servicio: nunca sale de aquí. Se descartan las cabeceras del
    // cliente que pudieran suplantar identidad o cambiar de esquema.
    headers.set('apikey', config.supabaseServiceKey)
    headers.set('authorization', `Bearer ${config.supabaseServiceKey}`)
    if (actor && access) {
      // Para los triggers/funciones de la base que necesiten saber quién escribe.
      headers.set('x-app-user', actor.sub)
      headers.set('x-app-permissions', [...access.permissions].join(','))
    }

    let payload: BodyInit | undefined
    if (decision.body !== undefined) {
      payload = JSON.stringify(decision.body)
      headers.set('content-type', 'application/json')
    } else if (raw && hasBody) {
      payload = raw
    }

    let response: Response
    try {
      response = await upstream(target, { method, headers, body: payload, signal: AbortSignal.timeout(30_000) })
    } catch {
      throw errors.upstream('Supabase no responde', 'DB_UNAVAILABLE')
    }

    const out = new Headers()
    for (const name of DEVOLVER) {
      const value = response.headers.get(name)
      if (value) out.set(name, value)
    }
    return new Response(response.body, { status: response.status, headers: out })
  })


  // ── Storage: subir y borrar archivos ───────────────────────────────────────
  const PREFIJO = '/storage/v1/object/'

  /** Autentica y exige el permiso de escritura del bucket. */
  async function autorizarBucket(c: Context, bucket: string) {
    const spec = Object.hasOwn(buckets(config), bucket) ? buckets(config)[bucket] : undefined
    if (!spec) throw new HttpError(404, 'NOT_FOUND', 'Bucket no disponible')
    const { actor, access } = await identificar(c)
    if (!actor || !access) throw errors.unauthorized('Se requiere iniciar sesión')
    if (!access.permissions.has(spec.permiso)) {
      throw errors.forbidden(`Requiere el permiso "${spec.permiso}"`)
    }
    return { spec, actor, access }
  }

  async function reenviarStorage(path: string, init: RequestInit) {
    let response: Response
    try {
      response = await upstream(`${config.supabaseUrl}/storage/v1/object/${path}`, {
        ...init,
        signal: AbortSignal.timeout(300_000),
      })
    } catch {
      throw errors.upstream('Supabase no responde', 'DB_UNAVAILABLE')
    }
    const out = new Headers()
    const type = response.headers.get('content-type')
    if (type) out.set('content-type', type)
    return new Response(response.body, { status: response.status, headers: out })
  }

  const cabecerasStorage = (extra: Record<string, string> = {}) => {
    const h = new Headers(extra)
    h.set('apikey', config.supabaseServiceKey)
    h.set('authorization', `Bearer ${config.supabaseServiceKey}`)
    return h
  }

  // Subida: POST|PUT /storage/v1/object/:bucket/<ruta>
  app.on(['POST', 'PUT'], `${PREFIJO}:bucket/*`, async (c) => {
    const bucket = c.req.param('bucket')
    const { spec, actor } = await autorizarBucket(c, bucket)
    const ruta = rutaSegura(c.req.path.slice(`${PREFIJO}${bucket}/`.length))
    if (!ruta) throw errors.badRequest('Ruta de archivo no válida', 'BAD_PATH')

    // Se exige Content-Length para rechazar de entrada lo que no cabe, sin
    // leer nada; además el flujo se corta al superar el tope por si mintieran.
    const largo = Number(c.req.header('content-length'))
    if (!Number.isFinite(largo) || largo <= 0) throw new HttpError(400, 'LENGTH_REQUIRED', 'Falta Content-Length')
    if (largo > spec.maxBytes) throw new HttpError(413, 'FILE_TOO_LARGE', `El archivo supera el máximo de ${spec.maxBytes} bytes`)
    const cuerpo = c.req.raw.body
    if (!cuerpo) throw errors.badRequest('Falta el archivo', 'BAD_BODY')

    const extra: Record<string, string> = {}
    for (const n of ['content-type', 'cache-control', 'x-upsert']) {
      const v = c.req.header(n)
      if (v) extra[n] = v
    }
    // Quién sube, para la bitácora de Supabase.
    extra['x-app-user'] = actor.sub

    return reenviarStorage(`${bucket}/${ruta}`, {
      method: c.req.method,
      headers: cabecerasStorage(extra),
      body: limitarFlujo(cuerpo, spec.maxBytes),
      // @ts-expect-error: requerido por fetch para cuerpos en flujo
      duplex: 'half',
    })
  })

  // Borrado de varios: DELETE /storage/v1/object/:bucket   { "prefixes": [...] }
  app.delete(`${PREFIJO}:bucket`, async (c) => {
    const bucket = c.req.param('bucket')
    await autorizarBucket(c, bucket)
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      throw errors.badRequest('El cuerpo debe ser JSON', 'BAD_BODY')
    }
    const prefixes = (body as { prefixes?: unknown })?.prefixes
    if (!Array.isArray(prefixes) || prefixes.length === 0 || prefixes.length > 100) {
      throw errors.badRequest('`prefixes` debe ser una lista de 1 a 100 rutas', 'BAD_BODY')
    }
    const limpias: string[] = []
    for (const p of prefixes) {
      const r = typeof p === 'string' ? rutaSegura(p) : null
      if (!r) throw errors.badRequest('Ruta de archivo no válida', 'BAD_PATH')
      limpias.push(decodeURIComponent(r))
    }
    return reenviarStorage(bucket, {
      method: 'DELETE',
      headers: cabecerasStorage({ 'content-type': 'application/json' }),
      body: JSON.stringify({ prefixes: limpias }),
    })
  })

  // Borrado de uno: DELETE /storage/v1/object/:bucket/<ruta>
  app.delete(`${PREFIJO}:bucket/*`, async (c) => {
    const bucket = c.req.param('bucket')
    await autorizarBucket(c, bucket)
    const ruta = rutaSegura(c.req.path.slice(`${PREFIJO}${bucket}/`.length))
    if (!ruta) throw errors.badRequest('Ruta de archivo no válida', 'BAD_PATH')
    return reenviarStorage(`${bucket}/${ruta}`, { method: 'DELETE', headers: cabecerasStorage() })
  })


  // ── GPS (Traccar) ──────────────────────────────────────────────────────────
  // La Edge Function ya no autentica usuarios: la pasarela lo hace y la llama con
  // la service_role. Aquí se repite la lista de rutas permitidas (defensa en
  // profundidad: la función también la aplica).
  const RUTAS_GPS = /^\/(devices|positions|reports\/route|reports\/summary)(\?[^#\\\s]*)?$/

  app.get('/functions/v1/gps-proxy', async (c) => {
    const { actor, access } = await identificar(c)
    if (!actor || !access) throw errors.unauthorized('Se requiere iniciar sesión')
    if (!access.permissions.has('catalogos:read')) throw errors.forbidden('Requiere el permiso "catalogos:read"')

    const path = new URL(c.req.url).searchParams.get('path') ?? '/devices'
    if (!RUTAS_GPS.test(path) || path.includes('..') || path.includes('//')) {
      throw errors.forbidden(`Ruta GPS no permitida: ${path.slice(0, 60)}`, 'GPS_PATH_NOT_ALLOWED')
    }

    let response: Response
    try {
      response = await upstream(`${config.supabaseUrl}/functions/v1/gps-proxy?path=${encodeURIComponent(path)}`, {
        headers: { authorization: `Bearer ${config.supabaseServiceKey}`, apikey: config.supabaseServiceKey, accept: 'application/json' },
        signal: AbortSignal.timeout(30_000),
      })
    } catch {
      throw errors.upstream('El servicio GPS no responde', 'GPS_UNAVAILABLE')
    }
    return new Response(response.body, {
      status: response.status,
      headers: { 'content-type': response.headers.get('content-type') ?? 'application/json' },
    })
  })


  // ── Tiempo real (SSE) ──────────────────────────────────────────────────────
  // Solo avisos con el nombre de la tabla que cambió. La conexión se cierra al
  // caducar el JWT con el que se abrió: el cliente reconecta con uno renovado, así
  // que un usuario dado de baja deja de recibir avisos en minutos, no en horas.
  if (deps.broker) {
    const broker = deps.broker
    app.get('/events', async (c) => {
      const { actor, access, exp } = await identificar(c)
      if (!actor || !access) throw errors.unauthorized('Se requiere iniciar sesión')
      if (!access.permissions.has('catalogos:read')) throw errors.forbidden('Requiere el permiso "catalogos:read"')

      const enc = new TextEncoder()
      let baja: (() => void) | null = null
      let temporizador: ReturnType<typeof setTimeout> | null = null
      const limpiar = () => {
        baja?.()
        baja = null
        if (temporizador) clearTimeout(temporizador)
        temporizador = null
      }

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const cerrar = () => {
            limpiar()
            try { controller.close() } catch { /* ya cerrado */ }
          }
          baja = broker.subscribe({
            send: (chunk) => controller.enqueue(enc.encode(chunk)),
            close: cerrar,
          })
          if (!baja) {
            controller.enqueue(enc.encode('event: busy\ndata: {}\n\n'))
            controller.close()
            return
          }
          controller.enqueue(enc.encode('retry: 5000\n\nevent: ready\ndata: {}\n\n'))
          // Acotado: setTimeout desborda por encima de 2^31 ms (se dispararía al instante) y
          // ninguna conexión debe vivir más de una hora aunque el token diga lo contrario.
          const msHastaCaducar = Math.min(
            3_600_000,
            Math.max(1000, exp * 1000 - Date.now() + config.authClockToleranceS * 1000),
          )
          temporizador = setTimeout(cerrar, msHastaCaducar)
        },
        cancel: limpiar,
      })

      return new Response(stream, {
        headers: {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache, no-transform',
          connection: 'keep-alive',
          'x-accel-buffering': 'no', // nginx: no acumular el flujo
        },
      })
    })
  }

  // Cualquier otra ruta (rpc/*, auth/v1/*, storage, tablas anidadas…) no existe aquí.
  app.all('*', (c) => c.json(cuerpoError('NOT_FOUND', 'Ruta no disponible'), 404))

  return app
}
