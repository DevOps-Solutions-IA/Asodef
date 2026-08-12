# Benchmark de representación de cartones Bingo

Fecha de ejecución: 2026-08-09
Alcance: decisión física de ETAPA 3; no implementa motor, API ni modelo Prisma.

## Decisión

La representación recomendada es híbrida:

1. `smallint[25]` como representación canónica, ordenada y reconstruible del cartón;
2. máscaras `bit(75)` derivadas y precalculadas para evaluar los patrones vigentes de una ronda;
3. índices B-tree para número de cartón y participante;
4. GIN sobre el array solamente si las consultas operativas por balota forman parte del perfil real.

Entre las alternativas evaluadas, las máscaras bitset ganaron la evaluación de patrones con
50.000 cartones: el peor p95 fue 24,516 ms para dos líneas, frente a 152,301 ms del modelo
normalizado, 285,805 ms del array y 345,601 ms del `bytea`. También alcanzaron 499,60 TPS
con cuatro clientes evaluando lleno sobre 50.000 cartones.

El bitset no debe ser el único dato canónico: una máscara de números no conserva por sí sola
la posición visual de cada balota. El array ordenado sí permite renderizar, verificar columnas,
regenerar máscaras y calcular un fingerprint. Las máscaras deben poder comprobarse o
regenerarse desde ese array; no constituyen una segunda fuente de verdad.

Esta decisión satisface el gate inicial de evaluación de 50.000 cartones (`p95 <= 250 ms`). La
implementación física debe volver a medir el registro híbrido real después de que Prisma y los
constraints definitivos existan.

## Entorno medido

| Elemento               | Valor                                                 |
| ---------------------- | ----------------------------------------------------- |
| PostgreSQL             | 16.14, Alpine, x86_64                                 |
| Host                   | Windows 11 Pro 64 bits                                |
| CPU                    | Intel Core i5-13420H, 8 cores / 12 logical processors |
| RAM host               | 25.459.089.408 bytes                                  |
| Docker Engine          | 29.6.1                                                |
| `shared_buffers`       | 128 MB                                                |
| `work_mem`             | 4 MB                                                  |
| `effective_cache_size` | 4 GB                                                  |
| JIT                    | desactivado para reducir variación de compilación     |
| Conexiones máximas     | 100                                                   |

La ejecución utilizó una base PostgreSQL dedicada, fuera del esquema ASODEF. Las tablas fueron
`UNLOGGED` para medir estructura y algoritmos sin confundir el resultado con WAL, réplica o
durabilidad del entorno local. Por ello, los tiempos de inserción comparan alternativas entre sí,
pero no predicen la latencia de escritura productiva.

## Metodología

El harness reproducible está en:

- `scripts/benchmarks/bingo-card-representation.sql`;
- `scripts/benchmarks/run-bingo-card-representation.ps1`;
- cuatro workloads `concurrency-*.sql` para `pgbench`.

Cada dataset contiene 5.000, 10.000, 25.000 o 50.000 arrays únicos. Un constraint `UNIQUE`
sobre el origen impide medir accidentalmente distribuciones repetidas. Cada cartón cumple:

- 25 posiciones ordenadas;
- rangos B `1..15`, I `16..30`, N `31..45`, G `46..60`, O `61..75`;
- cinco números sin repetir por columna;
- centro libre en la posición 13, codificado como cero solamente en el harness;
- un participante por cada tres cartones para los lookups operativos.

Se usó el mismo origen para las cuatro representaciones. La generación y la inserción tienen
cinco muestras. Cada consulta tiene dos warmups no registrados y quince muestras registradas.
Los percentiles se calcularon dentro de PostgreSQL mediante `percentile_cont`.

Una validación independiente sobre el dataset final confirmó 50.000 arrays distintos, 50.000
centros libres, 50.000 longitudes válidas y cero cartones con rango de columna o duplicados
inválidos. Las cuatro representaciones devolvieron el mismo conteo para cada patrón y tamaño.

El estado de sorteo contiene 60 balotas distribuidas en todo `1..75` (se excluyen los múltiplos
de cinco). Esto genera resultados positivos y negativos: en 50.000 cartones se detectaron 48.488
líneas, 31.033 cartones con dos líneas, 18.101 esquinas y 20.226 patrones diagonales. Ningún
cartón quedó lleno, lo cual obliga a recorrer y rechazar el dataset completo.

La generación común obtuvo:

| Cartones |  p50 ms |  p95 ms |
| -------: | ------: | ------: |
|    5.000 |  80,731 |  84,872 |
|   10.000 | 161,722 | 163,839 |
|   25.000 | 407,840 | 425,167 |
|   50.000 | 843,748 | 846,894 |

## Alternativas

### Normalizada

Una fila de cartón y 25 filas de celda, con PK `(card_id, position)`, unique
`(card_id, ball)` e índice `(ball, card_id)`. Ofrece la integridad relacional más granular, pero
crea 1,25 millones de celdas para 50.000 cartones.

### Array PostgreSQL + GIN

Una fila por cartón con `smallint[25]`, B-tree operativos y GIN para contención de balotas. Es
compacta, fácil de reconstruir y GIN acelera la búsqueda de cartones que contienen una balota.
La evaluación de patrones complejos sigue haciendo trabajo por elemento.

### Máscaras bitset

Una fila contiene cinco máscaras de fila y máscaras de esquinas, lleno y patrón configurable.
Cada máscara usa 75 bits. Una condición se evalúa como `(required & drawn) = required`. Es la
alternativa más rápida para patrones, a cambio de precálculo y de no poder reconstruir por sí
sola las posiciones del cartón.

### Compacta `bytea`

Una balota por byte en orden visual: 25 bytes por cartón. Minimiza almacenamiento, pero requiere
interpretar bytes para patrones y no ofrece constraints expresivos ni indexación natural. No se
recomienda como modelo principal mantenible.

## Inserción: p50 / p95 en milisegundos

| Cartones |             Normalizada |       Array + GIN |                Bitset |           `bytea` |
| -------: | ----------------------: | ----------------: | --------------------: | ----------------: |
|    5.000 |   2.013,878 / 2.021,977 |   22,789 / 26,316 |     133,506 / 134,568 |   40,533 / 43,887 |
|   10.000 |   4.023,802 / 4.089,061 |   55,274 / 66,412 |     264,993 / 266,747 |   80,071 / 81,516 |
|   25.000 | 10.039,254 / 10.050,089 | 143,262 / 151,474 |     667,929 / 672,115 | 201,374 / 209,664 |
|   50.000 | 20.145,809 / 20.196,197 | 282,265 / 290,116 | 1.330,037 / 1.334,619 | 397,263 / 403,811 |

La inserción bitset incluye el cálculo SQL de siete máscaras. Es una operación de preparación,
no el coste de cada extracción. En producción deberá hacerse antes de iniciar la ronda.

## Evaluación de patrones

Los valores siguientes son p50 / p95 en milisegundos.

### Línea

| Cartones |       Normalizada |       Array + GIN |          Bitset |           `bytea` |
| -------: | ----------------: | ----------------: | --------------: | ----------------: |
|    5.000 |   21,886 / 26,353 |   18,917 / 19,655 |   1,717 / 1,928 |   19,476 / 20,043 |
|   10.000 |   41,932 / 46,808 |   37,449 / 38,218 |   3,142 / 3,297 |   38,523 / 38,788 |
|   25.000 | 149,003 / 151,598 |  94,664 / 102,638 |  8,449 / 10,808 |   96,456 / 99,988 |
|   50.000 | 137,952 / 155,435 | 185,731 / 190,775 | 16,129 / 16,493 | 190,790 / 195,110 |

### Dos líneas

| Cartones |       Normalizada |       Array + GIN |          Bitset |           `bytea` |
| -------: | ----------------: | ----------------: | --------------: | ----------------: |
|    5.000 |   20,996 / 22,507 |   27,656 / 28,536 |   3,476 / 5,658 |   34,185 / 35,450 |
|   10.000 |   42,411 / 44,688 |   54,840 / 56,972 |   6,210 / 6,606 |   67,005 / 69,968 |
|   25.000 | 146,623 / 153,315 | 137,046 / 145,328 | 15,868 / 16,282 | 167,439 / 169,928 |
|   50.000 | 138,122 / 152,301 | 273,989 / 285,805 | 20,154 / 24,516 | 337,143 / 345,601 |

### Esquinas

| Cartones |     Normalizada |     Array + GIN |        Bitset |         `bytea` |
| -------: | --------------: | --------------: | ------------: | --------------: |
|    5.000 |   7,783 / 8,661 |   2,466 / 2,954 | 0,658 / 0,763 |   3,215 / 3,320 |
|   10.000 | 14,931 / 15,618 |   5,013 / 5,351 | 1,330 / 1,441 |   6,377 / 6,537 |
|   25.000 | 28,265 / 31,423 | 12,688 / 13,103 | 3,416 / 3,978 | 16,246 / 16,637 |
|   50.000 | 44,947 / 51,581 | 25,427 / 30,788 | 6,933 / 7,349 | 32,367 / 45,419 |

### Cartón lleno / full-card scan

| Cartones |     Normalizada |     Array + GIN |        Bitset |         `bytea` |
| -------: | --------------: | --------------: | ------------: | --------------: |
|    5.000 | 11,536 / 12,147 |   2,935 / 3,231 | 0,600 / 0,641 |   4,049 / 4,261 |
|   10.000 | 23,099 / 25,782 |   5,678 / 7,037 | 1,287 / 1,640 |   7,789 / 8,293 |
|   25.000 | 38,143 / 45,145 | 14,252 / 14,644 | 3,086 / 3,503 | 19,424 / 20,314 |
|   50.000 | 58,315 / 66,444 | 28,599 / 29,775 | 6,935 / 7,309 | 42,852 / 47,857 |

### Patrón configurable diagonal

| Cartones |     Normalizada |     Array + GIN |        Bitset |         `bytea` |
| -------: | --------------: | --------------: | ------------: | --------------: |
|    5.000 |   8,277 / 9,082 |   2,964 / 3,525 | 0,530 / 0,656 |   3,569 / 4,339 |
|   10.000 | 16,927 / 21,340 |   6,044 / 7,369 | 0,990 / 1,071 |   6,941 / 7,377 |
|   25.000 | 29,867 / 40,156 | 14,741 / 15,432 | 2,795 / 3,211 | 17,460 / 18,139 |
|   50.000 | 46,024 / 53,463 | 29,556 / 32,116 | 5,861 / 7,284 | 35,301 / 36,271 |

## Actualización frente a una nueva balota

La operación cuenta cartones que contienen la balota 61. Valores p50 / p95 ms:

| Cartones |   Normalizada |   Array + GIN |        Bitset |       `bytea` |
| -------: | ------------: | ------------: | ------------: | ------------: |
|    5.000 | 0,508 / 0,820 | 0,844 / 1,009 | 0,418 / 0,463 | 0,257 / 0,302 |
|   10.000 | 0,917 / 0,943 | 1,621 / 2,110 | 0,814 / 0,866 | 0,505 / 0,597 |
|   25.000 | 2,609 / 3,331 | 0,843 / 0,920 | 2,310 / 2,722 | 1,219 / 1,361 |
|   50.000 | 5,774 / 7,159 | 1,795 / 2,073 | 4,800 / 5,497 | 2,512 / 2,950 |

El plan de 50.000 para array utilizó `Bitmap Index Scan` sobre
`array_card_numbers_gin_idx`, seguido de `Bitmap Heap Scan`. Las máscaras y `bytea` hicieron
sequential scan; la normalizada utilizó su índice de balota para esta operación, aunque el plan
capturado adicionalmente para lleno fue paralelo.

## Lookups operativos

Con 50.000 cartones, el lookup por número y por participante estuvo entre 0,027 y 0,068 ms p95
en todas las alternativas gracias a B-tree. No existe una diferencia material para estas dos
consultas.

## Almacenamiento total

Incluye heap, TOAST e índices, expresado en MiB (`bytes / 1.048.576`).

| Cartones | Normalizada | Array + GIN | Bitset | `bytea` |
| -------: | ----------: | ----------: | -----: | ------: |
|    5.000 |       13,70 |        3,48 |   1,47 |    0,77 |
|   10.000 |       26,68 |        6,50 |   2,83 |    1,42 |
|   25.000 |       65,70 |       10,21 |   6,87 |    3,36 |
|   50.000 |      130,83 |       15,34 |  13,60 |    6,58 |

En 50.000, el array usa 5.898.240 bytes de tabla y 10.190.848 de índices; el coste dominante
es GIN. Bitset usa 10.821.632 de tabla y 3.440.640 de índices. El modelo híbrido final no se
midió como una quinta tabla, por lo que no debe publicarse una cifra de almacenamiento inventada.
Debe medirse después de definir si GIN es necesario y cómo se materializan los patrones custom.

## Concurrencia

`pgbench` ejecutó durante diez segundos por alternativa, con cuatro clientes y dos workers,
evaluando lleno sobre 50.000 cartones. No hubo transacciones fallidas.

| Representación | Transacciones | Latencia media ms |     TPS |
| -------------- | ------------: | ----------------: | ------: |
| Normalizada    |           336 |           119,901 |  33,361 |
| Array + GIN    |         1.114 |            35,995 | 111,126 |
| Bitset         |         4.996 |             8,006 | 499,599 |
| `bytea`        |           797 |            50,364 |  79,423 |

## `EXPLAIN ANALYZE`

Los planes se capturaron con `ANALYZE`, `BUFFERS` y JSON. En 50.000 cartones:

| Representación / operación | Plan relevante                         | Execution Time ms | Buffers hit/read |
| -------------------------- | -------------------------------------- | ----------------: | ---------------: |
| Array / nueva balota       | Aggregate → Bitmap Heap → Bitmap GIN   |             3,284 |          763 / 0 |
| Bitset / lleno             | Aggregate → Seq Scan                   |             6,650 |        1.316 / 0 |
| `bytea` / lleno            | Aggregate → Seq Scan                   |            39,240 |          417 / 0 |
| Normalizada / lleno        | Aggregate → Gather → Parallel Seq Scan |            82,886 |        5.531 / 0 |

Las mediciones son de cache caliente: todos los planes anteriores reportaron cero lecturas de
disco. Antes de un evento real deben repetirse en staging con configuración y presión de memoria
representativas de la VPS.

## Implicaciones para el modelo físico

- El array canónico debe tener exactamente 25 elementos y centro libre en la posición 13.
- Un constraint o función PostgreSQL debe validar rangos por columna y ausencia de duplicados.
- El número de cartón debe ser unique por evento; no es una propiedad del array.
- Las máscaras deben derivarse de array + patrón aprobado antes de iniciar una ronda.
- Una máscara custom debe estar vinculada al patrón/version de ronda; no debe sobrescribirse
  después de comenzar una ejecución.
- La aplicación debe comparar o regenerar máscaras durante preparación y pruebas de integridad.
- GIN debe mantenerse solamente si endpoints/operación consultarán cartones por balota. No ayuda
  directamente a las expresiones posicionales de línea y dos líneas.
- La generación y asignación son procesos distintos: el benchmark no autoriza creación automática
  de participantes ni personas.

## Limitaciones y siguiente validación

- El benchmark mide SQL local con tablas `UNLOGGED`, cache caliente y sin tráfico ASODEF.
- No mide red, Prisma, WAL, réplica, cifrado, auditoría ni contención productiva.
- La representación híbrida recomendada se infiere de dos componentes medidos por separado; debe
  agregarse como escenario explícito al benchmark después de implementar el schema físico.
- El estado de 60 balotas no produjo cartón lleno, pero sí fuerza el full scan completo, que es el
  peor caso relevante para latencia.
- La concurrencia mide consultas de lectura; los locks y comandos transaccionales pertenecen a
  las pruebas de persistencia de ETAPA 3 y al futuro motor.
- Los umbrales deben confirmarse en staging y en la VPS antes de producción.

Ninguna de estas limitaciones cambia la conclusión de ETAPA 3: array como dato canónico y bitsets
precalculados como estructura de evaluación es la opción más equilibrada entre integridad,
mantenibilidad y rendimiento observado.
