import { expect, test } from 'bun:test'
import { createLimiter } from '../src/ratelimit'
import { mundo } from './helpers'

// Con app.request() no hay conexión real y la IP sería siempre «desconocida», lo
// que escondería un fallo gravísimo en producción: todos los clientes en un único
// cubo. Esta prueba usa un servidor Bun de verdad.
test('la IP real del cliente llega al limitador (normalizada) y no cae en «desconocida»', async () => {
  const limiter = createLimiter()
  const { app } = await mundo({ rateLimitAnonPerMin: 100 }, { limiter })
  const server = Bun.serve({ port: 0, fetch: app.fetch })
  try {
    await fetch(`http://127.0.0.1:${server.port}/rest/v1/apk_version`)
    expect(limiter.peek('anon:127.0.0.1')).toBe(1)
    expect(limiter.peek('anon:desconocida')).toBe(0)
  } finally {
    server.stop(true)
  }
})

test('con un servidor real, el límite por IP corta de verdad', async () => {
  const { app } = await mundo({ rateLimitAnonPerMin: 2 })
  const server = Bun.serve({ port: 0, fetch: app.fetch })
  try {
    const url = `http://127.0.0.1:${server.port}/rest/v1/apk_version`
    const estados = []
    for (let i = 0; i < 4; i++) estados.push((await fetch(url)).status)
    expect(estados).toEqual([200, 200, 429, 429])
  } finally {
    server.stop(true)
  }
})
