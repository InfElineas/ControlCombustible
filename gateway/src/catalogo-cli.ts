// bun run permisos — imprime el catálogo a dar de alta en elineas-auth.
import { PERMISOS_POR_ROL, ROLES } from './catalogo'
import { PERMISOS_USADOS } from './rules'

console.log('Sistema: slug "combustible"\n')
console.log('Roles:', ROLES.join(', '), '\n')
console.log('Permisos (recurso:acción) → roles que los llevan\n')
for (const p of Object.keys(PERMISOS_POR_ROL).sort()) {
  console.log(`  ${p.padEnd(30)} ${PERMISOS_POR_ROL[p]!.join(', ')}`)
}
const sinAsignar = PERMISOS_USADOS.filter((p) => !(p in PERMISOS_POR_ROL))
if (sinAsignar.length) console.log('\nUSADOS POR LA PASARELA SIN ASIGNAR A NINGÚN ROL:', sinAsignar.join(', '))
