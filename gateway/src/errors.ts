/** Error con código HTTP y código estable para el cliente. */
export class HttpError extends Error {
  constructor(
    public readonly status: 400 | 401 | 403 | 404 | 413 | 415 | 429 | 502 | 504,
    public readonly code: string,
    message: string,
    /** Segundos para `Retry-After` en los 429. */
    public readonly retryAfterS?: number,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export const errors = {
  unauthorized: (message: string, code = 'UNAUTHORIZED') => new HttpError(401, code, message),
  forbidden: (message: string, code = 'FORBIDDEN') => new HttpError(403, code, message),
  badRequest: (message: string, code = 'BAD_REQUEST') => new HttpError(400, code, message),
  upstream: (message: string, code = 'UPSTREAM_ERROR') => new HttpError(502, code, message),
}

/**
 * Cuerpo de error de la pasarela.
 *
 * Lleva `code` y `message` en el nivel superior, que es como los devuelve
 * PostgREST y como los lee supabase-js (`error.code`, `error.message`). Sin eso el
 * cliente recibía un error sin código ni mensaje y no podía distinguir un fallo
 * transitorio (reintentable) de un rechazo definitivo. El objeto `error` anidado
 * se mantiene para los clientes que ya lo leen así.
 */
export function cuerpoError(code: string, message: string) {
  return { code, message, details: null, hint: null, error: { code, message } }
}
