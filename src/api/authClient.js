// Cliente de elineas-auth (el identity server) y gestión de la sesión.
//
// Sustituye a supabase.auth. La sesión se compone de:
//
//   · token de sesión  — larga duración, lo emite el IS en la cabecera
//                        `set-auth-token`. Se guarda en el dispositivo y sirve
//                        para pedir JWT nuevos. Es lo que permite seguir
//                        trabajando sin red y arrancar la aplicación sin pedir
//                        la contraseña otra vez.
//   · JWT de acceso    — dura 5 minutos. Solo vive en memoria; se renueva solo.
//                        Es el que se envía a la pasarela en cada petición.
//
// Guardar el token de sesión en el dispositivo es una decisión consciente: sin
// él no hay captura sin conexión (el JWT caduca a los 5 minutos y renovarlo
// exige red la primera vez). Es el mismo nivel de exposición que tenía el token
// de refresco de Supabase, que también vivía en localStorage.

const CLAVE_SESION = 'webcombustible-is-sesion-v1';
const CLAVE_GOOGLE = 'webcombustible-is-google-flujo-v1';
const MARGEN_JWT_S = 30;          // se renueva si le quedan menos segundos
const VIDA_FLUJO_GOOGLE_MS = 10 * 60_000;
const VIDA_PERFIL_MS = 60_000;

export class ErrorAuth extends Error {
  /**
   * @param {string} codigo  código estable (el del IS cuando lo hay)
   * @param {string} mensaje texto para mostrar
   * @param {{ estado?: number, sinRed?: boolean, rechazada?: boolean, detalle?: string }} [extra]
   */
  constructor(codigo, mensaje, extra = {}) {
    super(mensaje);
    this.name = 'ErrorAuth';
    this.codigo = codigo;
    this.estado = extra.estado ?? null;
    /** No hubo respuesta: no se sabe si la sesión sigue siendo válida. */
    this.sinRed = !!extra.sinRed;
    /** El servidor dijo que la sesión ya no vale. */
    this.rechazada = !!extra.rechazada;
    /** Información técnica para quien diagnostica (dirección y error del navegador). */
    this.detalle = extra.detalle ?? null;
  }
}

const aBase64Url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function leerExp(jwt) {
  try {
    const carga = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const { exp } = JSON.parse(atob(carga + '='.repeat((4 - (carga.length % 4)) % 4)));
    return typeof exp === 'number' ? exp : 0;
  } catch {
    return 0;
  }
}

const aleatorio = (n) => aBase64Url(crypto.getRandomValues(new Uint8Array(n)));

/**
 * @param {{
 *   authUrl: string, apiUrl: string, systemSlug?: string,
 *   fetchImpl?: typeof fetch,
 *   almacen?: { getItem(k: string): string|null, setItem(k: string, v: string): void, removeItem(k: string): void },
 *   ahora?: () => number,
 *   espera?: (ms: number) => Promise<void>,
 * }} opciones
 */
export function crearAuthClient(opciones) {
  const { authUrl, apiUrl, systemSlug = 'combustible' } = opciones;
  const peticion = opciones.fetchImpl ?? ((...a) => fetch(...a));
  const almacen = opciones.almacen ?? null;
  const ahora = opciones.ahora ?? Date.now;
  const esperar = opciones.espera ?? ((ms) => new Promise((r) => setTimeout(r, ms)));

  let jwt = null;
  let jwtExp = 0;
  let renovando = null;
  let perfilCache = null; // { valor, en }
  let perfilPendiente = null;
  const oyentes = new Set();

  // ── Almacenamiento (puede no estar disponible: modo privado, cuota…) ──────
  const leer = (clave) => {
    try { return JSON.parse(almacen?.getItem(clave) || 'null'); } catch { return null; }
  };
  const escribir = (clave, valor) => {
    try {
      if (valor == null) almacen?.removeItem(clave);
      else almacen?.setItem(clave, JSON.stringify(valor));
    } catch { /* sin almacenamiento: la sesión dura lo que dure la pestaña */ }
  };

  const sesionGuardada = () => leer(CLAVE_SESION);

  function emitir(evento) {
    for (const f of oyentes) {
      try { f(evento, { usuario: usuarioActual() }); } catch { /* un oyente no rompe a los demás */ }
    }
  }

  function fijarJwt(token) {
    jwt = token || null;
    jwtExp = token ? leerExp(token) : 0;
  }

  function olvidarSesion() {
    jwt = null; jwtExp = 0; perfilCache = null; perfilPendiente = null;
    escribir(CLAVE_SESION, null);
  }

  // ── HTTP contra el IS ─────────────────────────────────────────────────────
  // `reintentos`: veces que se vuelve a intentar si la petición ni siquiera llega al
  // servidor (fetch lanza). Solo se usa donde repetir es inofensivo (iniciar sesión):
  // si la conexión falla, no se ha ejecutado nada en el servidor. Con el navegador
  // sin red no se reintenta: sería esperar en balde.
  async function pedirIS(ruta, { metodo = 'GET', cuerpo, token, reintentos = 0, extra } = {}) {
    const cabeceras = { Accept: 'application/json', ...extra };
    if (cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json';
    if (token) cabeceras.Authorization = `Bearer ${token}`;

    let res;
    for (let intento = 0; ; intento++) {
      try {
        res = await peticion(`${authUrl}${ruta}`, {
          method: metodo,
          headers: cabeceras,
          body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
          // La cookie de sesión es opcional: en web sirve de respaldo; en el móvil
          // (origen distinto) no viaja y se usa el token de sesión.
          credentials: 'include',
        });
        break;
      } catch (e) {
        const sinRedDelNavegador = typeof navigator !== 'undefined' && navigator.onLine === false;
        if (intento < reintentos && !sinRedDelNavegador) {
          await esperar(300 * (intento + 1));
          continue;
        }
        // El origen desde el que se abrió la página importa: `localhost` y `127.0.0.1` son orígenes
        // distintos para CORS, y el servidor de identidad solo acepta los que tiene autorizados.
        const origen = typeof location !== 'undefined' ? ` [página abierta en ${location.origin}]` : '';
        const detalle = `${metodo} ${authUrl}${ruta} → ${e?.name ?? 'Error'}: ${e?.message ?? e}${origen}`;
        console.error('[auth] no se pudo contactar con el servidor de identidad:', detalle);
        throw new ErrorAuth('SIN_RED', 'No hay conexión con el servidor de identidad.', { sinRed: true, detalle });
      }
    }

    let datos = null;
    try { datos = await res.json(); } catch { /* respuesta sin cuerpo */ }

    if (!res.ok) {
      const codigo = datos?.code ?? datos?.error?.code ?? (typeof datos?.error === 'string' ? datos.error : null) ?? `HTTP_${res.status}`;
      const mensaje = datos?.message ?? datos?.error?.message ?? 'No se pudo completar la operación.';
      throw new ErrorAuth(codigo, mensaje, {
        estado: res.status,
        rechazada: res.status === 401 || res.status === 403,
      });
    }
    return { res, datos };
  }

  /** Guarda la sesión que devuelve sign-in / google/exchange. */
  function abrirSesionCon({ res, datos }) {
    const tokenSesion = res.headers.get('set-auth-token');
    const token = datos?.token ?? res.headers.get('set-auth-jwt');
    const u = datos?.user;
    if (!u?.id || !token) {
      throw new ErrorAuth('RESPUESTA_INVALIDA', 'El servidor de identidad devolvió una respuesta inesperada.');
    }
    perfilCache = null;
    fijarJwt(token);
    escribir(CLAVE_SESION, {
      sessionToken: tokenSesion ?? sesionGuardada()?.sessionToken ?? null,
      user: { id: u.id, email: u.email ?? null, name: u.name ?? u.email ?? null },
    });
    emitir('SIGNED_IN');
    return usuarioActual();
  }

  // ── API pública ───────────────────────────────────────────────────────────
  function usuarioActual() {
    return sesionGuardada()?.user ?? null;
  }

  /** ¿Queda en el dispositivo una sesión (aunque no se haya podido validar)? */
  function haySesionGuardada() {
    const s = sesionGuardada();
    return !!(s && (s.sessionToken || jwt));
  }

  // `captcha`: token del widget Turnstile (un solo uso). El IS lo exige en sign-in; la
  // clave de servicio (X-Service-Key) es solo para backends y NUNCA debe llegar al navegador.
  async function iniciarSesion(email, password, captcha) {
    // Hasta 3 reintentos: una conexión intermitente (p. ej. el relé de localhost de WSL2)
    // no debe impedir entrar, y repetir un inicio de sesión que no llegó es inofensivo.
    const r = await pedirIS('/api/auth/sign-in', { metodo: 'POST', cuerpo: { email, password, systemSlug }, reintentos: 3, extra: captcha ? { 'X-Turnstile-Token': captcha } : undefined });
    return abrirSesionCon(r);
  }

  async function renovarJwt() {
    const s = sesionGuardada();
    if (!s) return null;
    let r;
    try {
      // Con token de sesión se renueva con él; sin él, la cookie del IS (web).
      r = await pedirIS('/api/auth/token', { token: s.sessionToken ?? undefined });
    } catch (e) {
      if (e.rechazada) {
        olvidarSesion();
        emitir('SIGNED_OUT');
      }
      throw e;
    }
    const nuevo = r.datos?.token ?? r.res.headers.get('set-auth-jwt');
    if (!nuevo) throw new ErrorAuth('RESPUESTA_INVALIDA', 'El servidor de identidad no devolvió un token.');
    fijarJwt(nuevo);
    emitir('TOKEN_REFRESHED');
    return nuevo;
  }

  /**
   * JWT vigente para llamar a la pasarela.
   *  · `null` si no hay sesión.
   *  · Lanza ErrorAuth con `sinRed` si hace falta renovarlo y no hay conexión:
   *    no se sabe si la sesión sigue viva, así que NO se cierra.
   *  · Lanza con `rechazada` y cierra la sesión si el IS dice que ya no vale.
   */
  async function obtenerToken({ forzar = false } = {}) {
    if (!sesionGuardada()) return null;
    if (!forzar && jwt && jwtExp - ahora() / 1000 > MARGEN_JWT_S) return jwt;
    renovando ??= renovarJwt().finally(() => { renovando = null; });
    return renovando;
  }

  async function cerrarSesion() {
    const s = sesionGuardada();
    olvidarSesion();
    emitir('SIGNED_OUT');
    // Cierre en el servidor: se intenta, pero no se espera ni se propaga el error.
    // La sesión local ya está cerrada y sin red no hay nada más que hacer.
    if (s?.sessionToken) {
      try {
        await Promise.race([
          pedirIS('/api/auth/sign-out', { metodo: 'POST', token: s.sessionToken }),
          new Promise((_, no) => setTimeout(() => no(new Error('plazo')), 3000)),
        ]);
      } catch { /* sin red o ya cerrada */ }
    }
  }

  async function llamarPasarela(ruta, reintentar = true) {
    const token = await obtenerToken();
    if (!token) throw new ErrorAuth('SIN_SESION', 'No hay sesión activa.', { rechazada: true });
    let res;
    try {
      res = await peticion(`${apiUrl}${ruta}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    } catch {
      throw new ErrorAuth('SIN_RED', 'No hay conexión con el servidor.', { sinRed: true });
    }
    // Pudo caducar entre medias: una renovación y se reintenta una vez.
    if (res.status === 401 && reintentar) {
      await obtenerToken({ forzar: true });
      return llamarPasarela(ruta, false);
    }
    return res;
  }

  /**
   * Roles y permisos del usuario según el IS, vía la pasarela.
   * Devuelve `{ sinAcceso: true }` si el usuario existe pero no tiene rol en este
   * sistema (el antiguo estado "pendiente").
   */
  function obtenerPerfil({ forzar = false } = {}) {
    if (!forzar && perfilCache && ahora() - perfilCache.en < VIDA_PERFIL_MS) return Promise.resolve(perfilCache.valor);
    // Varios componentes lo piden a la vez al arrancar: una sola petición.
    perfilPendiente ??= pedirPerfil().finally(() => { perfilPendiente = null; });
    return perfilPendiente;
  }

  async function pedirPerfil() {
    const res = await llamarPasarela('/me');
    if (res.status === 403) {
      const datos = await res.json().catch(() => null);
      if (datos?.error?.code === 'NO_ACCESS') {
        const valor = { sinAcceso: true, roles: [], permissions: [] };
        perfilCache = { valor, en: ahora() };
        return valor;
      }
    }
    if (!res.ok) throw new ErrorAuth('PASARELA_ERROR', 'No se pudo obtener el perfil.', { estado: res.status });
    const valor = { sinAcceso: false, ...(await res.json()) };
    perfilCache = { valor, en: ahora() };
    return valor;
  }

  async function cambiarContrasena(actual, nueva) {
    const token = await obtenerToken();
    if (!token) throw new ErrorAuth('SIN_SESION', 'No hay sesión activa.', { rechazada: true });
    await pedirIS('/api/users/me/change-password', {
      metodo: 'POST', token, cuerpo: { currentPassword: actual, newPassword: nueva },
    });
  }

  // ── Google (redirect + PKCE) ──────────────────────────────────────────────
  /** URL a la que enviar al usuario para elegir su cuenta de Google. */
  async function urlGoogle(redirectTo) {
    const verifier = aleatorio(32);
    const state = aleatorio(16);
    const desafio = aBase64Url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    escribir(CLAVE_GOOGLE, { verifier, state, en: ahora() });
    const u = new URL('/api/auth/google/start', authUrl);
    u.searchParams.set('redirect_to', redirectTo);
    u.searchParams.set('code_challenge', desafio);
    u.searchParams.set('state', state);
    u.searchParams.set('systemSlug', systemSlug);
    return u.toString();
  }

  /**
   * Termina el login con Google a partir de la dirección a la que volvió el
   * navegador (`?code=…&state=…` o `?error=…`).
   */
  async function completarGoogle(direccion) {
    const flujo = leer(CLAVE_GOOGLE);
    escribir(CLAVE_GOOGLE, null); // de un solo uso, pase lo que pase

    const consulta = new URL(direccion, 'https://x.invalid').searchParams;
    const error = consulta.get('error');
    if (error) throw new ErrorAuth(error, 'El inicio de sesión con Google no se completó.');

    const code = consulta.get('code');
    const state = consulta.get('state');
    if (!flujo || ahora() - flujo.en > VIDA_FLUJO_GOOGLE_MS) {
      throw new ErrorAuth('FLUJO_CADUCADO', 'El inicio de sesión caducó. Vuelve a intentarlo.');
    }
    // Anti-CSRF: la vuelta tiene que ser la del inicio que lanzó este dispositivo.
    if (!code || !state || state !== flujo.state) {
      throw new ErrorAuth('STATE_INVALIDO', 'La respuesta de inicio de sesión no es válida.');
    }
    const r = await pedirIS('/api/auth/google/exchange', {
      metodo: 'POST', cuerpo: { code, code_verifier: flujo.verifier },
    });
    return abrirSesionCon(r);
  }

  /**
   * Llama a la API de administración delegada del IS (el admin de `combustible` solo ve y toca
   * su sistema). Usa el TOKEN DE SESIÓN, no el JWT: `/api/users/admin/*` solo acepta sesión
   * (con el JWT responde 401, aunque la documentación del IS diga lo contrario). Sin token
   * de sesión (web con cookie) se apoya en la cookie del IS. Devuelve el JSON.
   */
  async function administrar(ruta, { metodo = 'GET', cuerpo } = {}) {
    const s = sesionGuardada();
    if (!s) throw new ErrorAuth('SIN_SESION', 'No hay sesión activa.', { rechazada: true });
    const { datos } = await pedirIS(ruta, { metodo, cuerpo, token: s.sessionToken ?? undefined });
    return datos;
  }

  return {
    /** Se avisa de 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED'. Devuelve la función para dejar de escuchar. */
    suscribir(fn) { oyentes.add(fn); return () => oyentes.delete(fn); },
    usuarioActual, haySesionGuardada,
    iniciarSesion, cerrarSesion, obtenerToken, obtenerPerfil, cambiarContrasena,
    urlGoogle, completarGoogle, administrar,
  };
}

// ── Instancia de la aplicación ──────────────────────────────────────────────
const env = import.meta.env ?? {};

function almacenDelNavegador() {
  try {
    const t = '__prueba__';
    localStorage.setItem(t, '1');
    localStorage.removeItem(t);
    return localStorage;
  } catch {
    return null;
  }
}

export const authClient = crearAuthClient({
  authUrl: (env.VITE_AUTH_URL ?? '').replace(/\/+$/, ''),
  apiUrl: (env.VITE_API_URL ?? '').replace(/\/+$/, ''),
  systemSlug: env.VITE_SYSTEM_SLUG || 'combustible',
  almacen: typeof localStorage === 'undefined' ? null : almacenDelNavegador(),
});

export const getAccessToken = (opciones) => authClient.obtenerToken(opciones);
