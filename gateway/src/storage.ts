/**
 * Supabase Storage a través de la pasarela: SOLO subir y borrar.
 *
 * Descargar no pasa por aquí: los buckets son públicos y las URL públicas se
 * sirven directamente desde Supabase (no hay nada que autorizar).
 */
import type { Config } from './config'
import { errors } from './errors'

export interface BucketSpec {
  /** Permiso del IS que permite escribir en el bucket. */
  permiso: string
  maxBytes: number
}

export function buckets(config: Config): Record<string, BucketSpec> {
  return {
    'movimiento-adjuntos': { permiso: 'adjunto:write', maxBytes: config.storageMaxAdjuntoBytes },
    apk: { permiso: 'apk:write', maxBytes: config.storageMaxApkBytes },
  }
}

const SEGMENTO = /^[\w.\- ()]+$/

/**
 * Valida una ruta de objeto y la devuelve lista para ir en una URL.
 * Rechaza `..`, vacíos, barras invertidas, caracteres de control y rutas
 * demasiado largas o profundas. `null` si no es válida.
 */
export function rutaSegura(raw: string): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    return null
  }
  if (!decoded || decoded.length > 200) return null
  const segmentos = decoded.split('/')
  if (segmentos.length > 4) return null
  for (const s of segmentos) {
    if (!s || s === '.' || s === '..' || !SEGMENTO.test(s) || /^\.+$/.test(s)) return null
  }
  return segmentos.map(encodeURIComponent).join('/')
}

/** Cuenta los bytes que pasan y corta el flujo si superan el límite. */
export function limitarFlujo(body: ReadableStream<Uint8Array>, maxBytes: number): ReadableStream<Uint8Array> {
  let visto = 0
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        visto += chunk.byteLength
        if (visto > maxBytes) controller.error(errors.badRequest('El archivo supera el tamaño máximo', 'FILE_TOO_LARGE'))
        else controller.enqueue(chunk)
      },
    }),
  )
}
