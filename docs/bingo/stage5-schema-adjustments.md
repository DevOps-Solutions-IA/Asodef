# Ajustes aditivos indispensables de ETAPA 5

## Snapshot reproducible de ejecución

ETAPA 3 conservaba `fairnessModeSnapshot` y `configurationVersion` en
`BingoRoundExecution`, pero el hash canónico de la configuración y la versión
del protocolo solo existían en `BingoFairnessCommitment`. Eso dejaba las
ejecuciones `CRYPTO_RNG` normales sin evidencia suficiente para identificar de
forma inequívoca la configuración y el contrato de aleatoriedad utilizados.

La migración `20260811120000_add_bingo_execution_fairness_snapshot` agrega:

- `configurationHash`: SHA-256 hexadecimal en minúsculas de la configuración
  canónica congelada.
- `fairnessProtocolVersion`: identificador versionado del protocolo de
  aleatoriedad aplicado a la ejecución.

Ambos campos son nullable durante el despliegue expand-only para no inventar
evidencia en ejecuciones `PLANNED` preexistentes. PostgreSQL exige el par
completo antes de que una ejecución abandone `PLANNED`; por tanto una fila
antigua no puede iniciar, cancelarse ni convertirse en evidencia oficial hasta
ser preparada por el caso de uso transaccional. Una vez asignados, los valores
son inmutables.

Para `CRYPTO_RNG_COMMIT_REVEAL`, `BingoFairnessCommitment` sigue conservando el
compromiso, algoritmos, versiones, `configurationHash` y seed cifrada. El start
debe comprobar que ambos hashes coincidan. La custodia de seed sigue siendo un
gate independiente y fail-closed; esta migración no crea ni simula un KMS.
