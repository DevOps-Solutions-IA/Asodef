# Túnel privado Firebird — runtime Windows

Estado: runtime R3 instalado y watchdog manual validado en Windows Server 2016
con recuperación automática comprobada. El registro persistente `AtLogOn`
permanece `OPERATOR_GATE_PENDING` por requerir un administrador legítimo.

## Alcance y decisión

El gateway `WIN-Q0DAPTGTQ4P` inicia una conexión SSH **saliente** usando el
cliente OpenSSH portable ya validado. No se instala OpenSSH Server, no se abre
ningún puerto entrante en Windows y no se publica Firebird.

El lifecycle seleccionado tiene dos capas:

1. una tarea limitada al usuario actual, disparada al iniciar sesión;
2. un watchdog que conserva una sola instancia, verifica el destino privado y
   reinicia SSH con backoff exponencial tras fallos transitorios.

Este modo no requiere privilegios administrativos ni almacena una contraseña
de Windows. Su límite es que la recuperación después de reiniciar Windows
ocurre cuando el usuario autorizado inicia sesión. Ejecutar antes del primer
inicio de sesión requiere una tarea `AtStartup` con una identidad administrada
y el derecho `Log on as a batch job`. Ese cambio está marcado
`REQUIRES_OPERATOR_APPROVAL` y no lo realizan estos scripts.

## Controles de seguridad

El launcher fuerza:

- `BatchMode=yes`, `PasswordAuthentication=no` y
  `KbdInteractiveAuthentication=no`;
- `PreferredAuthentications=publickey`, `IdentitiesOnly=yes` e
  `IdentityAgent=none`;
- `ExitOnForwardFailure=yes`;
- keepalive de servidor y timeout de conexión;
- `StrictHostKeyChecking=yes` con un archivo `known_hosts` fijado;
- diagnóstico transitorio mediante el archivo local de OpenSSH `-E`, sin
  callbacks asíncronos de PowerShell; solo la categoría sanitizada se conserva
  en el log operacional;
- `ForwardAgent=no`, `RequestTTY=no` y `PermitLocalCommand=no`;
- configuración SSH global/de usuario ignorada mediante `-F NUL`;
- únicamente la identidad `asodef-tunnel` y el forward aprobado
  `172.25.51.1:33051 → 10.125.16.253:3051`.

La configuración falla cerrada si cambia cualquiera de esos límites. La llave
privada permanece exclusivamente en:

```text
C:\Users\asodef3\asodef-tools\tunnel-key\asodef-firebird-tunnel-ed25519
```

El repositorio no contiene la llave ni su contenido. El script también rechaza
una ACL que conceda acceso a `Everyone`, `Authenticated Users` o `Users`.

## Orden de activación de Fase 1D

El endpoint activo `172.25.51.1:33051` pertenece al bridge dedicado y estable
de Fase 1D. Antes de activar el watchdog se crearon y validaron:

1. el bridge/red dedicado con gateway `172.25.51.1`;
2. la política `sshd` que permite exclusivamente ese `PermitListen`;
3. la regla de firewall limitada al camino de la API ASODEF;
4. la ausencia de publicación pública de `3051` y `33051`.

El endpoint `172.23.0.1:33051` es histórico y previo a la migración. Se
conserva únicamente como referencia de rollback controlado; no es el listener
actual y no debe coexistir con el endpoint activo salvo durante una transición
de rollback acotada.

## Preparación por el operador

La preparación y ejecución manual se realizan en PowerShell como el usuario
Windows propietario de la llave. En el host productivo actual, registrar la
tarea `AtLogOn` exige un administrador legítimo y permanece como gate externo;
no se intenta evadir UAC.

1. Copiar el directorio `ops/master-tunnel/windows` a una ruta estable bajo
   `C:\Users\asodef3\asodef-tools\master-tunnel`.
2. Copiar `tunnel.config.example.json` como `tunnel.config.json`.
3. Confirmar que las rutas locales del JSON corresponden a los archivos ya
   instalados. El JSON no contiene secretos.
4. Crear `known_hosts` solo después de comparar fuera de banda la huella del
   host VPS con la huella proporcionada por el administrador. No se acepta
   trust-on-first-use automático.
5. Restringir la ACL de la llave al usuario propietario, `SYSTEM` y
   `Administrators`. No pegar la llave en consola, logs ni tickets.

La prueba manual, antes de registrar la tarea, es:

```powershell
$root = "$env:USERPROFILE\asodef-tools\master-tunnel"
& "$root\Start-AsodefFirebirdTunnel.ps1" `
  -ConfigurationPath "$root\tunnel.config.json"
```

Se detiene desde otra consola con:

```powershell
& "$root\Stop-AsodefFirebirdTunnel.ps1" `
  -ConfigurationPath "$root\tunnel.config.json"
```

## Registro de la tarea

`OPERATOR_GATE_PENDING`: el registro modifica Task Scheduler, exige una
bandera explícita y debe ejecutarlo un administrador legítimo:

```powershell
$root = "$env:USERPROFILE\asodef-tools\master-tunnel"
& "$root\Register-AsodefFirebirdTunnelTask.ps1" `
  -ConfigurationPath "$root\tunnel.config.json" `
  -OperatorApproved
Start-ScheduledTask -TaskName 'ASODEF Master Firebird Tunnel'
```

El resultado usa `RunLevel Limited`, `LogonType Interactive`, una sola
instancia y reintento de la tarea si el watchdog termina de forma inesperada.
No guarda contraseñas.

Hasta que se complete ese gate, el watchdog R3 se ejecuta manualmente bajo
`asodef3`. La prueba de recuperación ya terminó correctamente: al finalizar
solo el proceso SSH hijo administrado, el estado pasó a `reconnecting`, volvió
a `running` con PID nuevo, mantuvo un único proceso SSH y restauró listener VPS
y conectividad TCP desde la API.

### Recuperación antes del primer logon

`REQUIRES_OPERATOR_APPROVAL`: un administrador Windows debe crear una tarea
`AtStartup`, con una cuenta dedicada no administrativa que tenga únicamente
`Log on as a batch job`, y seleccionar “Run whether user is logged on or not”.
La contraseña de esa identidad debe introducirse interactivamente en Task
Scheduler; nunca debe aparecer en un comando, archivo, variable del repositorio
o log. La acción debe ser exactamente la misma creada por el script de registro.

Antes de aplicar esa variante, el operador debe exportar la tarea `AtLogOn`,
registrar el rollback y verificar que ninguna credencial quede en el XML
exportado. No se debe convertir la cuenta en administradora ni instalar un
servicio SSH entrante.

## Operación

Inicio:

```powershell
Start-ScheduledTask -TaskName 'ASODEF Master Firebird Tunnel'
```

Estado Windows:

```powershell
& "$root\Test-AsodefFirebirdTunnel.ps1" `
  -ConfigurationPath "$root\tunnel.config.json"
Get-ScheduledTaskInfo -TaskName 'ASODEF Master Firebird Tunnel'
```

El health devuelve JSON y comprueba:

- proceso `ssh.exe` creado desde la ruta portable aprobada;
- conectividad del gateway a `10.125.16.253:3051`;
- forward aceptado al iniciar, inferido por el proceso vivo con
  `ExitOnForwardFailure`.

La disponibilidad end-to-end del listener se confirma de forma independiente
en el VPS/API. No se concede shell al usuario de túnel solo para realizar un
health check.

Reinicio:

```powershell
& "$root\Restart-AsodefFirebirdTunnel.ps1" `
  -ConfigurationPath "$root\tunnel.config.json"
```

Detención:

```powershell
& "$root\Stop-AsodefFirebirdTunnel.ps1" `
  -ConfigurationPath "$root\tunnel.config.json"
```

Deshabilitar o retirar:

```powershell
Disable-ScheduledTask -TaskName 'ASODEF Master Firebird Tunnel'
Unregister-ScheduledTask -TaskName 'ASODEF Master Firebird Tunnel' -Confirm
```

## Logs y observabilidad

Los eventos operativos se escriben como JSON Lines en:

```text
%LOCALAPPDATA%\ASODEF\master-tunnel\tunnel.jsonl
```

El tamaño predeterminado es 5 MiB con cinco archivos retenidos. Solo se
registran timestamp, nivel, evento, exit code y categoría sanitizada. Nunca se
registra stderr crudo, llave privada, contraseña Firebird, connection string,
documentos o filas del maestro.

El estado actual vive en `state.json` dentro del mismo directorio. No contiene
secretos.

Alertas recomendadas:

- `target_unavailable` repetido: revisar la ruta privada Windows → Firebird;
- `public_key_authentication_failed`: revisar vigencia de la llave pública;
- `host_key_verification_failed`: detenerse y verificar la huella fuera de
  banda; no borrar `known_hosts` para omitir el control;
- `remote_forward_failed`: comprobar exclusivamente el listener y política SSH
  dedicados en el VPS;
- `transport_unavailable`: revisar salida Windows → VPS TCP/22.

## Prueba de recuperación controlada

Sin tocar Firebird:

1. obtener health `status=ok`;
2. detener solo el proceso `ssh.exe` identificado por `state.json` mediante el
   script `Stop-AsodefFirebirdTunnel.ps1` **no sirve para esta prueba**, porque
   solicita una detención deliberada del watchdog;
3. para inyección de fallo, el operador puede terminar únicamente ese PID con
   `Stop-Process`; no detener otros procesos SSH;
4. comprobar en el log `tunnel_disconnected` seguido de `tunnel_established`;
5. comprobar health Windows y después el gate read-only desde API/VPS.

La prueba no reinicia Windows, no altera Firebird y no toca el stack protegido
de WhatsApp.

## Rotación de la llave de túnel

1. Generar una nueva llave dedicada en Windows; la privada nunca sale del
   gateway.
2. Entregar únicamente la llave pública al administrador VPS por un canal
   autorizado.
3. `REQUIRES_OPERATOR_APPROVAL`: agregar temporalmente la nueva llave pública
   con exactamente las mismas restricciones de `authorized_keys`.
4. Actualizar `privateKeyPath`, reiniciar y validar health + gate read-only.
5. Retirar la llave pública anterior y conservar evidencia de la rotación.
6. Si falla, restaurar el path anterior y reiniciar; no relajar autenticación.

La rotación de host key exige igualmente verificar la huella nueva fuera de
banda antes de reemplazar la entrada fijada en `known_hosts`.

## Troubleshooting y rollback

Rollback del runtime Windows:

1. deshabilitar la tarea nueva;
2. solicitar la detención mediante el script;
3. restaurar la configuración pre-migración cuyo bind era
   `172.23.0.1:33051`, solamente si la política VPS anterior también fue
   restaurada y validada;
4. restaurar el directorio de scripts/configuración anterior si existe;
5. rehabilitar la tarea anterior;
6. comprobar primero el target privado, después listener VPS y finalmente el
   gate read-only.

No se debe abrir `33051` públicamente, publicar `3051`, cambiar Firebird,
utilizar `SYSDBA`, conceder permisos adicionales ni tocar el stack
`asodef-whatsapp-manager-production` como mecanismo de recuperación.
