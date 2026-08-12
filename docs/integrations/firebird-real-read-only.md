# Master Adapter Firebird — Fase 1C

Estado: cliente real implementado y gate real de solo lectura validado con
secretos runtime autorizados. El adapter aún no está desplegado en la API de
producción.

## Driver seleccionado

`node-firebird` 2.14.3 se ejecuta mediante el protocolo Firebird en JavaScript y no requiere bindings nativos. El spike reproducible cargó el paquete sobre Node 20.20.2 y Alpine 3.23.4 sin modificar la imagen del API.

Capacidades utilizadas por ASODEF:

- placeholders posicionales y parámetros separados;
- charset `UTF8`;
- timeout de conexión;
- cancelación con `AbortSignal`, compatible con Firebird 3;
- pool limitado;
- transacción explícita `ISOLATION_READ_COMMITTED_READ_ONLY`;
- rollback y devolución de la conexión en toda salida.

Aunque la dependencia contiene otras capacidades, el bounded context solo expone `FirebirdReadClient.query(definition, parameters, options)`. El SQL proviene exclusivamente del catálogo estático validado.

## Identidad obligatoria

La configuración habilitada acepta únicamente `ASODEF_READONLY`. La primera consulta valida también `CURRENT_USER` en el servidor. Una identidad diferente produce `MASTER_IDENTITY_MISMATCH`, cierra el pool y bloquea consultas posteriores.

No se configura rol administrativo ni se utilizan credenciales heredadas.

## Gates reales

El comando controlado es:

```bash
pnpm --filter @asodef/api master:verify-readonly
```

Solo ejecuta, en orden:

1. `SELECT CURRENT_USER AS CURRENT_USER_NAME FROM RDB$DATABASE`
2. `SELECT 1 AS HEALTH_VALUE FROM RDB$DATABASE`
3. `SELECT COUNT(*) AS CONTRACT_COUNT FROM TBLCONTRATO`

La salida contiene únicamente estado, identidad validada, health y conteo. Los errores se reducen a un código de dominio; nunca incluyen configuración nativa.

El comando no debe ejecutarse hasta recibir por entorno host, database y password autorizados. No se buscan DSN ni credenciales existentes.

## Compatibilidad y límites

- Node 20 Alpine: validado en contenedor desechable.
- Firebird 3.0.6: protocolo, autenticación, UTF8 y lectura real quedaron
  validados por el gate autorizado con `CURRENT_USER=ASODEF_READONLY`, health
  `1` y conteo técnico dinámico `8687` al momento de la prueba.
- El driver nativo no fue seleccionado porque su instalación reproducible falló en Alpine durante el spike de esta fase y habría requerido cambios de toolchain/imagen sin justificación.
- El adapter no está conectado a autoservicio, OTP, frontend, pagos, Bold o conciliación.
