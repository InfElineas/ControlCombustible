# Aplicación móvil (APK) — estado y notas para retomar

Última actualización: 2 de septiembre de 2026
Commits de este bloque: `26ad8a2` … `5588b53`

## Qué se hizo

### Base Android — `26ad8a2`, `ee7dfa7`
Proyecto Capacitor con `appId com.mercadoelineas.combustible` y aviso de conexión
en la interfaz.

La compilación fallaba desde una red con `dl.google.com` filtrado. Se resolvió con
el espejo de Aliyun (inyectado en `~/.gradle/init.d/espejo-google.gradle`, fuera
del repositorio) y con `compileSdk 36`, que Capacitor 7 necesita porque su código
Java referencia `VANILLA_ICE_CREAM` (API 35). El detalle completo está en
[android/LEEME-espejo-gradle.md](android/LEEME-espejo-gradle.md).

### Lectura sin conexión — `f27e6ea`
La caché de TanStack Query se persiste en IndexedDB con **lista blanca explícita**
(`src/lib/query-persist.js`): quedan fuera el log de auditoría, los datos de CPP y
los de finanzas. Caducidad de 3 días.

El `gcTime` del QueryClient subió a 7 días: con los 5 minutos por defecto, las
consultas se descartaban antes de llegar a persistirse.

El rol de usuario se recuerda en `localStorage` (`useUserRole.jsx`). Sin eso, un
fallo de red al consultar el rol degradaba a los operadores a `auditor`. El
servidor sigue siendo quien manda: esto solo evita que la interfaz mienta
mientras no hay red.

### Identidad y navegación — `aba4e5a`
Icono generado desde el logo de la web con `scripts/gen-iconos.mjs` (sharp). Va a
sangre y con el símbolo al 78 % porque Android recorta el icono adaptativo con
máscaras distintas según el dispositivo y solo garantiza visible el 66 % central;
el margen del logo original se veía como un borde blanco en el lanzador.

Navegación estilo tienda de aplicaciones:

- Barra superior: logo, buscador, modo oscuro y menú de cuenta con el rol,
  Configuración, Administración, ayuda y cerrar sesión.
- Barra inferior: cuatro pestañas más «Más». Las cuatro se eligen por el campo
  `movil` de `navItems` y **no** por su orden en la lista, porque cada rol ve un
  subconjunto distinto y así un cajero no acaba con pestañas vacías. Si Alertas no
  cabe para ese rol, su contador se muestra sobre «Más».
- El menú lateral de escritorio no cambió.

El buscador global (`BuscadorGlobal.jsx`) cubre vehículos, tanques, conductores y
trabajadores sobre las listas ya cacheadas, así que también responde sin conexión.
Al elegir un vehículo, Movimientos abre ya filtrado por él.

### Inicio de sesión con Google — `aba4e5a`, `e485583`
Google prohíbe OAuth dentro de un WebView desde 2021, así que la sesión se
iniciaba en el navegador y no en la aplicación. Ahora se abre el navegador del
sistema a propósito y se recoge la vuelta por un enlace propio
(`src/lib/authNativa.js`).

El primer intento falló por una suposición equivocada: **el valor por omisión de
`flowType` en auth-js 2.104 es `implicit`, no `pkce`**
(`node_modules/@supabase/auth-js/dist/main/GoTrueClient.js:24`). Los tokens
llegaban en el fragmento (`#access_token=…&refresh_token=…`) y el código solo
buscaba `?code=` en la consulta. Ahora se leen las dos formas, se atiende la
dirección de arranque en frío, no se procesa dos veces el mismo enlace y los
fallos muestran su motivo real en lugar de un texto fijo.

> **Requisito de configuración:** `com.mercadoelineas.combustible://login` debe
> estar autorizado en Supabase → Authentication → URL Configuration → Redirect
> URLs, y coincidir con el `intent-filter` de `AndroidManifest.xml`.

### Ajustes de vista móvil — `5588b53`
La causa de fondo de los bordes que se salían estaba en el armazón, no en las
páginas: `<main>` es hijo de un contenedor flex y sin `min-w-0` crecía con su
contenido, de modo que un solo bloque ancho ensanchaba la página entera y
arrastraba consigo tarjetas, barras y márgenes.

- `min-w-0` en `<main>` y recorte horizontal en el contenedor de contenido, solo
  en móvil (en escritorio rompería el índice fijo de la página de Ayuda).
- Scroll propio en las seis tablas que no lo tenían, para que el recorte no
  esconda nada.
- Alto máximo, scroll y margen lateral en la base de `Dialog` y de `Sheet`. Sin
  esto, un formulario largo se salía por abajo con el botón de guardar fuera de
  alcance.
- 34 formularios apilados a una columna hasta 640 px. Los 14 paneles de cifras se
  dejaron como estaban: ahí las columnas sí caben.

**Se tocó `src/components/ui/dialog.jsx` y `sheet.jsx`**, que el `CLAUDE.md` marca
como intocables por ser de shadcn. Fue deliberado: el arreglo era idéntico en la
treintena de sitios que los usan, y repetirlo garantizaba que el siguiente modal
naciera roto. Está comentado dentro de cada archivo.

## Pendiente

### Vista móvil
Quedan errores visuales sin identificar. **Nunca se verificaron en pantalla**:
montar cualquier página exige sesión, así que las correcciones anteriores se
apoyaron en lectura de código, en que el proyecto compila y en comprobar que
Tailwind emitió cada clase nueva en el CSS final. Para retomarlo hace falta una
captura de la pantalla concreta que falle.

### Escritura sin conexión (fase 2)
Alcance ya acordado: cola de escritura **solo** para bonificaciones en estado
PENDIENTE y novedades de ruta, con bandeja de pendientes y rechazados. **No** para
despachos, compras ni cobros — esos tocan stock y dinero, y una cola los
descuadraría.

### Datos que dependen del usuario
- Registrar los ajustes manuales de CPP en Finanzas para que se llene la columna
  de ganancia. Hoy 0 de 6 depósitos tienen `precio_costo_unitario`, así que ningún
  tanque tiene CPP.
- Decidir qué hacer con los −4.99 L de Cupet ACAPULCO (0,08 %).

### Módulo de fichas de costo
Esperando las cuatro respuestas del solicitante. El documento de preguntas ya se
envió por correo.

### Propuestas de integridad no aplicadas
- Restricciones de contenido en `movimiento` (litros > 0, origen obligatorio y
  distinto del destino).
- Campo `origen_registro` para sustituir la regla frágil
  `referencia ILIKE 'Bonificación combustible:%'`.
- Cierre de período, numeración de facturas por secuencia de base de datos,
  «repetir último registro» y resumen de confirmación.
- Comprobaciones de precio fuera de rango y de km/L anómalos: faltan los umbrales,
  que hay que sacar de la distribución de los datos reales.

## Cómo generar el APK

```bash
npm run build && npx cap sync android
```

Después, con `JAVA_HOME` apuntando al JDK de Android Studio
(`C:\Program Files\Android\Android Studio\jbr`):

```bash
cd android && ./gradlew assembleDebug
```

El resultado queda en `android/app/build/outputs/apk/debug/app-debug.apk`.
