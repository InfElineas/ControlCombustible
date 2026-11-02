// Se ejecuta con: bun test src/lib/sse.test.js
import { describe, expect, test } from 'bun:test';
import { crearLectorSSE } from './sse.js';

const recoger = () => {
  const eventos = [];
  return { eventos, lector: crearLectorSSE((e) => eventos.push(e)) };
};

describe('lector SSE', () => {
  test('evento simple', () => {
    const { eventos, lector } = recoger();
    lector.alimentar('data: {"tabla":"movimiento"}\n\n');
    expect(eventos).toEqual([{ evento: 'message', datos: '{"tabla":"movimiento"}' }]);
  });

  test('evento con nombre', () => {
    const { eventos, lector } = recoger();
    lector.alimentar('event: ready\ndata: {}\n\n');
    expect(eventos).toEqual([{ evento: 'ready', datos: '{}' }]);
  });

  test('fragmentos cortados por cualquier sitio', () => {
    const { eventos, lector } = recoger();
    const texto = 'retry: 5000\n\nevent: ready\ndata: {}\n\ndata: {"tabla":"ruta"}\n\n: ping\n\n';
    for (const c of texto) lector.alimentar(c); // carácter a carácter
    expect(eventos).toEqual([
      { evento: 'ready', datos: '{}' },
      { evento: 'message', datos: '{"tabla":"ruta"}' },
    ]);
  });

  test('comentarios y retry no producen eventos', () => {
    const { eventos, lector } = recoger();
    lector.alimentar(': ping\n\nretry: 3000\n\n');
    expect(eventos).toEqual([]);
  });

  test('CRLF, también partido entre fragmentos', () => {
    const { eventos, lector } = recoger();
    lector.alimentar('data: a\r');
    lector.alimentar('\n\r\n');
    lector.alimentar('data: b\r\n\r\n');
    expect(eventos.map((e) => e.datos)).toEqual(['a', 'b']);
  });

  test('varias líneas data se unen con salto', () => {
    const { eventos, lector } = recoger();
    lector.alimentar('data: uno\ndata: dos\n\n');
    expect(eventos[0].datos).toBe('uno\ndos');
  });

  test('un evento incompleto no se entrega hasta terminar', () => {
    const { eventos, lector } = recoger();
    lector.alimentar('data: x');
    expect(eventos).toEqual([]);
    lector.alimentar('\n\n');
    expect(eventos).toEqual([{ evento: 'message', datos: 'x' }]);
  });

  test('el nombre del evento no se arrastra al siguiente', () => {
    const { eventos, lector } = recoger();
    lector.alimentar('event: busy\ndata: {}\n\ndata: z\n\n');
    expect(eventos.map((e) => e.evento)).toEqual(['busy', 'message']);
  });
});
