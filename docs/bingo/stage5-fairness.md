# Bingo ETAPA 5 — fairness operacional

## Estado

`CRYPTO_RNG` queda operativo mediante `node:crypto.randomInt(maxExclusive)`. Node
implementa la selección entera sin sesgo modular y el dominio únicamente admite
el intervalo uniforme `[0, N)` sobre el conjunto ordenado de balotas disponibles.
El cliente no aporta la balota ni la entropía.

`CRYPTO_RNG_COMMIT_REVEAL` queda preparado criptográficamente, pero bloqueado
operacionalmente hasta disponer de custodia real para la semilla. El adaptador
seguro por defecto devuelve
`COMMIT_REVEAL_OPERATIONAL_BLOCKED_BY_SEED_CUSTODY`; nunca degrada a RNG normal,
texto claro, una clave general de ASODEF ni una custodia simulada.

## Algoritmos versionados

### RNG normal

- algoritmo: `node-crypto-random-int-v1`;
- entrada: conjunto único de balotas enteras entre 1 y 75;
- canonicalización: orden numérico ascendente;
- selección: `crypto.randomInt(N)`;
- evidencia allowlisted: versión, modo, algoritmo, cardinalidad, hash SHA-256 del
  conjunto canónico e índice seleccionado.

### Commit-reveal

- algoritmo: `asodef-bingo-hmac-sha256-rejection-v1`;
- seed: 32 bytes protegidos por `SeedCustody`;
- PRF: HMAC-SHA-256;
- muestra: primeros 48 bits big-endian del HMAC;
- mensaje: JSON canónico RFC 8785 con domain separation, versiones,
  `executionId`, `configurationHash`, secuencia, hash de balotas disponibles y
  contador;
- ausencia de sesgo: se rechaza la cola incompleta de `2^48` y solo entonces se
  aplica módulo `N`;
- reproducibilidad: seed revelada, contexto oficial y estado previo producen la
  misma secuencia completa.

El contador comienza en cero y solo avanza cuando una muestra cae en la cola
rechazada. Cambiar el algoritmo exige un nuevo identificador y nuevos vectores.

## Custodia

`SeedCustody` es la frontera formal. Un adaptador productivo deberá:

- generar mediante CSPRNG del sistema operativo;
- cifrar autenticadamente con clave dedicada y versionada;
- autenticar el contexto de evento/ronda/ejecución/revisión;
- no registrar seed, ciphertext ni resultados del callback;
- borrar buffers temporales;
- fallar cerrado si la clave o el backend no están disponibles.

No se incluyó KMS ficticio ni cifrado reutilizando claves existentes. Hasta que
ASODEF apruebe y configure un adaptador real, un evento que requiera
commit-reveal no puede iniciar. Esto no bloquea eventos configurados con
`CRYPTO_RNG`.

## Evidencia y privacidad

La evidencia de selección no contiene seed, ciphertext, `custodyKeyId`, PII ni
modelos Prisma. El ciphertext permanece exclusivamente en la entidad de
compromiso bajo la frontera de custodia y nunca debe ingresar a audit, outbox,
Redis, SSE o DTOs.
