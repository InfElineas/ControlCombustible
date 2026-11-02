// Se ejecuta con: bun test src/api/authClient.test.js
import { describe, expect, test } from 'bun:test';
import { crearAuthClient, ErrorAuth } from './authClient.js';

const b64u = (o) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jwt = (exp) => `${b64u({ alg: 'EdDSA' })}.${b64u({ sub: 'u1', exp })}.firma`;

function entorno() {
  const t = { ms: 1_800_000_000_000 };
  const mem = new Map();
  const almacen = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  const e = { t, mem, almacen, llamadas: [], red: true, respuestas: {}, esperas: 0 };
  e.fetchImpl = async (url, init = {}) => {
    const ruta = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    e.llamadas.push({ ruta, url, init });
    if (!e.red) throw new TypeError('Failed to fetch');
    const r = e.respuestas[`${init.method ?? 'GET'} ${ruta}`];
    if (!r) return new Response('{}', { status: 404 });
    const { estado = 200, cuerpo = {}, cabeceras = {} } = typeof r === 'function' ? r(init) : r;
    return new Response(JSON.stringify(cuerpo), { status: estado, headers: cabeceras });
  };
  e.cliente = crearAuthClient({
    authUrl: 'http://is.test', apiUrl: 'http://gw.test', systemSlug: 'combustible',
    fetchImpl: e.fetchImpl, almacen, ahora: () => t.ms, espera: async () => { e.esperas++; },
  });
  e.exp = (segundos) => Math.floor(t.ms / 1000) + segundos;
  e.usuario = { id: 'u1', email: 'a@gmail.com', name: 'Ana' };
  e.loginOk = (seg = 300) => {
    e.respuestas['POST /api/auth/sign-in'] = { cuerpo: { user: e.usuario, token: jwt(e.exp(seg)) }, cabeceras: { 'set-auth-token': 'SESION-LARGA' } };
  };
  e.refrescoOk = (seg = 300) => {
    e.respuestas['GET /api/auth/token'] = () => ({ cuerpo: { token: jwt(e.exp(seg)) } });
  };
  return e;
}

describe('inicio de sesión', () => {
  test('guarda el token de sesión y el usuario; el JWT solo en memoria', async () => {
    const e = entorno(); e.loginOk();
    const u = await e.cliente.iniciarSesion('a@gmail.com', 'x');
    expect(u).toEqual(e.usuario);
    const guardado = JSON.parse(e.mem.get('webcombustible-is-sesion-v1'));
    expect(guardado.sessionToken).toBe('SESION-LARGA');
    expect(JSON.stringify(guardado)).not.toContain('firma'); // ningún JWT en disco
    expect(e.cliente.haySesionGuardada()).toBe(true);
    const cuerpo = JSON.parse(e.llamadas[0].init.body);
    expect(cuerpo).toEqual({ email: 'a@gmail.com', password: 'x', systemSlug: 'combustible' });
  });

  test('credenciales malas → ErrorAuth con el código del IS y sin sesión', async () => {
    const e = entorno();
    e.respuestas['POST /api/auth/sign-in'] = { estado: 401, cuerpo: { code: 'INVALID_CREDENTIALS', message: 'No' } };
    const err = await e.cliente.iniciarSesion('a@gmail.com', 'mal').catch((x) => x);
    expect(err).toBeInstanceOf(ErrorAuth);
    expect(err.codigo).toBe('INVALID_CREDENTIALS');
    expect(e.cliente.haySesionGuardada()).toBe(false);
  });

  test('sin red → sinRed, no una credencial inválida', async () => {
    const e = entorno(); e.red = false;
    const err = await e.cliente.iniciarSesion('a@gmail.com', 'x').catch((x) => x);
    expect(err.sinRed).toBe(true);
    expect(err.rechazada).toBe(false);
  });

  test('una respuesta sin token se rechaza', async () => {
    const e = entorno();
    e.respuestas['POST /api/auth/sign-in'] = { cuerpo: { user: e.usuario } };
    await expect(e.cliente.iniciarSesion('a', 'b')).rejects.toMatchObject({ codigo: 'RESPUESTA_INVALIDA' });
  });
});

describe('reintentos del inicio de sesión (conexión intermitente)', () => {
  test('si las primeras peticiones ni llegan, reintenta y entra', async () => {
    const e = entorno(); e.loginOk();
    let intentos = 0;
    const real = e.fetchImpl;
    e.cliente = crearAuthClient({
      authUrl: 'http://is.test', apiUrl: 'http://gw.test', fetchImpl: async (...a) => {
        if (++intentos <= 2) throw new TypeError('Failed to fetch');
        return real(...a);
      }, almacen: e.almacen, ahora: () => e.t.ms, espera: async () => { e.esperas++; },
    });
    const u = await e.cliente.iniciarSesion('a@gmail.com', 'x');
    expect(u).toEqual(e.usuario);
    expect(intentos).toBe(3);
    expect(e.esperas).toBe(2);
  });

  test('si sigue fallando, tras 4 intentos da SIN_RED con el detalle técnico', async () => {
    const e = entorno(); e.red = false;
    const err = await e.cliente.iniciarSesion('a@gmail.com', 'x').catch((x) => x);
    expect(err.sinRed).toBe(true);
    expect(err.detalle).toContain('POST http://is.test/api/auth/sign-in');
    expect(err.detalle).toContain('Failed to fetch');
    expect(e.llamadas.length).toBe(4);
  });

  test('una respuesta del servidor (aunque sea 401) NO se reintenta', async () => {
    const e = entorno();
    e.respuestas['POST /api/auth/sign-in'] = { estado: 401, cuerpo: { code: 'INVALID_EMAIL_OR_PASSWORD' } };
    const err = await e.cliente.iniciarSesion('a', 'mal').catch((x) => x);
    expect(err.rechazada).toBe(true);
    expect(e.llamadas.length).toBe(1);
    expect(e.esperas).toBe(0);
  });

  test('con el navegador sin red no se espera en balde', async () => {
    const e = entorno(); e.red = false;
    globalThis.navigator = { onLine: false };
    try {
      const err = await e.cliente.iniciarSesion('a', 'x').catch((x) => x);
      expect(err.sinRed).toBe(true);
      expect(e.llamadas.length).toBe(1);
    } finally { delete globalThis.navigator; }
  });

  test('la renovación del token en segundo plano NO reintenta (falla rápido)', async () => {
    const e = entorno(); e.loginOk(10);
    await e.cliente.iniciarSesion('a', 'b');
    e.red = false; const antes = e.llamadas.length;
    await e.cliente.obtenerToken().catch(() => {});
    expect(e.llamadas.length - antes).toBe(1);
  });
});

describe('token de acceso', () => {
  test('sin sesión → null y sin llamar a nadie', async () => {
    const e = entorno();
    expect(await e.cliente.obtenerToken()).toBeNull();
    expect(e.llamadas.length).toBe(0);
  });

  test('reutiliza el JWT mientras le queden más de 30 s', async () => {
    const e = entorno(); e.loginOk(300); e.refrescoOk();
    await e.cliente.iniciarSesion('a', 'b');
    const t1 = await e.cliente.obtenerToken();
    e.t.ms += 200_000; // quedan 100 s
    expect(await e.cliente.obtenerToken()).toBe(t1);
    expect(e.llamadas.filter((c) => c.ruta === '/api/auth/token').length).toBe(0);
  });

  test('renueva cuando está por caducar, usando el token de sesión', async () => {
    const e = entorno(); e.loginOk(300); e.refrescoOk(300);
    await e.cliente.iniciarSesion('a', 'b');
    e.t.ms += 280_000; // quedan 20 s < margen
    const nuevo = await e.cliente.obtenerToken();
    expect(nuevo).toBeTruthy();
    const c = e.llamadas.find((x) => x.ruta === '/api/auth/token');
    expect(c.init.headers.Authorization).toBe('Bearer SESION-LARGA');
  });

  test('peticiones simultáneas comparten UNA renovación', async () => {
    const e = entorno(); e.loginOk(10); e.refrescoOk(300);
    await e.cliente.iniciarSesion('a', 'b');
    await Promise.all(Array.from({ length: 10 }, () => e.cliente.obtenerToken()));
    expect(e.llamadas.filter((x) => x.ruta === '/api/auth/token').length).toBe(1);
  });

  test('SIN RED al renovar: lanza sinRed y CONSERVA la sesión (trabajo sin conexión)', async () => {
    const e = entorno(); e.loginOk(10);
    await e.cliente.iniciarSesion('a', 'b');
    e.red = false;
    const err = await e.cliente.obtenerToken().catch((x) => x);
    expect(err.sinRed).toBe(true);
    expect(e.cliente.haySesionGuardada()).toBe(true);
    expect(e.cliente.usuarioActual()).toEqual(e.usuario);
    // Y al volver la red, se recupera sola.
    e.red = true; e.refrescoOk();
    expect(await e.cliente.obtenerToken()).toBeTruthy();
  });

  test('el IS rechaza la sesión (401): se cierra y se avisa', async () => {
    const e = entorno(); e.loginOk(10);
    await e.cliente.iniciarSesion('a', 'b');
    e.respuestas['GET /api/auth/token'] = { estado: 401, cuerpo: { code: 'UNAUTHORIZED' } };
    const eventos = []; e.cliente.suscribir((ev) => eventos.push(ev));
    const err = await e.cliente.obtenerToken().catch((x) => x);
    expect(err.rechazada).toBe(true);
    expect(e.cliente.haySesionGuardada()).toBe(false);
    expect(eventos).toContain('SIGNED_OUT');
  });

  test('un error 500 del IS NO cierra la sesión', async () => {
    const e = entorno(); e.loginOk(10);
    await e.cliente.iniciarSesion('a', 'b');
    e.respuestas['GET /api/auth/token'] = { estado: 500, cuerpo: {} };
    await expect(e.cliente.obtenerToken()).rejects.toBeInstanceOf(ErrorAuth);
    expect(e.cliente.haySesionGuardada()).toBe(true);
  });
});

describe('perfil (roles y permisos)', () => {
  test('lo pide a la pasarela con el JWT y lo cachea', async () => {
    const e = entorno(); e.loginOk(300);
    e.respuestas['GET /me'] = { cuerpo: { sub: 'u1', roles: ['operador'], permissions: ['catalogos:read'] } };
    await e.cliente.iniciarSesion('a', 'b');
    const p1 = await e.cliente.obtenerPerfil();
    await e.cliente.obtenerPerfil();
    expect(p1.roles).toEqual(['operador']);
    expect(p1.sinAcceso).toBe(false);
    expect(e.llamadas.filter((c) => c.ruta === '/me').length).toBe(1);
    expect(e.llamadas.find((c) => c.ruta === '/me').init.headers.Authorization).toMatch(/^Bearer ey|^Bearer /);
  });

  test('peticiones simultáneas del perfil comparten UNA llamada', async () => {
    const e = entorno(); e.loginOk(300);
    e.respuestas['GET /me'] = { cuerpo: { sub: 'u1', roles: ['operador'], permissions: [] } };
    await e.cliente.iniciarSesion('a', 'b');
    await Promise.all(Array.from({ length: 8 }, () => e.cliente.obtenerPerfil()));
    expect(e.llamadas.filter((c) => c.ruta === '/me').length).toBe(1);
  });

  test('NO_ACCESS → sinAcceso (equivale al antiguo "pendiente")', async () => {
    const e = entorno(); e.loginOk(300);
    e.respuestas['GET /me'] = { estado: 403, cuerpo: { error: { code: 'NO_ACCESS' } } };
    await e.cliente.iniciarSesion('a', 'b');
    expect((await e.cliente.obtenerPerfil()).sinAcceso).toBe(true);
  });

  test('401 de la pasarela: renueva el token y reintenta una vez', async () => {
    const e = entorno(); e.loginOk(300); e.refrescoOk(300);
    let n = 0;
    e.respuestas['GET /me'] = () => (++n === 1 ? { estado: 401, cuerpo: {} } : { cuerpo: { sub: 'u1', roles: ['auditor'], permissions: [] } });
    await e.cliente.iniciarSesion('a', 'b');
    expect((await e.cliente.obtenerPerfil()).roles).toEqual(['auditor']);
    expect(n).toBe(2);
  });

  test('sin red → sinRed', async () => {
    const e = entorno(); e.loginOk(300);
    await e.cliente.iniciarSesion('a', 'b');
    e.red = false;
    const err = await e.cliente.obtenerPerfil().catch((x) => x);
    expect(err.sinRed).toBe(true);
  });
});

describe('cerrar sesión', () => {
  test('borra todo y avisa, aunque el servidor no responda', async () => {
    const e = entorno(); e.loginOk();
    await e.cliente.iniciarSesion('a', 'b');
    e.red = false;
    const eventos = []; e.cliente.suscribir((ev) => eventos.push(ev));
    await e.cliente.cerrarSesion();
    expect(e.cliente.haySesionGuardada()).toBe(false);
    expect(e.mem.size).toBe(0);
    expect(eventos).toEqual(['SIGNED_OUT']);
    expect(await e.cliente.obtenerToken()).toBeNull();
  });

  test('con red avisa al IS usando el token de sesión', async () => {
    const e = entorno(); e.loginOk();
    e.respuestas['POST /api/auth/sign-out'] = { cuerpo: { success: true } };
    await e.cliente.iniciarSesion('a', 'b');
    await e.cliente.cerrarSesion();
    const c = e.llamadas.find((x) => x.ruta === '/api/auth/sign-out');
    expect(c.init.headers.Authorization).toBe('Bearer SESION-LARGA');
  });
});

describe('Google (PKCE)', () => {
  test('la URL de inicio lleva challenge S256, state y sistema; el verifier no sale', async () => {
    const e = entorno();
    const u = new URL(await e.cliente.urlGoogle('https://app.test/auth/callback'));
    expect(u.pathname).toBe('/api/auth/google/start');
    expect(u.searchParams.get('redirect_to')).toBe('https://app.test/auth/callback');
    expect(u.searchParams.get('systemSlug')).toBe('combustible');
    expect(u.searchParams.get('code_challenge')).toHaveLength(43);
    const flujo = JSON.parse(e.mem.get('webcombustible-is-google-flujo-v1'));
    expect(u.toString()).not.toContain(flujo.verifier);
    // challenge = base64url(sha256(verifier))
    const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(flujo.verifier));
    expect(u.searchParams.get('code_challenge')).toBe(btoa(String.fromCharCode(...new Uint8Array(h))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''));
  });

  test('flujo completo: canjea el código con el verifier y abre sesión', async () => {
    const e = entorno(); e.loginOk();
    e.respuestas['POST /api/auth/google/exchange'] = (init) => ({ cuerpo: { user: e.usuario, token: jwt(e.exp(300)), recibido: JSON.parse(init.body) }, cabeceras: { 'set-auth-token': 'S2' } });
    const u = new URL(await e.cliente.urlGoogle('https://app.test/auth/callback'));
    const state = u.searchParams.get('state');
    const usuario = await e.cliente.completarGoogle(`https://app.test/auth/callback?code=COD&state=${state}`);
    expect(usuario).toEqual(e.usuario);
    const canje = JSON.parse(e.llamadas.find((c) => c.ruta === '/api/auth/google/exchange').init.body);
    expect(canje.code).toBe('COD');
    expect(canje.code_verifier).toHaveLength(43);
    expect(e.mem.has('webcombustible-is-google-flujo-v1')).toBe(false); // de un solo uso
  });

  test('state distinto (CSRF) se rechaza y no canjea', async () => {
    const e = entorno();
    await e.cliente.urlGoogle('https://app.test/cb');
    await expect(e.cliente.completarGoogle('https://app.test/cb?code=X&state=otro')).rejects.toMatchObject({ codigo: 'STATE_INVALIDO' });
    expect(e.llamadas.length).toBe(0);
  });

  test('sin flujo iniciado en este dispositivo o caducado se rechaza', async () => {
    const e = entorno();
    await expect(e.cliente.completarGoogle('https://app.test/cb?code=X&state=Y')).rejects.toMatchObject({ codigo: 'FLUJO_CADUCADO' });
    const u = new URL(await e.cliente.urlGoogle('https://app.test/cb'));
    e.t.ms += 11 * 60_000;
    await expect(e.cliente.completarGoogle(`https://app.test/cb?code=X&state=${u.searchParams.get('state')}`)).rejects.toMatchObject({ codigo: 'FLUJO_CADUCADO' });
  });

  test('los errores del IS (ACCOUNT_NOT_FOUND…) llegan con su código', async () => {
    const e = entorno();
    await e.cliente.urlGoogle('https://app.test/cb');
    await expect(e.cliente.completarGoogle('https://app.test/cb?error=ACCOUNT_NOT_FOUND')).rejects.toMatchObject({ codigo: 'ACCOUNT_NOT_FOUND' });
  });
});
