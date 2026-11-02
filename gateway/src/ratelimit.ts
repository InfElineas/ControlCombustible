/**
 * Limitador de peticiones por ventana fija, en memoria.
 *
 * Tres cubos distintos, porque protegen cosas distintas:
 *   · `user:<sub>`  — un usuario autenticado. Generoso: una pantalla lanza varias
 *                     consultas a la vez. Es el único que cuenta a quien está dentro.
 *   · `anon:<ip>`   — peticiones sin token (lo único público es la versión de la APK).
 *   · `fail:<ip>`   — intentos con un token inválido. Frena a quien prueba tokens
 *                     al azar SIN castigar a una oficina entera detrás de una misma
 *                     IP pública: por eso la IP solo cuenta los fallos y lo anónimo,
 *                     nunca el tráfico autenticado.
 *
 * Con varias réplicas cada una lleva su cuenta: el límite efectivo es N veces el
 * configurado. Es aceptable para esto (frenar abusos, no facturar), y evita
 * depender de Redis.
 */
export interface LimiterOptions {
  windowMs?: number
  now?: () => number
  /** Entradas máximas antes de limpiar las caducadas. */
  maxEntries?: number
}

export interface HitResult {
  ok: boolean
  /** Segundos hasta que se abre la ventana siguiente (para `Retry-After`). */
  retryAfterS: number
}

export function createLimiter(options: LimiterOptions = {}) {
  const windowMs = options.windowMs ?? 60_000
  const now = options.now ?? (() => Date.now())
  const maxEntries = options.maxEntries ?? 50_000
  const buckets = new Map<string, { n: number; reset: number }>()

  function sweep(t: number) {
    for (const [k, b] of buckets) if (b.reset <= t) buckets.delete(k)
  }

  return {
    /** Cuenta una petición y dice si cabe. `max <= 0` desactiva el límite. */
    hit(key: string, max: number): HitResult {
      if (max <= 0) return { ok: true, retryAfterS: 0 }
      const t = now()
      let b = buckets.get(key)
      if (!b || b.reset <= t) {
        if (buckets.size >= maxEntries) sweep(t)
        // Si tras limpiar sigue lleno, se descarta lo más antiguo: preferible a
        // crecer sin tope bajo un ataque con claves aleatorias.
        if (buckets.size >= maxEntries) {
          const oldest = buckets.keys().next()
          if (!oldest.done) buckets.delete(oldest.value)
        }
        b = { n: 0, reset: t + windowMs }
        buckets.set(key, b)
      }
      b.n++
      return { ok: b.n <= max, retryAfterS: Math.max(1, Math.ceil((b.reset - t) / 1000)) }
    },
    /** Cuántas peticiones lleva la clave en la ventana actual (para pruebas y métricas). */
    peek(key: string): number {
      const b = buckets.get(key)
      return b && b.reset > now() ? b.n : 0
    },
    size: () => buckets.size,
  }
}

export type Limiter = ReturnType<typeof createLimiter>
