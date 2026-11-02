import { createApp } from './app'
import { loadConfig } from './config'
import { createIdentity } from './identity'
import { createVerifier } from './jwt'
import { createLimiter } from './ratelimit'
import { createBroker, supabaseSource } from './realtime'

const config = loadConfig()

const verify = createVerifier({
  jwksUrl: `${config.authBaseUrl}${config.authJwksPath}`,
  issuer: config.authIssuer,
  audience: config.authAudience,
  clockToleranceS: config.authClockToleranceS,
  timeoutMs: config.authTimeoutMs,
})

const identity = createIdentity({
  baseUrl: config.authBaseUrl,
  systemSlug: config.systemSlug,
  ttlMs: config.permissionTtlS * 1000,
  staleMs: config.permissionStaleS * 1000,
  timeoutMs: config.authTimeoutMs,
})

const broker = createBroker({ source: supabaseSource(config.supabaseUrl, config.supabaseServiceKey) })
const limiter = createLimiter()

const app = createApp({ config, verify, identity, broker, limiter })

const server = Bun.serve({
  port: config.port,
  fetch: app.fetch,
  // Las subidas de APK y las conexiones SSE son largas: sin esto Bun las corta a los 10 s.
  idleTimeout: 255,
  // Hono necesita la IP de la conexión para el limitador (getConnInfo).
})
console.log(`combustible-gateway escuchando en :${config.port}`)

// Apagado ordenado: `docker stop` envía SIGTERM. Se cierran las conexiones SSE
// (los clientes reconectan solos a otra réplica) y se deja terminar lo que esté
// en curso antes de salir.
let apagando = false
async function apagar(senal: string) {
  if (apagando) return
  apagando = true
  console.log(`${senal} recibido: apagando…`)
  broker.shutdown()
  await server.stop()
  process.exit(0)
}
process.on('SIGTERM', () => void apagar('SIGTERM'))
process.on('SIGINT', () => void apagar('SIGINT'))
