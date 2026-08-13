# Mapeo BDAdaSysSO a dominio ASODEF

Este documento registra únicamente relaciones y columnas confirmadas. Los campos o reglas no confirmados permanecen bloqueados; no se infieren desde nombres parecidos.

## Catálogo de operaciones

| Operación | Fuente | Estado Fase 1D | Evidencia / bloqueo |
| --- | --- | --- | --- |
| `findPersonByDocument` | `TBLPERSONA`, `TBLTIPOIDENTIFICACION` | Preparada | Metadata real confirma `TBLPERSONA.IDPERSONA` como PK `VARCHAR(20)`, el vínculo `IDTIPOIDENTIFICACION` y el catálogo de tipos. La búsqueda parametrizada intenta primero igualdad exacta y, solo sin resultado, compara `TRIM(IDPERSONA)`; conserva ceros, puntuación y espacios internos. |
| `findCompanyByNit` | `TBLEMPRESAS` | Estructural | Solo `NIT` está confirmado; nombre y estado permanecen `null`. |
| `getContract` | `TBLCONTRATO` | Preparada | Columnas contractuales suministradas y filtro `IDCONTRATO = ?`. |
| `getContractsByPerson` | `TBLCONTRATO` | Preparada | Relación `IDPERSONA = ?`. |
| `getCompanyContracts` | `TBLCONTRATOSEMPRESA`, `TBLCONTRATO` | Preparada | Join por `IDCONTRATO`, filtro `NIT = ?`. |
| `getPlan` | `TBLPLANES` | Estructural | Solo `IDPLAN` está confirmado; datos descriptivos permanecen `null`. |
| `getContractInstallments` | `TBLCUOTASCONTRATO` | Preparada | Devuelve estado, saldo y acuerdo legacy sin reinterpretarlos. |
| `getOutstandingInstallments` | `TBLCUOTASCONTRATO` | `BLOCKED_WITH_EVIDENCE` | Existen `SALDO`, `ESTADO`, `ACUERDO` y `FECHAVENCE`; falta la regla oficial que decide cuáles combinaciones están pendientes. No se calcula deuda. |
| `getPaymentHistory` | `TBLPAGOS` | Preparada | Conserva `ANULADO`; no elimina ni reclasifica registros. |
| `getPaymentReceipt` | `TBLPAGOS`, `TBLPAGOSDETALLE` | `BLOCKED_WITH_EVIDENCE` | Solo está confirmada la relación por `NORECIBO`; faltan columnas aprobadas para construir líneas de recibo. No se ejecuta el procedimiento histórico. |
| `getContractBeneficiaries` | `TBLPERSONA`, `TBLCONTRATO` | `BLOCKED_WITH_EVIDENCE` | `IDASOCIADO` y `NROCONTRATO` están confirmados; falta aprobar cómo `RETIRADO`, `FECHARETIRO`, `TIPO` y `PARENTESCO` determinan pertenencia y vigencia. `TBLSEGUROBENEFICIARIOS` permanece excluida. |
| `getContractStatus` | `TBLCONTRATO` | Base preparada | Expone estado legacy; `derivedStatus` permanece `null`. |

## Contrato

| Firebird | ASODEF |
| --- | --- |
| `IDCONTRATO` | `contractId` |
| `IDPERSONA` | `personId` |
| `FECHA` | `createdAt` |
| `DESDE` | `validFrom` |
| `HASTA` | `validUntil` |
| `VALOR` | `value` |
| `VALORINICIAL` | `initialValue` |
| `NOCUOTAS` | `installmentCount` |
| `ESTADO` | `legacyStatus` |
| `IDPLAN` | `planId` |
| `PAGOHASTA` | `paidThrough` |
| `SALDO` | `balance` |
| `CUOTAS` | `installments` |
| `VALORCUOTAFORMAPAGO` | `paymentFrequencyAmount` |
| `NIT` | `companyNit` |
| `MESESENCARTERA` | `monthsInArrears` |
| `DIASENCARTERA` | `daysInArrears` |
| `FECHAULTIMOPAGO` | `lastPaymentAt` |
| `VALORULTIMOPAGO` | `lastPaymentAmount` |
| `IDFORMAPAGO` | `paymentMethodId` |
| `IDMODALIDAD` | `paymentModalityId` |

## Persona e identidad de afiliado

La inspección de metadata de solo lectura confirmó que `TBLPERSONA.IDPERSONA`
es la clave primaria física y el identificador usado por
`TBLCONTRATO.IDPERSONA`. `TBLPERSONA.IDTIPOIDENTIFICACION` es obligatorio y
referencia `TBLTIPOIDENTIFICACION.IDTIPOIDENTIFICACION`; el código público de
tipo se toma de `TBLTIPOIDENTIFICACION.IDENTIFICACION`.

Los identificadores se manejan siempre como `string`. El repositorio elimina
espacios externos del input, intenta primero igualdad exacta con un placeholder
y usa una segunda consulta estática con `TRIM(IDPERSONA) = ?` únicamente si no
hay coincidencia. No elimina ceros iniciales, puntos, guiones ni espacios
internos, porque la evidencia agregada confirma que esos formatos existen en
el origen. Ambas consultas usan `FIRST 2` para fallar cerrado si la unicidad
física o normalizada observada dejara de cumplirse.

La prueba real agregada y sin PII encontró 13 identificadores con espacios
externos: 7 iniciales, 5 finales y 1 en ambos extremos. El parámetro recortado
solo encontró 5 con igualdad directa; el fallback sobre `TRIM(IDPERSONA)`
encontró exactamente una fila para los 13 y no se detectaron grupos duplicados
tras normalizar. Ninguno de esos 13 registros tenía relación en
`TBLCONTRATO` al momento de la prueba; esto es evidencia operacional, no una
regla de negocio permanente.

Esta operación pertenece exclusivamente al flujo de afiliados/autoservicio.
La autenticación administrativa continúa en ASODEF mediante usuarios,
credenciales, sesiones, RBAC y permisos propios. Firebird no autentica
administradores, no define sus roles y no participa en ownership
administrativo.

La habilitación del lookup no autoriza todavía el inicio de sesión de
autoservicio: falta evidencia de negocio que determine cuáles contactos de
`TBLPERSONA` están autorizados y verificados para OTP. Por ello no se conecta
todavía `MasterQueryService` con `ExternalCoreProvider`.

## Cuotas

Las columnas confirmadas se traducen a `Installment`. `ESTADO` se conserva como `legacyStatus`, `ACUERDO` como valor legacy y `SALDO` como decimal exacto. Ninguna combinación se considera automáticamente pendiente.

## Pagos

`TBLPAGOS` se traduce a `Payment`. El indicador `ANULADO` se conserva y no se filtra. `TBLPAGOSDETALLE` permanece sin consulta hasta disponer del catálogo de columnas aprobado.

## Tipos

- Identificadores: `string`, para no perder ceros ni exceder enteros seguros.
- Moneda: string decimal exacto; no se usa aritmética binaria de JavaScript.
- Fechas: valor ISO cuando el driver entrega `Date`; cadenas legacy se conservan normalizadas hasta confirmar timezone y charset.
- Estados: valor legacy explícito; no se deriva un estado de negocio sin regla aprobada.

## Tablas excluidas

`TBLSEGUROBENEFICIARIOS`, `TBLPAYCONFIGURACION` y cualquier tabla no incluida en la allowlist no forman parte del catálogo. `P_PAGOSPISCOPAY` no se invoca ni referencia desde consultas funcionales.

## Criterio para desbloquear operaciones

Una operación bloqueada solo puede pasar al catálogo ejecutable cuando existe
evidencia del esquema físico y una regla de negocio aprobada que permita
formular una consulta parametrizada sin reinterpretar estados legacy. El
cambio debe incluir mapper, pruebas de catálogo, repositorio y evidencia de
mapeo. Una observación aislada de datos reales no reemplaza la aprobación de
la semántica.
