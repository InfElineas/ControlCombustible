/**
 * Tiempo real: avisos de «esta tabla cambió», repartidos por SSE.
 *
 * Una sola suscripción a Supabase Realtime con la service_role (que no depende
 * de RLS) alimenta a todos los clientes conectados. Lo que viaja es SOLO el
 * nombre de la tabla —nunca filas—: el cliente vuelve a consultar por los
 * caminos de siempre, así que la autorización sigue decidiendo qué ve cada uno y
 * un aviso no puede filtrar datos.
 */
import { createClient } from '@supabase/supabase-js'

/** Tablas de las que el frontend espera avisos (las de la publicación supabase_realtime). */
export const TABLAS_TIEMPO_REAL: readonly string[] = [
  'movimiento', 'venta_trabajador', 'anomalia_descartada',
  'consumidor', 'conductor', 'beneficiario', 'tarjeta',
  'tipo_combustible', 'tipo_consumidor', 'concepto_precio',
  'precio_combustible', 'precio_despacho_tipo', 'clase_vehiculo', 'tarifa_transporte',
  'asignacion_ruta', 'ruta', 'marcador', 'ruta_marcador', 'apk_version',
]

/** Origen de los avisos. Es una interfaz para poder probar sin Supabase. */
export interface ChangeSource {
  start(onChange: (tabla: string) => void): void
  stop(): void
}

export function supabaseSource(url: string, serviceKey: string): ChangeSource {
  const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  let channel: ReturnType<typeof client.channel> | null = null
  return {
    start(onChange) {
      channel = client.channel('gateway-cambios')
      for (const tabla of TABLAS_TIEMPO_REAL) {
        channel.on('postgres_changes', { event: '*', schema: 'public', table: tabla }, () => onChange(tabla))
      }
      channel.subscribe((status, err) => {
        if (status === 'SUBSCRIBED') console.log('realtime: suscrito a', TABLAS_TIEMPO_REAL.length, 'tablas')
        else if (status !== 'CLOSED') console.warn('realtime:', status, err?.message ?? '')
      })
    },
    stop() {
      if (channel) void client.removeChannel(channel)
      channel = null
    },
  }
}

export interface Subscriber {
  /** Entrega un fragmento ya con formato SSE. */
  send(chunk: string): void
  /** Cierra la conexión de este cliente. */
  close(): void
}

export interface BrokerOptions {
  source: ChangeSource
  maxClients?: number
  heartbeatMs?: number
}

export function createBroker(options: BrokerOptions) {
  const max = options.maxClients ?? 500
  const clients = new Set<Subscriber>()
  let started = false
  let heartbeat: ReturnType<typeof setInterval> | null = null

  function broadcast(chunk: string) {
    for (const c of [...clients]) {
      try {
        c.send(chunk)
      } catch {
        clients.delete(c)
      }
    }
  }

  function ensureStarted() {
    if (started) return
    started = true
    options.source.start((tabla) => broadcast(`data: ${JSON.stringify({ tabla })}\n\n`))
    // Un comentario SSE cada pocos segundos: mantiene viva la conexión a través
    // de proxies y deja al cliente detectar una conexión muerta.
    heartbeat = setInterval(() => broadcast(': ping\n\n'), options.heartbeatMs ?? 25_000)
  }

  function stopIfIdle() {
    if (clients.size > 0 || !started) return
    started = false
    if (heartbeat) clearInterval(heartbeat)
    heartbeat = null
    options.source.stop()
  }

  return {
    /** `null` si ya hay demasiados clientes. */
    subscribe(sub: Subscriber): (() => void) | null {
      if (clients.size >= max) return null
      clients.add(sub)
      ensureStarted()
      return () => {
        clients.delete(sub)
        stopIfIdle()
      }
    },
    size: () => clients.size,
    /** Cierra a todos (apagado ordenado). */
    shutdown() {
      for (const c of [...clients]) {
        try { c.close() } catch { /* ya cerrado */ }
      }
      clients.clear()
      stopIfIdle()
    },
  }
}

export type Broker = ReturnType<typeof createBroker>
