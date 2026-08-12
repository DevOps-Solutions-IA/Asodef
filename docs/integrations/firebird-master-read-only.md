# Master Adapter Firebird — foundation de solo lectura

Estado: foundation de Fase 1A preservada. La implementación real del cliente se documenta en `firebird-real-read-only.md`; el feature flag permanece deshabilitado por defecto.

## Límite de seguridad

`BDAdaSysSO` se trata como un sistema externo protegido. El módulo no contiene
credenciales, DSN, IP ni ruta de base hardcodeada. El cliente real implementado
en Fase 1C permanece detrás del puerto de solo lectura, recibe su configuración
exclusivamente en runtime y no expone información maestra al frontend. No
modifica objetos ni datos Firebird.

La única arquitectura autorizada es:

```text
ASODEF API -> MasterQueryService -> MasterReadRepository -> FirebirdReadClient -> Firebird
```

El puerto `FirebirdReadClient` solo admite definiciones del catálogo estático y parámetros separados. No expone ejecución arbitraria, DDL, procedimientos ni transacciones de escritura.

## Configuración

El estado predeterminado es:

```dotenv
MASTER_FIREBIRD_ENABLED=false
MASTER_FIREBIRD_HOST=
MASTER_FIREBIRD_PORT=3051
MASTER_FIREBIRD_DATABASE=
MASTER_FIREBIRD_USER=
MASTER_FIREBIRD_PASSWORD=
MASTER_FIREBIRD_CONNECTION_TIMEOUT_MS=3000
MASTER_FIREBIRD_QUERY_TIMEOUT_MS=5000
MASTER_FIREBIRD_MAX_CONNECTIONS=4
MASTER_FIREBIRD_CIRCUIT_FAILURE_THRESHOLD=3
MASTER_FIREBIRD_CIRCUIT_RESET_MS=30000
```

Puerto, host y database son configurables. Con el flag deshabilitado, el módulo selecciona `DisabledMasterReadRepository`; no solicita configuración de conexión, no resuelve DNS y no abre sockets.

Activar el flag exige todos los campos de conexión, charset `UTF8` y la identidad exacta `ASODEF_READONLY`.

## Salud

`GET /api/v1/health/master` es independiente de la disponibilidad general de PostgreSQL y Redis.

- Deshabilitado: HTTP 200, `{ "status": "disabled" }`.
- Disponible en una fase posterior: HTTP 200, `{ "status": "ok" }`.
- Habilitado pero no disponible: HTTP 503, `{ "status": "unavailable" }` dentro del envelope HTTP global.

La única consulta técnica aprobada sobre una relación de sistema es:

```sql
SELECT 1 FROM RDB$DATABASE
```

`RDB$DATABASE` no se utiliza para ninguna operación funcional.

## Resiliencia

- Timeout abortable en el puerto del driver.
- Límite configurable de consultas concurrentes.
- Circuit breaker `CLOSED`, `OPEN`, `HALF_OPEN`.
- Excepciones nativas traducidas a errores de dominio.
- Firebird no forma parte del readiness crítico de la API.
- Una respuesta ausente nunca se sustituye por saldos, personas o contratos sintéticos.

## Spike histórico del driver

Se inspeccionó localmente, sin instalar en el workspace y sin conexión Firebird, `node-firebird-driver-native` 3.7.0 y sus interfaces.

Hallazgos:

- ofrece prepared statements y parámetros separados;
- permite transacciones con `accessMode: "READ_ONLY"`;
- expone cancelación de operaciones en el attachment;
- depende de `node-firebird-native-api`, `node-gyp` y una librería cliente Firebird nativa;
- no incluye evidencia suficiente para garantizar una instalación reproducible sobre la imagen Alpine/musl actual;
- conexión, charset, timeout real y compatibilidad de servidor no pueden demostrarse sin un entorno autorizado.

La Fase 1A no añadió un driver. Fase 1C seleccionó posteriormente el cliente JavaScript documentado en `firebird-real-read-only.md`, sin cambiar Alpine ni Docker.

## Exclusiones

- No integración con `/mi-cuenta`, `/empresa`, OTP, pagos o Bold.
- No `P_PAGOSPISCOPAY`.
- No `TBLPAYCONFIGURACION`.
- No SYSDBA, cuentas PiscoPay, DSN Windows, creación de usuarios o `GRANT`.
- No escritura, conciliación, recibos nuevos o actualización de saldos.
