# Fichas de costo de transportación — diseño

Documento de trabajo a partir de las respuestas del solicitante (2026-10-19) a las
doce preguntas enviadas el 2026-09-02. Referencia normativa: **Resolución 148/2023
del MFP**.

Nada de esto está implementado todavía. El objetivo del documento es acordar la
forma antes de escribir código.


## 1. Qué se pidió, en una frase

Dos cosas que hoy no existen y que se apoyan en lo que el sistema ya sabe:

1. **Una tarifa de referencia reutilizable**, en $/km por tipo de vehículo, para
   dar una oferta rápida.
2. **Una ficha de costo por servicio**, calculada antes del viaje como oferta y
   cerrada después con lo que de verdad pasó.


## 2. Las dos caras de una ficha

La respuesta a la pregunta 01 es la que más condiciona el diseño: la ficha es
**previsión y liquidación a la vez**.

| | Previsto | Real |
|---|---|---|
| Cuándo | antes del viaje, para ofertar | al cerrar el servicio |
| Distancia | ruta calculada entre los puntos previstos | recorrido efectivo, con las paradas que hubo |
| Combustible | km ÷ índice de consumo del vehículo | litros despachados de verdad |
| Precio del litro | CPP del día de la ficha | CPP del día del servicio |
| Para qué | la oferta al cliente | el margen real, y corregir los índices |

Una sola ficha guarda las dos columnas. Mientras no se cierre, la columna real
está vacía y la ficha vale como oferta. Al cerrarla se congela todo: una oferta
que cambia sola después de aceptada no sirve de nada.

**Por qué importa que estén juntas:** la diferencia entre las dos columnas es el
único dato que permite ajustar los índices de consumo y el supuesto de viajes al
mes (pregunta 10). Si la previsión y la liquidación viven en documentos
separados, esa comparación no la hace nadie.


## 3. Modelo de datos

### 3.1 Tarifa de referencia — `tarifa_transporte`

La tabla del día a día, tal como se lleva hoy:

| Tipo de vehículo | $/km |
|---|---|
| Triciclo | 0.50 |
| Carro | 1.00 |
| Camión | 1.50 |
| Rastra | 2.00 |

```sql
tarifa_transporte (
  id, tipo_consumidor_id → tipo_consumidor,
  precio_km numeric, moneda text,
  fecha_desde date, fecha_hasta date,     -- historial, no sobrescribir
  notas text, activo bool
)
```

El tipo de vehículo sale de `tipo_consumidor`, que ya existe y ya agrupa camiones,
equipos y demás. No hace falta un catálogo nuevo.

**Con fechas, no con un valor único:** una ficha de marzo tiene que seguir
mostrando la tarifa de marzo cuando se consulte en diciembre. Es el mismo patrón
que `precio_despacho_tipo`, que ya funciona así.

### 3.2 Parámetros económicos

Respuesta 03: unos son del vehículo y otros del tipo de servicio.

**Del vehículo** (van en `consumidor.datos_vehiculo`, que ya es JSONB):

- `valor_adquisicion` — lo que costó. Respuesta 09: se conoce en la mayoría.
- `vida_util_anios` y `valor_residual` — para la depreciación.
- `indice_consumo_real` — **ya existe y ya se usa**.

**Del tipo de servicio** — tabla nueva `parametro_servicio`:

- los cuatro porcentajes de la ficha: mantenimiento, gastos indirectos,
  gastos financieros, utilidad
- salario por hora y dieta del conductor
- viajes al mes estimados (respuesta 10: supuesto, ajustable)

Cada ficha guarda **una copia** de los parámetros con los que se calculó. Si
mañana sube el porcentaje de utilidad, las fichas ya emitidas no pueden cambiar
de importe solas.

### 3.3 Tasa de cambio — `tasa_cambio`

```sql
tasa_cambio (id, fecha date unique, usd_cup numeric, origen text, registrada_por)
```

Respuesta 08: sale de la tabla de elToque que registran las cajeras. **Propuesta:
empezar por la tabla manual**, con una fila por día, y dejar la automatización
para después. Razones en el punto 7.

### 3.4 La ficha — `ficha_costo`

```sql
ficha_costo (
  id, numero text unique,              -- correlativo visible
  cliente text, descripcion text,
  consumidor_id → consumidor,          -- el vehículo
  fecha date, estado text,             -- BORRADOR | EMITIDA | APROBADA | CERRADA | ANULADA
  ida_vuelta bool,                     -- respuesta 06: flexible

  puntos jsonb,                        -- [{nombre, lat, lng}] origen, intermedios, destino
  km_previstos numeric, km_reales numeric,
  litros_previstos numeric, litros_reales numeric,
  precio_litro numeric, precio_litro_manual bool,   -- respuesta 07
  tasa_cambio numeric,
  parametros jsonb,                    -- copia congelada
  importe_previsto numeric, importe_real numeric,

  elaborada_por, aprobada_por, fecha_aprobacion,
  movimientos_ids uuid[]               -- los despachos que pagaron este viaje
)
```

**`puntos` como JSONB y no como tabla aparte:** son una lista corta que solo tiene
sentido dentro de su ficha, nunca se consulta suelta y se congela al cerrar.


## 4. El recorrido

Respuesta 05: origen variable, puntos intermedios, y distancia por carretera real.

Esto **ya está resuelto** en el sistema y no hay que construirlo:

- [routingClient.js](src/api/routingClient.js) pide a OSRM la ruta real sobre una
  lista de puntos y devuelve la geometría y los kilómetros. Admite intermedios.
- La tabla `marcador` ya guarda puntos frecuentes con nombre y coordenadas, y hay
  un panel para gestionarlos.
- El mapa de Rutas ya pinta todo eso.

Falta solo el selector: elegir marcadores guardados o pinchar en el mapa, ordenar
los puntos, y marcar si es ida y vuelta (que duplica los km).


## 5. Quién hace qué

Respuesta 04: la elabora el contable, la aprueba un auditor o un jefe.

| Acción | Rol |
|---|---|
| Crear y editar en BORRADOR | `economico` |
| Emitir (pasa a EMITIDA) | `economico` |
| Aprobar o devolver a borrador | `auditor`, `superadmin` |
| Cerrar con los datos reales | `economico` |
| Anular | `superadmin` |
| Ver | todos los que ya ven Finanzas |
| Mantener tarifas de referencia | `economico` (respuesta 11) |

Una vez **APROBADA no se edita**. Para corregirla, se anula y se hace otra: en un
documento que va a un organismo, el rastro de qué se aprobó tiene que quedar.

Igual que con los estados de bonificación, **la regla va en un disparador de la
base**, no solo en la pantalla.


## 6. Por etapas

Cada etapa es útil por sí sola y se puede usar antes de empezar la siguiente.

1. **Tarifas de referencia.** La tabla $/km con su historial y su pantalla. Es lo
   que se usa hoy a mano y lo que da valor desde el primer día.
2. **Parámetros y valores de los vehículos.** Valor de adquisición y vida útil en
   la ficha del vehículo; porcentajes y salarios por tipo de servicio.
3. **La ficha, cálculo previsto.** Puntos en el mapa, km por OSRM, consumo por
   índice, CPP del día, y el desglose de la Resolución. Con exportación simple.
4. **Ciclo de aprobación.** Estados, roles, disparador y registro de auditoría.
5. **Cierre con datos reales.** Vincular los despachos del viaje y comparar
   previsto contra real.
6. **Exportación con el formato oficial.** Depende de recibir la plantilla.


## 7. Lo que falta para poder terminar

### 7.1 La plantilla oficial — bloquea solo la etapa 6

Hace falta el **archivo que se entrega hoy al organismo** (el Excel o el PDF
sellado), no una descripción. Un formato oficial se reproduce celda a celda:
nombre exacto de cada fila, orden, redondeos y firmas. Con la plantilla delante
es trabajo mecánico; sin ella es adivinar.

Las etapas 1 a 5 no dependen de esto.

### 7.2 La tasa de elToque — decisión, no bloqueo

Respuesta 08: «revisar con Claudia o extraer en tiempo real desde la web».

**Extraer en tiempo real desde el navegador no va a funcionar**: elToque no
publica una API abierta, el navegador bloquea las peticiones a otro dominio, y
cualquier cambio de maquetación deja el sistema sin tasa. Sería además una
dependencia externa en mitad de un cálculo que acaba en un documento oficial.

Tres opciones, de menos a más trabajo:

1. **Tabla manual.** Las cajeras ya registran la tasa; se escribe una fila al día.
   Es lo que propongo para empezar.
2. **Importar la tabla que ya lleva Claudia**, si está en un archivo o en otro
   sistema. Hay que ver primero qué es.
3. **Función en el servidor** que consulte elToque una vez al día y escriba la
   fila, con la manual como respaldo. Es la opción buena a medio plazo, y encaja
   sobre la tabla del punto 1 sin rehacer nada.

En los tres casos la ficha guarda **la tasa que usó**, no una referencia viva.

### 7.3 Dato pendiente del solicitante

El valor de adquisición de los vehículos. Respuesta 09: se conoce el de la
mayoría. Hay que cargarlo para que la depreciación salga de algo real; los que
falten quedarán marcados y su depreciación saldrá en cero, visible y no oculta.


## 8. Lo que este módulo **no** hace

Para que no haya sorpresa después:

- No factura ni cobra. Produce el documento de costo; el cobro sigue fuera.
- No programa viajes. Eso es Rutas, que ya existe.
- No sustituye al módulo de Transporte, que es gestión de flota (mantenimiento,
  somatón, licencias). Esto es una sección nueva al lado.
