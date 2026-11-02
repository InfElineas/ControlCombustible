// bun run aprovisionar            → muestra el plan (no escribe nada)
// bun run aprovisionar --aplicar  → crea lo que falte en elineas-auth
//
// Variables: IS_URL, IS_ADMIN_EMAIL, IS_ADMIN_PASSWORD (admin del sistema `auth`),
// opcionales SYSTEM_SLUG (combustible) y ADMIN_SYSTEM_SLUG (auth).
import { aprovisionar } from './aprovisionar'

const faltan = ['IS_URL', 'IS_ADMIN_EMAIL', 'IS_ADMIN_PASSWORD'].filter((k) => !process.env[k])
if (faltan.length) {
  console.error(`Faltan variables: ${faltan.join(', ')}`)
  process.exit(1)
}
const base = process.env.IS_URL!.replace(/\/+$/, '')
const aplicar = process.argv.includes('--aplicar')

const login = await fetch(`${base}/api/auth/sign-in`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
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
