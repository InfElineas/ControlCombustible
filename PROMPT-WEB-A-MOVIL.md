# Prompt: convertir una web en aplicación móvil con trabajo sin conexión

Prompt reutilizable para dar a un agente de código. Está escrito a partir de lo
que costó descubrir haciendo esto de verdad: cada requisito lleva **la trampa
concreta** que lo hace necesario, porque sin ella el agente toma el atajo obvio y
falla igual.

Copia desde la línea siguiente. Ajusta lo que va entre `⟨corchetes⟩`.

---

## Encargo

Tengo una web en producción (⟨React + Vite + Supabase + TanStack Query; ajústalo⟩)
y quiero una aplicación Android instalable, con la misma base de código, que sirva
para trabajar donde la cobertura falla.

Trabaja **por fases y en este orden**, entregando cada una compilando y
verificada antes de pasar a la siguiente. No adelantes fases.

### Fase 1 — Empaquetado

Capacitor sobre el build existente, sin reescribir la web.

- El `appId` debe ser un identificador propio con formato de dominio inverso.
- **Si la red donde compilas filtra `dl.google.com`**, Gradle no podrá descargar
  nada y el error no lo dirá claramente. Configura un espejo (Aliyun funciona)
  **fuera del repositorio**, en la configuración global de Gradle, y déjalo
  documentado: quien clone el proyecto en otra red no debe heredarlo.
- El `compileSdk` no es libre: Capacitor 7 referencia constantes de API 35 en su
  código Java, así que compilar contra una anterior es imposible por mucho que
  bajes las librerías. Si esa plataforma no está instalada y no se puede
  descargar, usa la siguiente que sí esté.

### Fase 2 — Lectura sin conexión

La aplicación debe abrir con los últimos datos descargados en lugar de una
pantalla vacía.

- Persiste la caché de consultas en IndexedDB, **no en localStorage**: un
  histórico de operaciones se acerca al límite de 5 MB.
- Usa **lista blanca explícita** de lo que se guarda. Deja fuera registros de
  auditoría, costos, márgenes y cualquier cosa sensible: acaba en un teléfono que
  se pierde. Comenta en el código por qué está fuera cada cosa.
- Caduca lo guardado a los pocos días. Un inventario de la semana pasada induce a
  más error que una pantalla vacía.
- **Revisa el tiempo de recolección de basura del cliente de consultas.** Si es
  más corto que el intervalo de persistencia, las consultas se descartan antes de
  llegar a guardarse y la caché queda siempre vacía. Es un fallo silencioso.
- Recuerda el rol o los permisos del usuario en almacenamiento local. Si la
  consulta del rol falla por falta de red y el código cae a un valor por defecto,
  el usuario abre degradado y pierde su menú. Deja escrito que el servidor sigue
  aplicando el rol real: esto solo evita que la interfaz mienta.

### Fase 3 — Que la aplicación **abra** sin conexión

Esto es distinto de la fase 2 y es donde más se falla. Compruébalo de verdad.

- **Con muchas librerías de autenticación, la función que devuelve la sesión
  devuelve `null` en cuanto el token de acceso caduca —suele durar una hora— y el
  refresco falla, aunque la sesión siga guardada en el dispositivo.** Si tu
  arranque corta a la pantalla de inicio de sesión con «no hay sesión», sin red no
  se puede hacer nada y los datos descargados quedan inalcanzables. Lee el código
  de la librería para confirmarlo en tu versión; no lo supongas.
- Distingue **«falta red para refrescar»** de **«aquí nadie ha entrado»**. Buena
  señal: si el token de refresco muere de verdad y hay conexión para comprobarlo,
  la librería borra ella misma la credencial guardada. Su presencia significa que
  la sesión sigue siendo legítima y solo falta red.
- **Ponle un plazo al arranque.** Sin red, esas librerías reintentan el refresco
  más de treinta segundos antes de rendirse: la aplicación se queda en blanco todo
  ese rato y el usuario la cierra. Arranca con lo guardado al vencer el plazo y
  corrige el estado si la respuesta llega después.
- **Cancela ese plazo en cuanto se resuelva la sesión.** Si no, con red la carga
  termina bien y el temporizador vuelve a encender el aviso de «sin conexión»
  segundos después, y se queda fijo. Me pasó.
- Abre en **solo lectura** con el último usuario conocido y dilo en pantalla: qué
  ve, que no puede guardar y que se revalida solo al recuperar la red.
- Declárame la contrapartida: quien tenga el teléfono desbloqueado podrá consultar
  lo ya descargado sin autenticarse. El servidor sigue rechazando toda escritura y
  esos datos ya estaban en el dispositivo, pero quiero decidirlo yo.

### Fase 4 — Escritura sin conexión

**Pregúntame qué operaciones entran antes de escribir código.** El criterio: solo
lo que no toque inventario ni dinero.

- Un registro que es un *compromiso* y no un movimiento real puede esperar. Un
  despacho de existencias, una compra o un cobro, no: dos personas registrando lo
  mismo sin verse acaban en negativo, y eso no lo arregla ninguna cola.
- **Genera el identificador en el cliente** y mándalo en la inserción. Si un envío
  llega pero su respuesta se pierde, el reintento choca contra la clave primaria y
  eso se lee como «ya estaba guardado». Sin esto, una respuesta perdida duplica el
  registro.
- **Los contadores calculados en el cliente chocan.** Un número de factura o
  correlativo se calcula sobre una lista que sin conexión puede estar vieja. Al
  enviar, si choca, pide el siguiente al servidor y reintenta; no rechaces el
  registro.
- **Clasifica los errores en reintentables y definitivos.** Red y sesión son
  transitorios: un token caducado se renueva solo en cuanto hay conexión, y
  tratarlo como rechazo descarta registros buenos. Validación y permiso son
  definitivos: reintentarlos mil veces da lo mismo y esconde el problema.
- **No proceses la cola mientras la sesión no esté validada**, o el servidor
  rechazará todo por el token y marcarás como rechazado lo que no tiene nada malo.
- Si la operación se audita al crearse por la vía normal, **mándala por esa misma
  vía** desde la cola, no con una inserción directa, o pierdes el registro de quién
  la hizo.
- Bandeja visible con lo pendiente y lo rechazado, su motivo, y botones de
  reintentar y descartar. Envío automático al abrir y al recuperar la red.
- **Lo guardado no aparece en las listas**, porque no está en el servidor. Pon un
  aviso en la propia página con el número de registros en espera; si no, el usuario
  cree que se perdió lo que registró.
- Borra la cola al cerrar sesión, igual que la caché.

### Fase 5 — Identidad y navegación móvil

- Genera el icono desde el logo de la web. **A sangre y con el símbolo al ~78 %**:
  el sistema recorta el icono adaptativo con máscaras distintas según el
  dispositivo y solo garantiza visible el 66 % central. El margen que el logo
  tenga se verá como un borde blanco en el lanzador.
- Navegación estilo aplicación de tienda: barra superior con logo, buscador, tema
  y menú de cuenta; barra inferior de cuatro pestañas más «Más».
- **Elige las pestañas por prioridad declarada, no por orden en la lista de
  navegación.** Cada rol ve un subconjunto distinto y con el orden de la lista un
  rol acotado acaba con pestañas vacías. Si una pestaña con contador no cabe, mueve
  el contador a «Más» para que el aviso no quede escondido.
- Objetivos táctiles de 40 px o más, con iconos de 20-24 px. Los tamaños de
  escritorio se quedan cortos para el dedo.

### Fase 6 — Sesión con proveedor externo dentro de la aplicación

- **Google prohíbe OAuth dentro de un WebView desde 2021.** El flujo normal acaba
  abriendo el navegador del sistema y la sesión se inicia allí, no en la
  aplicación. Ábrelo a propósito y recoge la vuelta por un enlace propio, con su
  filtro de intención declarado.
- **No supongas qué flujo usa tu librería.** Comprueba el valor por omisión leyendo
  su código: si es implícito, la vuelta trae los tokens en el fragmento y no un
  código en la consulta, y un lector que solo busque el código no encontrará nada.
  **Lee las dos formas.**
- Atiende la dirección de arranque en frío: si el sistema mató el proceso mientras
  el navegador estaba delante, la aplicación arranca ya con el enlace y el evento
  nunca llega.
- No proceses dos veces el mismo enlace: el código es de un solo uso y el segundo
  canje falla sin motivo real.
- **Muestra el motivo real del fallo**, no un texto fijo. Un enlace mal autorizado,
  un permiso negado y un canje fallido son tres cosas distintas y con un mensaje
  genérico se tarda horas en distinguirlas.

### Fase 7 — Contraseña propia para cuentas de proveedor externo

- Si alguien entró con un proveedor externo, **su contraseña de ese proveedor no
  puede servir para entrar por correo**: solo el proveedor puede comprobarla. Lo
  que sí puede tener la cuenta es una contraseña propia de la aplicación. Si te lo
  piden de la otra forma, dilo y ofrece esto.
- Formulario para crearla o cambiarla, accesible desde el menú de cuenta.
- Enlace en el inicio de sesión que envíe el correo para fijarla. Sirve igual a
  quien la olvidó y a quien nunca tuvo. No debe crear cuentas ni permitir averiguar
  quién está registrado.
- Al volver del correo, **abre el formulario solo**: dejar al usuario dentro sin
  saber a qué venía no sirve de nada.
- **Avisa a quien no tenga contraseña propia.** Tener la opción escondida en un
  menú no basta: el acceso por correo le falla sin explicación y no sabe que hay
  que ir a crearla. Mira la lista de proveedores de la cuenta y muestra un aviso
  descartable con un botón que abra el formulario.

### Fase 8 — Buscador global

Un único campo que busque en **todos** los tipos de dato y **no solo por nombre**:
también por códigos, matrículas, números de documento, referencias, estados,
fechas e importes.

- Reutiliza las mismas consultas que usan las páginas, para no añadir peticiones
  y seguir respondiendo sin conexión.
- **Consulta cada grupo solo si el rol puede abrir su destino.** Mostrar un
  resultado que al pulsarlo devuelve al panel por falta de permiso es peor que no
  mostrarlo.
- Cada resultado debe **aterrizar filtrado** en su página, reutilizando los
  parámetros que ya existan. Si el destino filtra por fecha, quítale ese filtro:
  el registro buscado puede ser de cualquier período.
- Limita los resultados por grupo. Con cincuenta filas la lista deja de servir.

### Fase 9 — Vista móvil

Revísala a 375 px y **mídela**, no la mires.

- **La causa más común de que «los bordes se salgan» está en el armazón, no en las
  páginas.** Un hijo de contenedor flexible sin `min-width: 0` crece con su
  contenido: un solo bloque ancho ensancha la página entera y arrastra consigo
  tarjetas, barras y márgenes. Empieza por ahí.
- Recorta el desbordamiento horizontal en el contenedor de contenido como red de
  seguridad, **solo en móvil**: en escritorio rompe los elementos fijos.
- Toda tabla ancha necesita **scroll propio**, o el recorte anterior la esconde.
- En los diálogos, alto máximo con scroll y margen lateral. Sin ellos, un
  formulario largo se sale por abajo con el botón de guardar fuera de alcance.
- **Si tu diálogo es una rejilla, declárale una columna de `minmax(0, 1fr)`**. Si
  no, las columnas crecen con su contenido y una fila larga ensancha el cuadro por
  dentro: el texto se sale por la derecha en lugar de recortarse.
- Apila a una columna los formularios de dos o tres columnas. Los paneles de
  cifras cortas déjalos: ahí las columnas sí caben y apilarlas solo alarga el
  scroll.
- **Cuidado con las filas que se ocultan por ancho.** Si un índice lateral se
  oculta en móvil pero su versión en tira sigue siendo hermana del contenido en la
  misma fila, la tira se queda el ancho y el texto se parte letra a letra.

### Fase 10 — Barras del sistema

- **Añade `viewport-fit=cover` al viewport.** Sin él las variables
  `env(safe-area-inset-*)` valen cero y cualquier reserva de espacio que escribas
  no hace nada. Es silencioso.
- Reserva el alto de la barra de estado como **relleno, no margen**, para que el
  fondo cubra esa franja.
- Aplícalo también a las pantallas que no pasan por el armazón común, como el
  inicio de sesión.
- En las versiones recientes de Android la ventana es de borde a borde por
  imposición del sistema, así que esto no es opcional.

### Fase 11 — Distribución

- La web debe invitar a instalar la aplicación: en el inicio de sesión y dentro,
  con una descripción breve de lo que aporta y un aviso descartable.
- No debe aparecer dentro de la propia aplicación ni en un sistema donde el
  archivo no se pueda instalar.
- Dirección configurable por variable de entorno.
- **Declara el tipo MIME del archivo de instalación en el servidor.** Sin él,
  Android no ofrece instalarlo y solo lo deja en la carpeta de descargas.
- Ponle `no-cache`: el nombre no lleva hash y una versión nueva quedaría escondida
  detrás de la vieja.
- **No metas el archivo en el repositorio**: son varios MB por versión.

## Cómo quiero que trabajes

- **Verifica antes de decir que está hecho.** Compilar no es verificar. Mide en el
  navegador con el tamaño de un móvil y dame el número.
- **Reproduce el fallo antes de arreglarlo** y mide después. «De 42 s en blanco a
  5,2 s» vale; «ahora va mejor» no.
- **Cuando algo no se pueda comprobar, dilo.** No lo presentes como verificado.
- Si te bloqueas por no tener credenciales, hay salida: **siembra el estado**. Se
  puede inyectar una sesión y una caché de consultas en el almacenamiento del
  navegador y recorrer la aplicación con datos falsos, sin credenciales de nadie.
  Si el persistidor serializa a texto, guarda texto: un objeto no rehidrata y
  cuesta un rato descubrirlo.
- **Comenta el porqué, no el qué.** Cada una de las trampas de arriba merece dos
  líneas en el código explicando qué pasaba antes; si no, el siguiente que pase
  las deshace.
- **Si te pido algo imposible, dímelo en una frase y ofrece lo más cercano.** No lo
  implementes a medias ni finjas que funciona.
- Al terminar cada fase, dime **qué tengo que configurar yo** fuera del código
  (direcciones autorizadas en el proveedor de identidad, archivos que subir al
  hosting, plataformas del SDK que instalar). Sepáralo de lo que ya está hecho.

## Configuración externa que suele hacer falta

- Autorizar el enlace propio de la aplicación en las direcciones de retorno del
  proveedor de identidad, y que coincida con el filtro de intención declarado.
- Autorizar también la dirección de la web para el correo que fija la contraseña.
- Subir el archivo de instalación al hosting, en la ruta que espera el enlace.
- Firmar la aplicación en modo de publicación si va a repartirse fuera de pruebas;
  lo de desarrollo solo vale para probar.
