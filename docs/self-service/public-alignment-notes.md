# Alineación pública de autoservicio

Fecha de verificación local: 6 de agosto de 2026.

## Perfiles y accesos

| Perfil | Acción principal pública | Capacidad descrita | Límite explícito |
| --- | --- | --- | --- |
| Afiliados y titulares | `Consultar mi afiliación` → `/mi-cuenta/acceso` | Afiliación, beneficiarios, documentos, estado de cuenta, pagos y solicitudes después de verificar identidad | El identificador por sí solo no permite ver información sensible |
| Empresas | `Acceso de empresas` → `/empresa/acceso` | Relación organizacional, beneficios, contratos, pagos, documentos, solicitudes y reportes autorizados | El NIT inicia el proceso; la sesión requiere verificación por canal registrado |
| Equipo interno | `Acceso administrativo` → `/iniciar-sesion` | CRM, pagos, PQR, conciliación y back-office | Correo y contraseña no son el acceso de afiliados o empresas |

La página de contacto conserva exactamente ocho destinos de atención. `Acceso administrativo` se presenta por separado y dirige a `/iniciar-sesion`; no se confunde con Mi cuenta ni con el portal empresarial.

## Plan exequial familiar

Fuente: pieza institucional ASODEF “Ya tienes tu plan, ¡ahora mejóralo!”, archivo disponible del 5 de agosto de 2026 en `docs/source/asodef/` (archivo fuente ignorado y no modificado).

La página pública presenta el título “Plan preferencial para mayor acompañamiento familiar”, limita la disponibilidad a cada vinculación y reproduce únicamente los datos autorizados:

- mejora al Plan Preferencial;
- sala VIP;
- dos buses para acompañantes;
- corona especial de mayor categoría;
- atención integral y acompañamiento personalizado;
- seguro de vida para el titular hasta por $3.000.000 sin costo adicional, sujeto a las condiciones de la vinculación y la protección aplicable;
- canal gratuito desde celular `#523` (`tel:%23523`).

La interfaz no presume elegibilidad universal: ofrece `Consultar mi plan` en `/mi-cuenta/acceso`, orientación contextual y el bloque `ATENCIÓN RÁPIDA` con #523; no deduce cobertura, vigencia contractual o acceso automático.

## Componentes y navegación

- `PublicActionCard` unifica tarjetas públicas de contacto, beneficios y soluciones como un único enlace o botón nativo, con foco visible, objetivo táctil y altura uniforme.
- Las cargas directas, PUSH y REPLACE parten del inicio de la página; un hash válido tiene prioridad; POP recupera la posición registrada de la entrada.
- El foco del contenido público usa `preventScroll` para no anular la restauración. Los demás layouts mantienen el comportamiento anterior.

## Evidencia enfocada

- 34/34 pruebas de contenido, tarjetas, contacto, beneficios, soluciones, foco y restauración de scroll superadas.
- Chromium local revisado a 320, 390 y 1440 px en `/contacto`, `/soluciones/afiliados`, `/soluciones/empresas` y `/beneficios/plan-exequial-familiar`.
- Sin desbordamiento horizontal en las rutas y resoluciones revisadas.
- Confirmados: ocho destinos, foco al revelar “Otro asunto”, `/iniciar-sesion`, `/mi-cuenta/acceso`, `/empresa/acceso` y `tel:%23523`.
- El Centro Legal no fue modificado.
