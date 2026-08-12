# Benchmark de `DrawNextBall`

Fecha de ejecución: 2026-08-11  
HEAD de partida: `512236e4b68bff23f4b6d7b529c873aebf734948`  
Alcance: ETAPA 5; comando transaccional real contra PostgreSQL.

## Resultado

El comando completo cumple el gate `PERF-002` (`p95 <= 750 ms`, `p99 <=
1.500 ms`) con 50.000 cartones. El hot path incluye locks, idempotencia,
lectura del estado oficial, selección de balota, `BingoDraw`, evaluación,
auditoría, outbox y commit.

| Cartones | p50 ms | p95 ms | p99 ms | DB p50 ms | Cartones/s p50 |
| -------: | -----: | -----: | -----: | --------: | --------------: |
|    5.000 | 52,933 | 55,287 | 55,554 |        22 |          94.458 |
|   10.000 | 59,524 | 62,923 | 63,158 |        28 |         168.000 |
|   25.000 | 75,144 | 76,188 | 76,312 |        44 |         332.695 |
|   50.000 | 113,768 | 119,113 | 120,238 |       83 |         439.489 |

No hubo respuestas 5xx ni violaciones de secuencia, balota, idempotencia,
audit u outbox en las muestras registradas.

## Metodología

- PostgreSQL real con las 39 migraciones (la medición de tiempos se realizó
  antes de añadir el guard final, que solo ejecuta al iniciar una ejecución).
- Una base y un proceso Node limpios por tamaño para impedir contaminación de
  memoria, cache o autovacuum entre datasets.
- Un evento, una ronda, un patrón LINE, una máscara y un premio por dataset.
- Un participante aprobado, cartón, asignación activa y máscara precalculada
  por fila.
- Dos warmups y siete muestras registradas por dataset.
- `ANALYZE` después de la carga masiva y antes de iniciar la ejecución; su
  tiempo queda fuera del comando medido.
- Métricas de query obtenidas mediante eventos Prisma y tiempo total mediante
  `performance.now()`.
- Harness reproducible:
  `scripts/benchmarks/run-bingo-draw-command.ps1`.

Entorno: Windows 11 x64, Node 20.20.2, PostgreSQL 16 en Docker, Intel Core
i5-13420H, 24 GiB RAM host.

## Arquitectura medida

El primer prototipo que cargaba los 50.000 layouts mediante relaciones Prisma
falló ya a 5.000 filas por `max_stack_depth`. El resultado definitivo usa:

1. `smallint[25]` como layout canónico;
2. `bit(75)` precalculado por cartón/máscara;
3. prefiltro SQL que detecta únicamente cartones cuya condición cambia con la
   balota actual;
4. revalidación determinista con el motor puro de ETAPA 4;
5. respuesta SQL JSON allowlisted para evitar serializar modelos Prisma;
6. validación PostgreSQL al pasar una ejecución a `RUNNING`, que rechaza
   cartones elegibles sin todas sus máscaras.

Los UUID, máscaras y conteos embebidos en el SQL del hot path pasan por
validadores cerrados de formato antes de convertirse en literales del plan.
Nunca se interpola texto proporcionado por un cliente.

## Hallazgo operativo

Una carga masiva de 5.000 filas sin estadísticas produjo un plan de ~5,7 s;
el mismo dataset después de `ANALYZE` ejecutó el prefiltro en ~7 ms. Por ello,
la futura generación/importación debe tener un paso explícito de finalización:

`persistir -> derivar máscaras -> verificar cobertura -> ANALYZE -> permitir inicio`.

Esto no implica ejecutar `ANALYZE` por balota. Se hace una vez después de una
carga masiva y antes de publicar/iniciar el evento.
