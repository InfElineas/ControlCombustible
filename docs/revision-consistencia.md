# Revisión técnica: errores básicos y consistencia

Fecha: 2026-03-19

## Correcciones implementadas

1. **Persistencia local más robusta**
   - Se agregó fallback en memoria cuando `localStorage` no está disponible (SSR, navegadores con restricciones o modo privado).
   - Se evitó que un error de `localStorage` bloquee el flujo de lectura/escritura de entidades.

2. **Generación de IDs compatible**
   - Se agregó fallback para generación de IDs cuando `crypto.randomUUID()` no existe.

3. **Auth más tolerante a fallas de almacenamiento**
   - Se encapsuló acceso al token de sesión con funciones seguras (`get/set/remove`) para evitar errores no controlados.
   - Se aplicó limpieza defensiva del token también en el repositorio de Supabase ante `401`.

## Próximas mejoras recomendadas (priorizadas)

### Prioridad alta

1. **Normalizar manejo de errores de red**
   - Unificar estructura de errores (`code`, `message`, `origin`) en repositorios local/supabase.
   - Mostrar mensajes de error más claros en la UI por tipo de fallo (auth, conectividad, validación).

2. **Validación de datos de dominio**
   - Agregar validaciones de integridad para `Movimiento`, `Tarjeta` y `PrecioCombustible` antes de persistir.
   - Bloquear estados inválidos (ej. montos negativos, fechas futuras no permitidas, referencias inexistentes).

3. **Pruebas automáticas mínimas**
   - Tests unitarios para repositorios (`list/create/update/delete`).
   - Tests de contrato para `base44.entities.*` y `base44.auth.*`.

### Prioridad media

4. **Consistencia de idioma en UI**
   - Estandarizar textos al español (hay mensajes en inglés aislados).

5. **Telemetría básica de errores**
   - Registrar errores críticos (auth y persistencia) para diagnóstico rápido.

6. **Hardening de configuración**
   - Ampliar validación de `VITE_SUPABASE_URL` para escenarios de dominios personalizados.

### Prioridad baja

7. **Optimización de bundle**
   - Revisar imports de componentes UI para reducir peso inicial.

8. **Guía operativa de fallback local**
   - Documentar cuándo entra en fallback local y cómo detectarlo desde la UI.
