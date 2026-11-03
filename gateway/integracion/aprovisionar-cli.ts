// bun run aprovisionar            → muestra el plan (no escribe nada)
// bun run aprovisionar --aplicar  → crea lo que falte en elineas-auth
//
// Variables: IS_URL, IS_ADMIN_EMAIL, IS_ADMIN_PASSWORD (admin del sistema `auth`),
// IS_SERVICE_KEY (clave de servicio del sistema `auth`: sustituye al captcha del sign-in),
// opcionales SYSTEM_SLUG (combustible) y ADMIN_SYSTEM_SLUG (auth).
import { aprovisionar } from './aprovisionar'

const faltan = ['IS_URL', 'IS_ADMIN_EMAIL', 'IS_ADMIN_PASSWORD', 'IS_SERVICE_KEY'].filter((k) => !process.env[k])
if (faltan.length) {
  console.error(`Faltan variables: ${faltan.join(', ')}`)
  process.exit(1)
}
const base = process.env.IS_URL!.replace(/\/+$/, '')
const aplicar = process.argv.includes('--aplicar')

const login = await fetch(`${base}/api/auth/sign-in`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-service-key': process.env.IS_SERVICE_KEY! },
  body: JSON.stringify({
    email: process.env.IS_ADMIN_EMAIL,
    password: process.env.IS_ADMIN_PASSWORD,
    systemSlug: process.env.ADMIN_SYSTEM_SLUG ?? 'auth',
  }),
})
const sesion = login.headers.get('set-auth-token')
if (!login.ok || !sesion) {
  console.error(`No se pudo iniciar sesión como administrador (${login.status}).`)
  process.exit(1)
}

console.log(aplicar ? '== APLICANDO ==' : '== PLAN (no se escribe nada; añade --aplicar) ==')
await aprovisionar({
  isUrl: base,
  sesion,
  slug: process.env.SYSTEM_SLUG ?? 'combustible',
  nombre: 'Control Combustible',
  aplicar,
  log: (m) => console.log(' ·', m),
})
