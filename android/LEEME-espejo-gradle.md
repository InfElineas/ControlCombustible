# Compilar la APK desde una red con `dl.google.com` filtrado

## El síntoma

Al sincronizar en Android Studio, o al ejecutar `gradlew assembleDebug`:

```
Could not find com.android.tools.build:gradle:8.7.2.
Searched in the following locations:
  - https://dl.google.com/dl/android/maven2/...
  - https://repo.maven.apache.org/maven2/...
  - https://plugins.gradle.org/m2/...
Required by:
    project :capacitor-android
```

## La causa

`dl.google.com` devuelve **404 en todo su árbol de artefactos** desde esta red,
incluidas versiones que existen. Es filtrado geográfico: Google responde 404 en
lugar de denegar el acceso, así que el mensaje engaña y parece que la versión no
existe.

Se comprobó que el resto sí es accesible: Maven Central, `services.gradle.org` y
el registro de npm responden con normalidad. Por eso `npm install` funciona y
solo falla la parte de Android.

## Por qué no basta con tocar `build.gradle`

`android/build.gradle` ya declara el espejo delante de `google()`, pero eso no
alcanza: los módulos de Capacitor que viven en `node_modules` traen **su propio
bloque `buildscript` con sus propios repositorios** y no heredan los del
proyecto raíz. La línea `Required by: project :capacitor-android` del error lo
señala.

Editar `node_modules` no sirve: se pierde en cada `npm install`.

## La solución aplicada

Un script de inicialización de Gradle, fuera del proyecto:

```
C:\Users\<usuario>\.gradle\init.d\espejo-google.gradle
```

Inyecta el espejo público de Aliyun en todos los repositorios que Gradle
consulta —incluidos los `buildscript` de los módulos— y se aplica a cualquier
compilación de ese usuario, tanto por consola como desde Android Studio, sin
configurar nada en el IDE.

**Ese fichero no está en el repositorio** porque es configuración de máquina. Si
se reinstala el equipo, o si otra persona clona el proyecto en la misma red, hay
que volver a crearlo. Su contenido está reproducido al final de este documento.

## Lo que hay que saber antes de confiar en el espejo

Aliyun es un espejo público de terceros, muy usado, que sirve el mismo
repositorio. Aun así, se está confiando en que sus copias son fieles: es una
dependencia de suministro que conviene tener presente.

Si en algún momento se quiere eliminar esa confianza, la alternativa es compilar
en un servidor sin el filtrado (por ejemplo GitHub Actions) y descargar la APK
ya construida.

Si la red deja de estar filtrada, basta borrar el script: los repositorios
oficiales siguen declarados detrás del espejo y Gradle volverá a usarlos.

## Contenido del script

```gradle
def espejoGoogle = 'https://maven.aliyun.com/repository/google'

settingsEvaluated { settings ->
    settings.pluginManagement.repositories {
        maven { url espejoGoogle }
        gradlePluginPortal()
        google()
        mavenCentral()
    }
}

gradle.beforeProject { project ->
    project.buildscript.repositories {
        maven { url espejoGoogle }
    }
    project.repositories {
        maven { url espejoGoogle }
    }
}
```
