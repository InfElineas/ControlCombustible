# Login con Google en la app Android (Android App Link)

elineas-auth solo devuelve el control a una dirección `https` (o `localhost`), no a
un esquema propio como `com.mercadoelineas.combustible://login`. Para que el
navegador del sistema devuelva el control a la app se usa un **Android App Link**:
una dirección https de nuestra web que Android abre directamente en la app.

## Ya hecho en el código
- `AndroidManifest.xml`: `intent-filter` con `autoVerify="true"` para
  `https://${appLinkHost}/Login`.
- `android/app/build.gradle`: `appLinkHost` sale de la propiedad `APP_LINK_HOST`.
  Sin ella vale `sin-configurar.invalid` (no intercepta nada).
- `src/lib/authNativa.js`: usa `VITE_NATIVE_REDIRECT` como destino y recoge la vuelta
  con `appUrlOpen`.

## Hay que hacer (necesita el dominio real y la firma de la app)
Sea `app.ejemplo.com` el dominio donde se sirve la web (donde está el `.htaccess`).

1. **Compilar la app con el dominio**
   `./gradlew assembleRelease -PAPP_LINK_HOST=app.ejemplo.com`
   (o añadir `APP_LINK_HOST=app.ejemplo.com` a `android/gradle.properties`).
2. **Publicar `https://app.ejemplo.com/.well-known/assetlinks.json`** (sin redirecciones,
   `Content-Type: application/json`, por HTTPS):
   ```json
   [{
     "relation": ["delegate_permission/common.handle_all_urls"],
     "target": {
       "namespace": "android_app",
       "package_name": "com.mercadoelineas.combustible",
       "sha256_cert_fingerprints": ["AA:BB:...:FF"]
     }
   }]
   ```
   La huella es la del certificado con el que se firma el APK de release:
   `keytool -list -v -keystore <almacen> -alias <alias>` → *SHA256*. Si se publica
   también el APK de pruebas con otra firma, se añade su huella a la lista.
   Se coloca en `public/.well-known/assetlinks.json` para que `npm run build` lo copie
   a `dist/` (el `.htaccess` ya sirve los ficheros existentes).
3. **Variables del frontend** para el build de la app:
   `VITE_NATIVE_REDIRECT=https://app.ejemplo.com/Login`
4. **En elineas-auth**: añadir `https://app.ejemplo.com` a `GOOGLE_REDIRECT_ORIGINS`
   (y a `ALLOWED_ORIGIN`, porque el WebView también llama a la API: su origen es
   `https://localhost`, que hay que añadir igualmente).

## Comprobar
- `adb shell pm get-app-links com.mercadoelineas.combustible` → el dominio debe salir
  como `verified`.
- `adb shell am start -a android.intent.action.VIEW -d "https://app.ejemplo.com/Login?x=1"`
  debe abrir la app, no el navegador.
- En la app: «Google» → elegir cuenta → vuelve a la app con la sesión iniciada.

## Si no se puede hacer
El login con **correo y contraseña** funciona igual en la app. Google en Android
quedaría desactivado hasta resolver los pasos anteriores.
