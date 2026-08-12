# Checklist de producción — Master Firebird read-only

Debe completarse en cada instalación, reboot, recreación de API, cambio de red,
rotación de llave/credencial y release que habilite Master. Los valores
sensibles no se copian a esta evidencia.

## Preflight

- [ ] SHA fuente y artefactos de imagen identificados.
- [ ] Working tree limpio y escaneo de secretos aprobado.
- [ ] Backup timestamped de `sshd`, UFW, Compose y tarea Windows disponible.
- [ ] Snapshot de IDs, restart counts y health de los seis contenedores
      `asodef-whatsapp-manager-production` guardado sin secretos.
- [ ] Variables `MASTER_FIREBIRD_*` presentes en runtime autorizado; ningún
      valor secreto impreso.
- [ ] Cuenta configurada exactamente `ASODEF_READONLY`, charset `UTF8` y flag
      acorde con la decisión de release.

## Windows gateway

- [ ] Task `ASODEF Master Firebird Tunnel` registrada según el runbook.
- [ ] Runtime usa OpenSSH portable, llave dedicada y host key fijada.
- [ ] Health JSON indica proceso vivo, target alcanzable y forward aceptado.
- [ ] Watchdog recupera el proceso tras terminar solo el PID SSH administrado.
- [ ] Logs JSONL no contienen llave, password Firebird ni stderr crudo.
- [ ] Recuperación antes del primer logon: aprobada y aplicada, o registrada
      explícitamente como `REQUIRES_OPERATOR_APPROVAL`.

## VPS y Docker

- [ ] Red externa interna `asodef_master_tunnel` coincide con IPAM aprobado.
- [ ] Solo API está conectada a la red Master con `172.25.51.2`.
- [ ] Listener existe únicamente en `172.25.51.1:33051`.
- [ ] No existe listener wildcard en `3051` ni `33051`.
- [ ] Docker no publica `3051` ni `33051`.
- [ ] Política efectiva de `sshd` restringe usuario, forwarding, listener,
      contraseña, PTY, agente, X11, túneles y shell según el artefacto revisado.
- [ ] UFW autoriza únicamente `172.25.51.2 -> 172.25.51.1:33051` en
      `asodef-master0`.
- [ ] Revisión privilegiada de nftables no muestra DNAT/publicación inesperada.
- [ ] Prueba desde Internet independiente confirma cerrados `3051` y `33051`.
- [ ] API llega a `172.25.51.1:33051`; web/edge/ACME no llegan.

## Backend Master

- [ ] `master:verify-readonly` termina con JSON `status=ok`.
- [ ] `currentUser` es exactamente `ASODEF_READONLY`.
- [ ] `healthValue` es `1`.
- [ ] Conteo técnico es numérico y no está hardcodeado.
- [ ] Catálogo contiene únicamente SELECT estático parametrizado.
- [ ] Operaciones `BLOCKED_WITH_EVIDENCE` no generan SQL.
- [ ] Health distingue disabled/available/unavailable sin filtrar internals.

## Recreate, reboot y post-deploy

- [ ] Tras recrear solo API, conserva `172.25.51.2` y el gate vuelve a pasar.
- [ ] Tras recuperar el túnel, el gate vuelve a pasar sin reiniciar Firebird.
- [ ] Tras reboot, se verificó en orden red, `sshd`, UFW, túnel, listener, API y gate.
- [ ] Contenedores protegidos conservan IDs/restart counts/health esperados.
- [ ] Ningún cambio alcanzó PostgreSQL, Redis, Bold, pagos o WhatsApp Manager.

## Resultado

- [ ] Gate local completo (`lint`, `typecheck`, pruebas, build, `ci:verify`).
- [ ] Exposición pública: `3051=CLOSED`, `33051=CLOSED`.
- [ ] Firebird data/schema/triggers/procedures: `UNCHANGED`.
- [ ] `SYSDBA` usado por ASODEF: `NO`.
- [ ] Secretos en repositorio/logs/artifacts: `NO`.
- [ ] Rollback validado o ensayado sin operación destructiva.
- [ ] Evidencia final señala por separado cualquier acción pendiente
      `REQUIRES_OPERATOR_APPROVAL`.
