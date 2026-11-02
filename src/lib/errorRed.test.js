// Se ejecuta con: bun test src/lib/errorRed.test.js
import { describe, expect, test } from 'bun:test';
import { esFalloDeRed } from './errorRed.js';

describe('esFalloDeRed', () => {
  test('se reintentan: red, token y servidores caídos', () => {
    for (const e of [
      new TypeError('Failed to fetch'),
      { message: 'TypeError: Failed to fetch: no se pudo renovar la sesión (SIN_RED)', code: '' },
      { code: 'TOKEN_EXPIRED', message: 'El token ha caducado' },
      { code: 'UNAUTHORIZED', message: 'Se requiere iniciar sesión' },
      { code: 'SESSION_REJECTED', message: 'x' },
      { code: 'IS_UNAVAILABLE', message: 'El identity server no responde' },
      { code: 'DB_UNAVAILABLE', message: 'Supabase no responde' },
      { code: 'RATE_LIMITED', message: 'Demasiadas peticiones' },
      { message: 'JWT: la sesión ya no es válida' },
      { status: 401, message: 'x' },
      { message: 'No hay conexión con el servidor' },
    ]) expect(esFalloDeRed(e)).toBe(true);
  });

  test('NO se reintentan: permisos, validación, stock, conflictos', () => {
    for (const e of [
      { code: 'FORBIDDEN', message: 'Requiere el permiso "movimiento:create"' },
      { code: 'NO_ACCESS', message: 'Su usuario no tiene acceso' },
      { code: 'BAD_BODY', message: 'Cuerpo inválido' },
      { code: 'FILTER_REQUIRED', message: 'x' },
      { code: '23505', message: 'duplicate key' },
      { code: 'P0001', message: 'Stock insuficiente' },
      { conflicto: true, message: 'Alguien ya lo cambió' },
      { message: 'No tiene permiso para cancelar una bonificación' },
    ]) expect(esFalloDeRed(e)).toBe(false);
  });

  test('un conflicto manda aunque no haya conexión', () => {
    expect(esFalloDeRed({ conflicto: true })).toBe(false);
  });

  test('sin conexión del navegador siempre se reintenta, salvo conflicto', () => {
    globalThis.navigator = { onLine: false };
    try {
      expect(esFalloDeRed({ code: 'FORBIDDEN' })).toBe(true);
      expect(esFalloDeRed({ conflicto: true })).toBe(false);
    } finally {
      delete globalThis.navigator;
    }
  });
});
