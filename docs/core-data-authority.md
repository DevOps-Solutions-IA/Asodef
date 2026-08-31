# Autoridad de datos del core híbrido ASODEF

Estado: contrato de Fase 1. PostgreSQL continúa siendo el sistema de registro
de los dominios digitales del producto. Firebird Master aporta únicamente
hechos institucionales legacy confirmados a través del módulo `master` y de
su catálogo estático de consultas de solo lectura.

## Regla de composición

`EXTERNAL_CORE_PROVIDER=hybrid` instala un adaptador interno. El adaptador no
contiene SQL Firebird: toda lectura Master sigue la cadena
`MasterQueryService -> MasterReadRepository -> FirebirdReadExecutor ->
NodeFirebirdReadClient` y una transacción read-only que siempre termina en
rollback.

Una entidad PostgreSQL y una entidad Master nunca se consideran iguales por
su nombre. El único crosswalk admitido en esta fase se acuña server-side
durante un lookup y exige coincidencia exacta de identificador canónico:

- afiliado: tipo y número de documento Master coinciden exactamente con
  `Customer(documentType, documentNumber)` y existe un único `Affiliate`
  relacionado;
- empresa: `TBLEMPRESAS.NIT` coincide exactamente con `Company.nit`.

El crosswalk forma parte de un `subjectRef` interno, se valida de nuevo antes
de cada lectura PostgreSQL y se almacena cifrado por el flujo de autoservicio.
No se entrega al navegador. Ausencia, ambigüedad o divergencia falla cerrada;
no se normalizan identificadores más allá de la normalización ya aprobada en
el repositorio Master.

## Matriz de autoridad

| Dominio / hecho                                                | Clasificación               | Fuente autoritativa y límite                                                                                                 |
| -------------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Identidad administrativa, auth, usuarios, RBAC, MFA y sesiones | `POSTGRESQL_OWNED`          | Modelos y servicios de autenticación ASODEF. Firebird no autentica ni autoriza.                                              |
| Identidad legacy de afiliado                                   | `MASTER_FIREBIRD_OWNED`     | `findPersonByDocument`, incluida su búsqueda normalizada aprobada. No habilita por sí sola OTP.                              |
| Identidad legacy de empresa                                    | `MASTER_FIREBIRD_OWNED`     | `findCompanyByNit`; solo NIT está confirmado en la consulta actual.                                                          |
| Estado digital de Affiliate/Customer                           | `POSTGRESQL_OWNED`          | Solo después de crosswalk exacto y revalidado.                                                                               |
| Estado digital de Company/CRM                                  | `POSTGRESQL_OWNED`          | CRM, contactos, oportunidades, acuerdos y empresa digital permanecen en Prisma.                                              |
| Contratos legacy y estado contractual legacy                   | `MASTER_FIREBIRD_OWNED`     | `getContract`, `getContractsByPerson`, `getCompanyContracts` y `getContractStatus`; el estado se conserva sin reinterpretar. |
| Contratos/documentos/versiones digitales                       | `POSTGRESQL_OWNED`          | `Contract`, `ContractVersion`, aceptación y tokens de descarga. No se confunden con contratos Master.                        |
| Vista de contratos de empresa                                  | `HYBRID`                    | Une registros legacy y digitales, con referencias de fuente diferenciadas, solo tras crosswalk exacto.                       |
| Cuotas legacy                                                  | `MASTER_FIREBIRD_OWNED`     | `getContractInstallments` expone datos raw confirmados; no determina si están pendientes.                                    |
| Obligaciones digitales                                         | `POSTGRESQL_OWNED`          | `Obligation`; `PENDING` y `OVERDUE` son los estados pendientes canónicos compartidos con Payment Orders.                     |
| Obligaciones pendientes legacy                                 | `BLOCKED_PENDING_SEMANTICS` | `getOutstandingInstallments` permanece bloqueada; no se interpreta `SALDO/ESTADO/ACUERDO`.                                   |
| Historial de pagos legacy                                      | `MASTER_FIREBIRD_OWNED`     | `getPaymentHistory`; conserva incluso el indicador `ANULADO`.                                                                |
| Orquestación de pagos digitales y eventos Bold                 | `POSTGRESQL_OWNED`          | Payment orders, attempts, transactions, events/webhooks e idempotencia. Firebird no participa.                               |
| Vista de pagos de afiliado                                     | `HYBRID`                    | Historial Master confirmado más órdenes digitales finalizadas del Customer con crosswalk.                                    |
| Recibos digitales                                              | `POSTGRESQL_OWNED`          | `PaymentReceipt` y su relación con Payment Order.                                                                            |
| Recibo legacy                                                  | `BLOCKED_PENDING_SEMANTICS` | `getPaymentReceipt` continúa bloqueada; no se invoca procedimiento ni se inventan líneas.                                    |
| Refunds y reconciliation                                       | `POSTGRESQL_OWNED`          | Flujos, aprobación y auditoría del backend ASODEF.                                                                           |
| PQR                                                            | `POSTGRESQL_OWNED`          | `PqrCase`; solo se proyecta al titular mediante un crosswalk de Customer válido.                                             |
| Consentimientos                                                | `POSTGRESQL_OWNED`          | Propósitos, versiones y evidencia de consentimiento del producto digital.                                                    |
| Communications y automation                                    | `POSTGRESQL_OWNED`          | Plantillas, logs, definiciones, ejecuciones y eventos del backend.                                                           |
| Knowledge                                                      | `POSTGRESQL_OWNED`          | Lifecycle, fuentes, chunks, snapshots, retrieval y auditoría actuales.                                                       |
| Estado/audit/idempotencia de autoservicio                      | `POSTGRESQL_OWNED`          | Lookup hash, referencias cifradas, OTP, browser binding, sesiones, CSRF y auditoría.                                         |
| Canales verificados y permiso operativo para OTP               | `BLOCKED_PENDING_SEMANTICS` | Teléfono/WhatsApp/email presentes no prueban verificación ni permiso.                                                        |
| Beneficiarios legacy                                           | `BLOCKED_PENDING_SEMANTICS` | `getContractBeneficiaries` permanece bloqueada por vigencia/pertenencia no aprobadas.                                        |
| Reglas de beneficiarios aplicables                             | `BLOCKED_PENDING_SEMANTICS` | No existe crosswalk aprobado Plan Master -> PlanVersion PostgreSQL.                                                          |
| Cambios de beneficiarios/contacto en Master                    | `BLOCKED_PENDING_SEMANTICS` | No hay write path Master; el proveedor nunca escribe Firebird.                                                               |
| Estado de cuenta agregado                                      | `BLOCKED_PENDING_SEMANTICS` | No se define un agregado mezclando saldos legacy y obligaciones digitales.                                                   |

## Operaciones de autoservicio habilitadas y bloqueadas

Las lecturas `VERIFIED` se limitan a datos cuya autoridad y proyección son
inequívocas: lookup documental/NIT, resúmenes de identidad, obligaciones
digitales, historial de pagos confirmado, recibos digitales,
contratos/documentos digitales, PQR del Customer y contratos/pagos legacy de
empresa. Los IDs de fuente se mantienen diferenciados (`master:` y
`postgres:`) en vistas compuestas.

Permanecen fail-closed: número de titular, descubrimiento de canales OTP,
beneficiarios, estado de cuenta agregado, outstanding installments Master,
recibos legacy, reglas de beneficiarios sin crosswalk de plan, cambios de
contacto/beneficiario, beneficios de empresa sin entitlement probado,
reportes de empresa y mutaciones de pago del contrato genérico de
autoservicio.

## Invariantes de seguridad

- Identidad Firebird exclusiva: `ASODEF_READONLY`.
- `Firebird.ISOLATION_READ_COMMITTED_READ_ONLY`, catálogo estático,
  parametrización, `assertReadOnlyQuery()`, timeout, circuit breaker,
  comprobación de `CURRENT_USER` y rollback después de cada lectura.
- Cero SQL Firebird fuera de `firebird-query.catalog.ts`, cero procedimientos
  y cero rutas de escritura Master.
- PostgreSQL conserva la autoridad de todos sus dominios actuales; el modo
  híbrido no replica ni reemplaza sus servicios.
- `EXTERNAL_CORE_PROVIDER=not_configured` sigue siendo el default seguro. El
  modo `http` reservado continúa fallando al arrancar mientras no exista un
  adaptador real.
