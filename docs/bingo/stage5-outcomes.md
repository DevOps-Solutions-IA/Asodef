# ETAPA 5 — Persistencia de candidatos y ganadores

## Frontera transaccional

`BingoOutcomeCommandFacade` ejecuta `VALIDATE_CANDIDATE`,
`REJECT_CANDIDATE` y `CONFIRM_WINNER` mediante `BingoTransactionKernel`.
`PrismaBingoOutcomeService` recibe exclusivamente el `TransactionClient` de
esa frontera. Estado de dominio, idempotencia, auditoría y outbox confirman o
revierten juntos.

Los comandos usan `READ COMMITTED` con locks explícitos en el orden canónico:

`Event -> Round -> Execution -> Candidate -> Winner`.

El lock del evento serializa también la asignación de `BingoOutboxEvent.sequence`.
El índice único de PostgreSQL permanece como defensa final ante un productor
que incumpla el contrato.

## Validación y rechazo

- El actor proviene de `CommandContext` y debe tener `bingo.validate`; nunca se
  acepta un actor desde el payload.
- Solo `PENDING -> VALIDATED|REJECTED` es válido.
- Rechazar exige motivo no vacío y conserva la evidencia original.
- `DUAL_CONTROL` exige al supervisor configurado y lo compara contra todos los
  registros de `BingoExecutionActor`, no solamente contra un operador nominal.
- Cada cambio persiste auditoría y outbox allowlisted en la misma transacción.

## Confirmación y empates

La unidad de confirmación es `BingoWinGroup`, no el primer candidato recibido.
El comando exige que todos los candidatos simultáneos estén resueltos. Todos
los candidatos `VALIDATED` pasan juntos al dominio puro de ETAPA 4.

- `SPLIT_PRIZE`: guarda numerador, denominador, importe/unidades pagables y
  remanente como strings enteros exactos; no usa `float`.
- `FULL_PRIZE_EACH`: crea un `BingoWinner` independiente para cada candidato.
- `TIE_BREAK`: devuelve `BINGO_TIE_BREAK_REQUIRED`; no elige ganador ni crea
  una ejecución automáticamente.
- `PRECONFIGURED_SPECIAL_RULE`: devuelve `BINGO_SPECIAL_RULE_REQUIRED` con la
  referencia preconfigurada; nunca ejecuta JSON o código dinámico.

Cada ganador se crea primero como `PENDING_VALIDATION` para respetar el trigger
físico y se confirma en la misma transacción después de verificar que su
candidato está validado. `publicDisplaySnapshot` contiene únicamente versión y
número de cartón; no deriva ni almacena PII.

## Idempotencia y replay

La clave se limita por actor, scope y operación. Un replay de validación o
rechazo devuelve el estado previamente confirmado. Un replay de confirmación
reconstruye el conjunto completo de ganadores desde PostgreSQL; nunca depende
de una respuesta en memoria.

## Cobertura PostgreSQL

Las pruebas de integración verifican:

- dos candidatos simultáneos producen dos ganadores;
- reparto exacto y evidencia independiente;
- rechazo con motivo y sin borrado;
- supervisor distinto de todos los operadores;
- `TIE_BREAK` y regla especial sin selección arbitraria;
- rollback conjunto de candidato, idempotencia, auditoría y outbox;
- aislamiento de IDs entre eventos;
- replay sin ganadores duplicados.

La creación de la ejecución de desempate y la ejecución de una regla especial
son casos de uso separados. Este frente conserva la decisión estructurada y no
adelanta esas operaciones.
