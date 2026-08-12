# Contrato administrativo y RBAC

| Capacidad                                                                    | Permiso            |
| ---------------------------------------------------------------------------- | ------------------ |
| Consultar eventos, configuración y operación                                 | `bingo.read`       |
| Crear evento                                                                 | `bingo.create`     |
| Configurar rondas, patrones, premios, participantes, cartones y asignaciones | `bingo.manage`     |
| Iniciar, pausar, reanudar, cancelar, completar y extraer                     | `bingo.operate`    |
| Validar/rechazar candidato y confirmar ganador                               | `bingo.validate`   |
| Importar                                                                     | `bingo.import`     |
| Exportar                                                                     | `bingo.export`     |
| Consultar auditoría                                                          | `bingo.audit.read` |

Los roles `BINGO_OPERATOR`, `BINGO_SUPERVISOR`, `ADMIN` y `SUPER_ADMIN`
agrupan permisos, pero ninguna ruta debe autorizarse únicamente por nombre de
rol. La diferencia operador/supervisor para doble control se valida además en
el caso de uso transaccional con actor real.

Toda mutación declarada por el catálogo de rutas requiere una clave de
idempotencia. El futuro controller obtiene `actorUserId`, permisos y sessionId
del contexto autenticado; estos valores no forman parte de los DTO.

## Paginación

Las listas utilizan `page` desde 1 y `pageSize` máximo 100. La respuesta es
`{ data, meta: { page, pageSize, total, totalPages } }`. Los filtros específicos
de cada recurso deberán añadirse como propiedades validadas, no como objetos de
consulta arbitrarios.

## Errores

El catálogo Bingo añade un `code` estable al envelope global ASODEF. El código
permite a frontend reaccionar sin depender de textos humanos. No se incluyen
stack traces, consultas SQL, nombres de constraints, payload original ni PII.
