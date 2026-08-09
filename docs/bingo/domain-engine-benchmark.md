# Bingo ASODEF — Benchmark del motor puro de patrones

Estado: evidencia reproducible de ETAPA 4. Este benchmark mide el dominio compilado real; no mide PostgreSQL, Redis, SSE, HTTP ni capacidad de la VPS.

## 1. Conclusión

La primera medición sobre el evaluador integrado incumplió el gate de `p95 <= 250 ms` para 50.000 cartones. El resultado no se ocultó: se utilizó para optimizar la preparación de máscaras y el batch path del mismo motor de dominio.

Después de la optimización, los cinco patrones cumplen en el entorno medido:

- peor `p95` a 50.000: `178,693 ms` (`TWO_LINES`);
- peor `p99` a 50.000: `186,879 ms` (`TWO_LINES`);
- gate: `p95 <= 250 ms` y referencia secundaria `p99 <= 500 ms`;
- resultado: **gate aprobado en este entorno**.

Esto no sustituye la prueba de carga posterior sobre la VPS ni autoriza ETAPA 5.

## 2. Reproducción

Desde la raíz del repositorio, con Node.js y pnpm disponibles:

```powershell
./scripts/benchmarks/run-bingo-domain-engine.ps1
```

El runner:

1. compila `@asodef/api`;
2. ejecuta Node.js con `--expose-gc`;
3. genera layouts únicos mediante `BingoCardGenerator` y un `RandomSource` seeded;
4. invoca `evaluatePatternBatch` del dominio compilado;
5. emite un reporte JSON completo por stdout.

El benchmark está separado de Jest y no forma parte de la suite unitaria habitual.

## 3. Entorno de la medición final

| Campo           | Valor                                                          |
| --------------- | -------------------------------------------------------------- |
| Commit medido   | `ab272ee967c7c21674cc59dc43e0c7a5830a5842`                     |
| Base optimizada | `1b7cf78dd56952a6e300f466936b2c14d33d1f9a`                     |
| Node.js         | `v20.20.2`                                                     |
| SO              | Windows 11, `Windows_NT 10.0.26200`, x64                       |
| CPU             | Intel Core i5-13420H, 12 procesadores lógicos                  |
| RAM visible     | 23,711 GiB                                                     |
| Balotas         | 75; caso terminal donde todos los cartones resultan candidatos |
| Warmups         | 2 por patrón y dataset                                         |
| Muestras        | 20 por patrón y dataset                                        |
| Percentiles     | interpolación lineal sobre muestras ordenadas                  |
| GC              | forzado antes de cada muestra y fuera del intervalo medido     |

Usar 75 balotas constituye un caso costoso: obliga a materializar y ordenar todos los candidatos, además de evaluar cada cartón. El `candidateChecksum` fue `datasetSize × 20` para cada patrón; esto evita presentar como equivalente una ejecución que descartó resultados.

## 4. Generación de cartones únicos

| Cartones |     Tiempo | Throughput | Delta heap |  Delta RSS |
| -------: | ---------: | ---------: | ---------: | ---------: |
|    5.000 |  75,690 ms |   66.059/s |  3,366 MiB | 10,016 MiB |
|   10.000 | 114,341 ms |   87.457/s | 12,440 MiB |  1,902 MiB |
|   25.000 | 360,925 ms |   69.266/s | 14,880 MiB |  5,137 MiB |
|   50.000 | 682,039 ms |   73.310/s | 28,685 MiB | -2,320 MiB |

El delta RSS puede ser negativo por liberación/compactación previa del runtime y no representa memoria negativa. Para capacidad se usan también los picos absolutos de evaluación de la sección 6.

## 5. Evaluación final del dominio real

Tiempos en milisegundos. Throughput calculado con el `p50`.

| Cartones | Patrón       |     p50 |     p95 |     p99 | Cartones/s |
| -------: | ------------ | ------: | ------: | ------: | ---------: |
|    5.000 | LINE         |   5,218 |  12,634 |  16,673 |    958.203 |
|    5.000 | TWO_LINES    |   9,040 |   9,417 |   9,539 |    553.073 |
|    5.000 | FOUR_CORNERS |   2,729 |   3,077 |   3,532 |  1.832.374 |
|    5.000 | FULL_CARD    |   9,370 |   9,718 |   9,927 |    533.609 |
|    5.000 | CUSTOM       |   3,338 |   3,569 |   4,146 |  1.498.060 |
|   10.000 | LINE         |  10,187 |  10,613 |  10,907 |    981.653 |
|   10.000 | TWO_LINES    |  20,392 |  24,737 |  25,039 |    490.398 |
|   10.000 | FOUR_CORNERS |   5,375 |   5,832 |   5,976 |  1.860.552 |
|   10.000 | FULL_CARD    |  20,046 |  25,053 |  27,221 |    498.851 |
|   10.000 | CUSTOM       |   7,722 |  13,007 |  13,695 |  1.295.043 |
|   25.000 | LINE         |  41,164 |  53,273 |  55,560 |    607.324 |
|   25.000 | TWO_LINES    |  86,528 |  95,517 |  95,932 |    288.922 |
|   25.000 | FOUR_CORNERS |  29,314 |  34,520 |  35,551 |    852.848 |
|   25.000 | FULL_CARD    |  82,934 |  92,022 |  94,696 |    301.445 |
|   25.000 | CUSTOM       |  31,842 |  38,777 |  40,444 |    785.138 |
|   50.000 | LINE         |  96,594 | 112,755 | 112,843 |    517.629 |
|   50.000 | TWO_LINES    | 151,707 | 178,693 | 186,879 |    329.582 |
|   50.000 | FOUR_CORNERS |  52,333 |  61,902 |  63,180 |    955.417 |
|   50.000 | FULL_CARD    | 145,854 | 173,814 | 183,206 |    342.808 |
|   50.000 | CUSTOM       |  58,375 |  72,404 |  74,682 |    856.525 |

## 6. CPU y memoria a 50.000 cartones

CPU en milisegundos de proceso. Heap/RSS son máximos absolutos observados después de la evaluación.

| Patrón       | CPU p50 | CPU p95 | CPU p99 |  Peak heap |    Peak RSS |
| ------------ | ------: | ------: | ------: | ---------: | ----------: |
| LINE         | 156,000 | 234,050 | 234,810 | 84,165 MiB | 137,129 MiB |
| TWO_LINES    | 211,000 | 346,350 | 382,070 | 92,762 MiB | 155,352 MiB |
| FOUR_CORNERS | 109,000 | 172,800 | 184,960 | 80,470 MiB | 142,648 MiB |
| FULL_CARD    | 203,000 | 284,100 | 331,220 | 81,540 MiB | 144,656 MiB |
| CUSTOM       | 101,500 | 190,150 | 238,030 | 80,498 MiB | 143,293 MiB |

La granularidad del contador de CPU en Windows produce valores cero en datasets pequeños; por eso no se utilizan esos valores como evidencia de ausencia de trabajo.

## 7. Baseline fallido y mejora

Baseline ejecutado sobre `af043c30811b0c1d2cfdb1b284419af99d531ce7`, con el mismo equipo, 75 balotas, 2 warmups y 9 muestras nearest-rank. Con 9 muestras, p95 y p99 seleccionan el máximo y resultan iguales; se conserva esa limitación en vez de reinterpretar el baseline.

| Patrón, 50.000 | Baseline p50 | Baseline p95/p99 | Final p50 | Final p95 | Reducción p95 |
| -------------- | -----------: | ---------------: | --------: | --------: | ------------: |
| LINE           |      371,958 |          429,800 |    96,594 |   112,755 |         73,8% |
| TWO_LINES      |      456,005 |          477,872 |   151,707 |   178,693 |         62,6% |
| FOUR_CORNERS   |      308,732 |          315,162 |    52,333 |    61,902 |         80,4% |
| FULL_CARD      |      398,600 |          445,191 |   145,854 |   173,814 |         61,0% |
| CUSTOM         |      330,544 |          387,704 |    58,375 |    72,404 |         81,3% |

La mejora proviene de preparar evidencia y máscaras una vez por patrón/batch y reducir trabajo repetido, sin cambiar la semántica observable ni omitir candidatos simultáneos.

## 8. Alcance y siguientes verificaciones

Este resultado demuestra el gate del núcleo puro en un proceso Node.js y hardware concreto. No demuestra todavía:

- capacidad de la VPS productiva;
- contención PostgreSQL del motor transaccional;
- coste de auditoría/outbox;
- fan-out Redis/SSE;
- 10.000 espectadores;
- comportamiento con múltiples procesos o presión concurrente de otros módulos ASODEF.

Esas mediciones pertenecen a etapas posteriores. El script y el reporte deben conservarse para rebenchmark después de cambios al evaluador, versión de Node o hardware objetivo.
