# Firmar la aplicación para publicarla

El APK de `debug` sirve para probar, no para repartir. Esto describe cómo generar
uno firmado con tu propia clave.

Las contraseñas las eliges y las escribes tú: no están en el repositorio ni las
conoce nadie más.

## 1. Crear el almacén de claves (una sola vez)

`keytool` viene con el JDK de Android Studio. Desde la carpeta donde quieras
guardar la clave —**fuera del repositorio**—:

```bash
"/c/Program Files/Android/Android Studio/jbr/bin/keytool" -genkeypair -v -keystore combustible-release.jks -alias combustible -keyalg RSA -keysize 2048 -validity 10000
```

Te preguntará:

- **Contraseña del almacén** y, después, la de la clave. Puedes usar la misma.
- Nombre, organización, ciudad y país. Van dentro del certificado; pon los datos
  de la empresa. No es necesario que sean exactos para distribuir directamente.

`-validity 10000` son unos 27 años. Google recomienda que la clave sobreviva a la
aplicación; una validez corta obliga a migrar de clave, que es un problema.

> **Guarda ese archivo y sus contraseñas donde no se pierdan.** Es la identidad de
> la aplicación:
>
> - Android solo acepta una actualización firmada con **la misma** clave. Si la
>   pierdes, la única salida es publicar otra aplicación distinta y que todos
>   desinstalen la anterior.
> - Si algún día la subes a Play Store, sin esa clave no podrás actualizarla nunca
>   más.
>
> Cópialo a un sitio seguro que no sea este ordenador. No lo pongas en el
> repositorio: `.gitignore` ya bloquea `*.jks`, pero eso solo protege del
> descuido.

## 2. Apuntar el proyecto a la clave

Copia [firma.properties.ejemplo](firma.properties.ejemplo) como
`android/firma.properties` y rellénalo con la ruta y las contraseñas que acabas
de usar. Ese archivo está en `.gitignore`.

En Windows, en `storeFile` usa barras normales (`C:/Users/...`) o dobles
invertidas; una sola barra invertida no funciona.

## 3. Compilar

```bash
npm run build && npx cap sync android
```

Y después, con `JAVA_HOME` apuntando al JDK de Android Studio:

```bash
cd android && ./gradlew assembleRelease
```

El resultado queda en `android/app/build/outputs/apk/release/app-release.apk`.

Si sale `app-release-unsigned.apk`, es que Gradle no encontró
`android/firma.properties`; el aviso aparece al principio de la compilación.

Para Play Store, en su lugar:

```bash
cd android && ./gradlew bundleRelease
```

que produce `android/app/build/outputs/bundle/release/app-release.aab`.

## 4. Comprobar que quedó firmado

```bash
"/c/Users/infor/AppData/Local/Android/Sdk/build-tools/36.0.0/apksigner.bat" verify --print-certs android/app/build/outputs/apk/release/app-release.apk
```

Debe mostrar el certificado con su huella. Si dice que no está firmado, vuelve al
paso 2.

## Dos cosas que sorprenden la primera vez

**Hay que desinstalar la versión de prueba antes de instalar la firmada.** Android
no permite reemplazar una aplicación por otra con firma distinta: da un error de
conflicto de paquete. Y desinstalar **borra los datos locales**, así que antes:

- Comprueba que la bandeja «Sin enviar al servidor» está vacía. Lo que quede en la
  cola se pierde con la desinstalación, porque vive en el almacenamiento del
  teléfono y no en el servidor.
- La caché para trabajar sin conexión se vuelve a descargar sola al entrar con
  red, así que esa no importa.

Esto solo pasa **una vez**, al pasar de la versión de prueba a la firmada. Las
actualizaciones posteriores, firmadas con la misma clave, se instalan encima sin
perder nada.

**Para publicar una actualización hay que subir `versionCode`.** Está en
[app/build.gradle](app/build.gradle) junto a `versionName`. Android rechaza
instalar encima una versión con el mismo número o menor:

- `versionCode` es un entero que solo sube: 1, 2, 3…
- `versionName` es lo que ve la gente: `1.0`, `1.1`, `2.0`.

Si distribuyes por descarga directa desde la web, acuérdate de subir también el
archivo nuevo al hosting; el enlace no lleva hash y el `.htaccess` ya le pone
`no-cache` para que no quede escondido detrás del anterior.
