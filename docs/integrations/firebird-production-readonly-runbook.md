# Runbook de conectividad privada Firebird de solo lectura

Estado: red privada, `sshd`, UFW, API estable, watchdog manual y gates de
recuperación activos y verificados. La persistencia Windows `AtLogOn` permanece
`OPERATOR_GATE_PENDING`; el Master Adapter aún no está desplegado.

## Propósito y límites

Este runbook opera el canal privado usado por el bounded context Master de
ASODEF. No autoriza escrituras, cambios de esquema, procedimientos, pagos ni
uso de `SYSDBA`. El navegador nunca conoce Firebird. El stack protegido
`asodef-whatsapp-manager-production` está fuera de alcance.

## Topología actual verificada

```text
ASODEF API (172.25.51.2)
  -> bridge interno asodef-master0 / red asodef_master_tunnel
  -> 172.25.51.1:33051 (listener SSH, nunca wildcard)
  -> SSH saliente/reverse forward cifrado
  -> gateway Windows WIN-Q0DAPTGTQ4P
  -> 10.125.16.253:3051
  -> Firebird 3.0.6 / BDAdaSysSO / usuario ASODEF_READONLY
```

`172.23.0.1:33051` es el endpoint previo a la migración y solo puede usarse
durante rollback controlado. No debe coexistir permanentemente con el endpoint
objetivo.

## Puertos y límites de confianza

| Origen | Destino | Puerto | Control |
| --- | --- | ---: | --- |
| Gateway Windows | VPS SSH | 22 | llave dedicada, `publickey` únicamente |
| API `172.25.51.2` | gateway bridge `172.25.51.1` | 33051 | UFW y red interna dedicada |
| Gateway Windows | Firebird privado | 3051 | ruta privada existente |

Ni `3051` ni `33051` se publican mediante Docker ni se enlazan a
`0.0.0.0`/`::`. Solo API se conecta a la red dedicada. La cuenta del túnel no
tiene sudo, PTY, forwarding local, agent forwarding, X11 ni contraseña.

## Artefactos fuente de verdad

- Runtime Windows: `ops/master-tunnel/windows/` y
  `docs/integrations/firebird-tunnel-windows.md`.
- Red, Compose, UFW, `sshd` y verificadores VPS:
  `ops/master-tunnel/vps/` y `docs/integrations/firebird-vps-network.md`.
- Gate backend: script `master:verify-readonly`, configuración aislada y
  módulo `apps/api/src/modules/master/`.
- Mapeo funcional: `docs/integrations/firebird-domain-mapping.md`.
- Gate operativo: `docs/integrations/firebird-production-checklist.md`.

## Secretos y configuración

Los únicos nombres documentados para la conexión son:

- `MASTER_FIREBIRD_ENABLED`
- `MASTER_FIREBIRD_HOST`
- `MASTER_FIREBIRD_PORT`
- `MASTER_FIREBIRD_DATABASE`
- `MASTER_FIREBIRD_USER`
- `MASTER_FIREBIRD_PASSWORD`
- `MASTER_FIREBIRD_CHARSET`
- `MASTER_FIREBIRD_CONNECTION_TIMEOUT_MS`
- `MASTER_FIREBIRD_QUERY_TIMEOUT_MS`
- `MASTER_FIREBIRD_MAX_CONNECTIONS`
- `MASTER_FIREBIRD_CIRCUIT_FAILURE_THRESHOLD`
- `MASTER_FIREBIRD_CIRCUIT_RESET_MS`

La contraseña vive únicamente en el mecanismo de secretos runtime de la API.
La llave privada del túnel vive únicamente bajo el perfil Windows autorizado.
El repositorio contiene solo un archivo de configuración de ejemplo sin
secretos y nunca almacena `.env` productivo, llave privada, contraseña o
connection string.

## Orden de instalación y activación

Los pasos marcados requieren privilegios y son
`REQUIRES_OPERATOR_APPROVAL`; los artefactos hacen dry-run por defecto.

Esta secuencia se conserva como procedimiento reproducible. En la activación
de Fase 1D ya se completaron red, `sshd`, UFW, override Compose, recreación
controlada de API, listener, gates de seguridad y prueba de recuperación. El
paso 6 continúa pendiente exclusivamente para persistencia `AtLogOn`.

1. Capturar estado de contenedores protegidos, listeners, redes, UFW y política
   efectiva de `sshd`.
2. Ejecutar el dry-run de
   `ops/master-tunnel/vps/create-master-network.sh`.
3. `REQUIRES_OPERATOR_APPROVAL`: crear la red externa interna con `--apply`.
4. Revisar e instalar `sshd-asodef-tunnel.conf.example` como archivo root-only;
   ejecutar `sshd -t` antes de recargar, nunca reiniciar a ciegas.
5. Preparar en Windows la configuración con bind `172.25.51.1:33051`, host key
   fijada y ACL restringida de la llave.
6. `OPERATOR_GATE_PENDING`: un administrador Windows legítimo debe registrar
   la tarea `AtLogOn` mediante el script y la bandera explícita de aprobación.
   Recuperación antes de logon requiere la aprobación adicional documentada en
   el runbook Windows.
7. Ejecutar el dry-run de `configure-master-firewall.sh`.
8. `REQUIRES_OPERATOR_APPROVAL`: aplicar la regla exacta API → gateway:33051.
9. Incorporar `docker-compose.master-tunnel.yml` a la invocación de Compose y
   recrear solo la API pública, nunca el stack de WhatsApp.
10. Instalar los secretos runtime por su gestor autorizado, ejecutar los
    verificadores VPS y finalmente `master:verify-readonly`.
11. Retirar la regla/listener anterior solo tras superar todos los gates.

## Inicio normal

1. La red externa `asodef_master_tunnel` debe existir antes de Compose.
2. El túnel Windows debe estar activo antes del gate Master. Mientras
   `AtLogOn` siga pendiente, un operador inicia el watchdog R3 manualmente;
   esto no sustituye el gate de persistencia.
3. La API arranca con feature flag según la decisión de release. Deshabilitado
   no debe resolver DNS ni abrir socket Firebird.
4. Ejecutar el gate standalone. Solo permite `CURRENT_USER`, health y conteo
   técnico de contratos; no acepta SQL del operador.
5. Habilitar tráfico de aplicación únicamente después de comprobar que la
   identidad observada es exactamente `ASODEF_READONLY`.

## Health y observabilidad

Windows:

```powershell
& "$root\Test-AsodefFirebirdTunnel.ps1" -ConfigurationPath "$root\tunnel.config.json"
Get-ScheduledTaskInfo -TaskName 'ASODEF Master Firebird Tunnel'
```

VPS:

```sh
ops/master-tunnel/vps/verify-master-network.sh
ops/master-tunnel/vps/verify-host-security.sh
```

Backend:

```sh
pnpm --filter @asodef/api master:verify-readonly
```

El éxito backend es JSON con `status=ok`, usuario, health y conteo dinámico.
Los fallos solo contienen códigos sanitizados. Los logs operativos no incluyen
host/path del maestro, credenciales, filas, documentos ni stderr crudo.

## Recuperación

### Caída transitoria del túnel

El watchdog reinicia únicamente su proceso SSH con backoff acotado. Verificar
en orden: target privado desde Windows, proceso/forward, listener VPS,
conectividad API y gate. No reiniciar Firebird ni ampliar firewall.

### Después de reiniciar Windows

Hasta cerrar `OPERATOR_GATE_PENDING`, un operador autorizado debe iniciar
manualmente el watchdog R3 después del reinicio. Una vez registrada, la tarea
`AtLogOn` recuperará el túnel cuando inicie sesión el usuario autorizado. Para
recuperación previa al logon se necesita la acción privilegiada adicional
descrita en el runbook Windows. Después del arranque se ejecuta la lista de
comprobación completa.

### Después de reiniciar VPS o Docker

Confirmar red externa, política efectiva de `sshd` y UFW; después verificar el
listener. Recrear solo API con el override y comprobar que conserva
`172.25.51.2`. Finalmente ejecutar el gate. No tocar objetos protegidos.

### Después de desplegar API

Comparar contenedores protegidos antes/después, confirmar que solo API pertenece
a la red Master, verificar exposición, ejecutar el gate y comprobar el health
de la API. Una recreación no debe depender de una IP efímera.

## Rotación

La rotación de llave SSH sigue el procedimiento Windows/VPS con coexistencia
temporal de llaves públicas igualmente restringidas y validación antes de
retirar la anterior. La rotación de contraseña Firebird se realiza en el gestor
de secretos autorizado; este repositorio no crea usuarios ni concede permisos.
Después de cualquier rotación se ejecuta el gate exacto y el escaneo de logs.

## Rollback

1. Deshabilitar el feature flag Master si la conectividad está degradada; la
   API debe seguir arrancando sin sockets Firebird.
2. Detener la tarea nueva mediante el script Windows.
3. Recrear solo API sin el override de red Master.
4. Retirar por número la regla UFW exacta de Fase 1D.
5. Restaurar el backup de `sshd`, validar con `sshd -t` y recargar.
6. Desconectar/remover la red dedicada solo cuando no tenga endpoints.
7. Si se requiere restablecer temporalmente `172.23.0.1:33051`, hacerlo junto
   con la política y regla anterior documentadas; nunca abrir wildcard.
8. Confirmar API pública y comparar IDs/restarts/health de los seis contenedores
   protegidos.

El rollback no modifica Firebird, datos, esquema, PostgreSQL, Redis ni el stack
protegido. Los detalles ejecutables están en los README de Windows y VPS.

## Diagnóstico seguro

- Identity mismatch: abortar; no cambiar el usuario esperado ni usar SYSDBA.
- Timeout/unavailable: comprobar por capas, sin imprimir connection strings.
- Host key mismatch: validar la nueva huella fuera de banda; nunca desactivar
  `StrictHostKeyChecking`.
- Listener ausente: revisar tarea y política `PermitListen`; no publicar puerto.
- UFW bloquea después de recreate: verificar IPAM/override; no autorizar toda
  la subred egress.
- Operación funcional bloqueada: consultar el documento de mapeo y obtener
  evidencia/aprobación; no inferir estados legacy.
