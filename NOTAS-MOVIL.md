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

### Arranque sin conexión
La lectura sin conexión estaba implementada pero la aplicación no llegaba a
abrirse. Dos causas encadenadas:

1. **`getSession()` devuelve `null`** en cuanto el token de acceso caduca —dura
   una hora, con 90 s de margen— y el refresco falla, aunque la sesión siga
   guardada en el dispositivo
   (`node_modules/@supabase/auth-js/dist/main/GoTrueClient.js:2369`). Como
   `App.jsx` cortaba a la pantalla de inicio de sesión con `!isAuthenticated`, y
   ahí sin red no se puede hacer nada, los datos descargados eran inalcanzables.
2. **auth-js reintenta ese refresco más de 30 s** antes de rendirse. Medido sobre
   el build: 42 s con la aplicación en blanco. Cualquiera la cierra antes.

La solución: `hayCredencialGuardada()` distingue "falta red para refrescar" de
"aquí nadie ha entrado" —cuando el token de refresco muere de verdad y hay
conexión para comprobarlo, Supabase borra él mismo esa entrada—, y con ella la
aplicación abre en modo solo lectura con el último usuario conocido. Un plazo de
1,8 s en `AuthContext` y otro en `useUserRole` evitan esperar los reintentos.

Medido sobre el build con el servidor de Supabase inalcanzable: **5,2 s** hasta el
panel, con aviso en pantalla de que la sesión no está validada y no se puede
guardar. Sin credencial guardada va a la pantalla de inicio de sesión en 1 s.

Es solo lectura y no hay nada que ganar cerrando la puerta: el servidor rechaza
cualquier escritura por su cuenta. La contrapartida es que quien tenga el móvil
desbloqueado puede consultar los datos ya descargados sin volver a autenticarse,
pero esos datos ya estaban en el dispositivo.

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

### Aviso de descarga en la web
La web invita a instalar la aplicación en dos sitios: una tarjeta bajo el
formulario de inicio de sesión y un banner dentro, que se puede cerrar y no
vuelve a salir (queda marcado en `localStorage`). No aparece dentro de la propia
aplicación ni en un iPhone, donde el archivo no sirve.

> **Hace falta subir el archivo.** El enlace apunta a
> `/app/control-combustible.apk` en el propio dominio; hay que copiar ahí
> `android/app/build/outputs/apk/debug/app-debug.apk` con ese nombre. Para
> servirlo desde otro sitio, definir `VITE_URL_APK` antes de compilar.
>
> El `.htaccess` ya declara el tipo `application/vnd.android.package-archive`
> —sin él Android no ofrece instalar el archivo, solo lo deja en Descargas— y le
> pone `no-cache`, porque el nombre no lleva hash y una versión nueva quedaría
> escondida detrás de la vieja.

El archivo **no** está en el repositorio a propósito: son 6,5 MB por versión y
engordaría el historial sin necesidad.

## Pendiente

### Vista móvil
Las nueve páginas se recorrieron a 375 puntos y **ninguna desborda**: Inicio,
Movimientos, Bonificaciones, Rutas, Transporte, Finanzas, Catálogos, Alertas,
Reportes y Configuración dan 375 de contenido en 375 de ventana.

El límite de esa comprobación es que se hizo con las listas casi vacías, y la
mayoría de los desbordes vienen del contenido. Bonificaciones sí se probó con
datos sembrados y nombres largos. Para el resto, si aparece algo, hace falta una
captura de la pantalla concreta o sembrar sus consultas como se explica arriba.

### Cómo probar el arranque sin conexión
Sin tocar la configuración del proyecto: crear `.env.production.local` (está en
`.gitignore`) con `VITE_SUPABASE_URL=http://127.0.0.1:9` y la clave anónima real,
compilar, servir con `webcombustible-preview` y sembrar en `localStorage` una
sesión caducada bajo `sb-127-auth-token` más la entrada
`webcombustible-rol-conocido`. Reproduce el escenario exacto sin necesidad de un
dispositivo ni de cortar la red. **Borrar los dos archivos y recompilar
después**: el build se queda con la URL falsa.

### Cómo ver cualquier página con datos, sin credenciales
Para revisar la vista de una página hace falta contenido, y la caché arranca
vacía. Se puede sembrar la caché persistida desde la consola del navegador:

- La clave es `webcombustible-cache-v1` en IndexedDB, base `keyval-store`,
  almacén `keyval`.
- **El valor es una cadena JSON, no un objeto** — `createAsyncStoragePersister`
  serializa. Guardar un objeto no rehidrata nada y cuesta un rato descubrirlo.
- La forma es `{buster:'', timestamp, clientState:{mutations:[], queries:[…]}}`,
  y cada consulta `{queryKey, queryHash: JSON.stringify(queryKey), state:{data,
  status:'success', dataUpdatedAt, fetchStatus:'idle', …}}`.
- Solo se rehidrata lo que está en la lista blanca de
  [query-persist.js](src/lib/query-persist.js).

Sembrar, recargar, y la página se dibuja con esos datos aunque las peticiones al
servidor fallen. Sirve para probar nombres largos y cifras grandes, que es de
donde salen la mayoría de los desbordes.

Para detectar desbordes hay un recorrido del DOM que compara el borde derecho de
cada elemento con el de su contenedor, saltándose los que tienen desplazamiento
propio. Con él se comprobaron las nueve páginas a 375 puntos.

### Escritura sin conexión (fase 2) — hecho
La cola vive en [colaEscritura.js](src/lib/colaEscritura.js) y la bandeja en
[BandejaPendientes.jsx](src/components/ui-helpers/BandejaPendientes.jsx). Cubre
bonificaciones en PENDIENTE, novedades de ruta y **movimientos**.

Las dos primeras no mueven combustible ni dinero: una bonificación en PENDIENTE
es un compromiso y el descuento ocurre al entregarla.

Los **movimientos sí mueven existencias** y entraron por decisión expresa —
registrar en el campo sin cobertura era el motivo de todo esto—, pero no son
gratis: un DESPACHO encolado puede llegar cuando otro ya consumió ese
combustible, y el trigger que impide el stock negativo lo rechaza con el
combustible ya entregado. Tres defensas lo hacen manejable:

1. La entrada de existencias (COMPRA, DEPÓSITO) no puede fallar por stock.
2. **El stock que se muestra descuenta lo que está en la cola**
   (`litrosComprometidos`). Sin eso el operador sigue despachando sobre
   existencias que ya comprometió, que es la forma segura de descuadrar.
3. Un rechazo por stock llega a la bandeja con el motivo y qué hacer: registrar
   una COMPRA en el origen o corregir con un AJUSTE.

El formulario avisa al guardar sin conexión, y en un DESPACHO lo dice más fuerte.

### Cobros y cambios de estado — el caso de las modificaciones
También entran, y traen un riesgo distinto: **son modificaciones, no
inserciones**. Dos personas cobrando la misma bonificación sin verse no producen
un duplicado, producen una **sobrescritura**: la segunda pisaría el cobro de la
primera y el identificador de cliente no protege de eso.

La defensa es que el cambio va **condicionado al estado que el usuario tenía
delante** (`.eq('estado', venta.estado)` en
[transicionVenta.js](src/lib/transicionVenta.js)). Si nadie lo tocó, cambia una
fila; si ya lo cambiaron, ninguna, y eso se convierte en `ConflictoDeEstado`, que
**no se reintenta**: reintentarlo pisaría el trabajo del otro. Llega a la bandeja
para que una persona lo mire.

La lógica se extrajo de la página a un módulo porque ahora la ejecutan dos
caminos —el botón y la cola— y duplicarla garantizaba que se separaran.

Las fechas y el consumidor de destino se **congelan al pulsar**, no al enviar: un
cobro registrado el lunes sin cobertura que sale el jueves lleva fecha del lunes.

> **Cambio de comportamiento con conexión, no solo sin ella.** Antes el cambio de
> estado se aplicaba aunque la pantalla estuviera desactualizada; ahora, si otra
> persona cambió ese registro mientras lo tenías abierto, se avisa en lugar de
> sobrescribir. Es más correcto, pero es distinto de como funcionaba.

Tres decisiones que no se leen en el código:

1. **El identificador se genera en el cliente** y viaja en el insert. Si un envío
   llega pero su respuesta se pierde, el reintento choca contra la clave primaria
   y eso se lee como «ya estaba guardado». Sin ello, una respuesta perdida
   duplicaría el registro.
2. **El número de factura se recalcula al enviar** si choca. Se calcula en el
   cliente sobre una lista que sin conexión puede estar vieja; cuando el choque
   ocurre se le pide el siguiente al servidor en vez de rechazar el registro.
3. **Los fallos de red y de sesión se reintentan; los de validación o permiso,
   no.** Un token caducado se renueva solo en cuanto hay conexión, así que
   tratarlo como rechazo definitivo descartaba registros buenos. Por el mismo
   motivo la cola no se procesa mientras la sesión no esté validada.

Lo guardado no aparece en la lista de bonificaciones, porque no está en el
servidor. Para que no se pierda de vista hay un aviso en la propia página y un
acceso en el menú de cuenta, ambos con el número de registros en espera.

Las novedades de ruta usan la misma cola. Se mandan por
`base44.entities.AsignacionRuta.create` y no por un insert directo, para no
perder el apunte de auditoría de quién las creó; ese apunte no puede romper el
envío porque `logAudit` nunca lanza.

**Solo se encola la creación.** Editar o borrar sin conexión es otro problema:
al enviarlo habría que decidir qué hacer si alguien tocó el mismo registro
mientras tanto, y eso no se resuelve con una cola.

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

### Firma para publicar
La configuración de firma ya está en
[app/build.gradle](android/app/build.gradle): lee las credenciales de
`android/firma.properties`, que **no se versiona**. Sin ese archivo, la
compilación de release avisa y sale sin firmar en lugar de entregar algo que no
se puede instalar.

Los pasos —crear el almacén de claves, apuntar el proyecto y comprobar la firma—
están en [android/LEEME-firma.md](android/LEEME-firma.md), con dos avisos que
importan: **al pasar de la versión de prueba a la firmada hay que desinstalar**,
porque Android no reemplaza una aplicación por otra con firma distinta, y eso
borra los datos locales, así que la bandeja de pendientes tiene que estar vacía
antes; y cada actualización necesita subir `versionCode`.

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
