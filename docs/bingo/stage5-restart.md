# Bingo ETAPA 5 — reinicio transaccional

Reiniciar una ejecución significa exclusivamente crear una nueva revisión
`PLANNED`. La ejecución cancelada permanece inmutable y conserva balotas,
candidatos, ganadores, timestamps, actores, fairness y auditoría.

## Flujo

1. exigir `bingo.manage` al actor autenticado;
2. validar hashes canónicos del comando e idempotency key;
3. abrir transacción `READ COMMITTED` idempotente;
4. bloquear en orden evento → ronda → ejecución anterior;
5. adquirir idempotencia dentro de esa transacción;
6. comprobar que la ejecución está `CANCELLED` y es la última revisión;
7. evaluar `evaluateRestart` de ETAPA 4;
8. exigir aprobación distinta de supervisor para `DUAL_CONTROL`;
9. crear `revision + 1` con `previousExecutionId` y snapshots congelados;
10. insertar audit y outbox;
11. completar idempotencia y hacer commit.

El lock de ronda hace segura la lectura de la última revisión. Los índices
únicos de PostgreSQL sobre `(round_id, revision)` y sobre el predecessor son
defensa adicional. Dos operadores no pueden crear simultáneamente la misma
revisión: uno crea el sucesor y el otro observa un predecessor obsoleto.

## Invariantes

- no se actualiza ni elimina la ejecución anterior;
- no se copian draws, candidates, winners ni commitment;
- se copian únicamente snapshots de configuración y reglas congeladas;
- commit-reveal exige un compromiso y una seed nuevos antes de poder iniciar;
- la misma key y request reproducen el mismo resultado;
- misma key con request diferente entra en conflicto mediante el repositorio
  común de idempotencia;
- cualquier fallo después de create, audit u outbox revierte todos los
  artefactos, incluida la idempotencia.

El reinicio conserva el estado actual de evento/ronda. Este caso de uso no
retrocede destructivamente sus máquinas de estado. La habilitación de inicio
de la nueva revisión debe ser coherente con la política operacional de ronda y
se valida separadamente por `StartExecution`.
