# Inventario factual de fuentes ASODEF

Fecha de auditoría: 2026-08-05 (America/Bogota). Alcance: todos los archivos físicamente presentes en `docs/source/asodef`. Los originales no fueron modificados.

## Fuentes documentales

| Fuente | Fecha del documento | Entidad emisora | Hechos corporativos e institucionales útiles | Contenido jurídicamente relevante | Información sensible | Conflictos o límites | Aptitud de uso público |
|---|---|---|---|---|---|---|---|
| `CW82608264BJBC420260805114141.pdf` | 2026-08-05 | Cámara de Comercio de Cali | ASODEF S.A.S.; NIT 900552882-2; matrícula 854303-16; domicilio Cali; dirección KR 40 # 5 A - 116; constitución 2012-09-10; renovación 2026; duración indefinida; CIIU 9603; microempresa; objeto de venta de planes de prevención exequial | Existencia y representación legal; facultades de representación; correo de notificación judicial; situación de control y grupo empresarial | Identificaciones de representantes, teléfonos, correos, capital, ingresos y datos de control societario | El certificado contiene más información que la necesaria para el Centro Legal; no se publican identificaciones completas, ingresos ni detalles de control salvo necesidad jurídica | Alta para identidad corporativa, domicilio, matrícula, objeto y canales; uso limitado para datos personales/financieros |
| `CamScanner 05-08-2026 11.50.pdf` | Solicitud 2026-08-05; formato contractual sin fecha visible de emisión | ASODEF S.A.S. / Capillas de La Fe | Formato real de afiliación, titular y grupo familiar; cuotas; novedades; canales de servicio; aceptación manuscrita | Evidencia de que se tratan datos de titulares, beneficiarios, parentesco, nacimiento, contacto y firma; condiciones particulares de un contrato físico | Contiene datos personales reales, firmas, documentos, teléfonos, direcciones, beneficiarios y valores | Es un contrato individual y no una plantilla pública autorizada; sus precios, coberturas, carencias y condiciones no se generalizan a la plataforma | Solo para identificar categorías de datos y el contexto funcional; no publicar ni reproducir datos o cláusulas particulares |
| `Dossier_ASODEF.pdf` | Metadatos de modificación 2026-08-06; contenido institucional vigente a la entrega | ASODEF S.A.S. | Más de 20 años de trayectoria declarada; misión, visión, historia, sede principal Cali, cobertura nacional declarada, 8.405 afiliados titulares, 54.692 beneficiarios, red de convenios; portafolio institucional; contacto comercial | Finalidad institucional y categorías generales de beneficios; relación con familias, afiliados y empresas | Nombre, cargo y WhatsApp del contacto comercial | Las cifras son declaraciones institucionales, no garantías contractuales; la página 5 está duplicada; beneficios y cobertura no sustituyen condiciones particulares | Alta para contenido institucional y descripciones, con redacción no contractual y sin promesas de cobertura |
| `Ppta cial ERP PISCO ERP  - Prevision y Afiliacion en Linea.pdf` | 2026-07-21 | PISCO COMPANY TICS S.A.S. | Propuesta de ERP de previsión, consulta web, afiliación, cartera, documentos, pagos, reportes, comunicaciones SMS/WhatsApp y facturación | Describe una solución ofertada por un tercero y prácticas posibles de operación | Datos de contacto, cuenta bancaria, precios, tarifas y condiciones comerciales del proveedor | No prueba contratación, implementación ni proveedor definitivo de ASODEF; está marcada como confidencial; sus precios, garantías, renovaciones, infraestructura y medios de pago no se atribuyen a ASODEF | Limitada: sirve como contexto no vinculante; no se usa para afirmar proveedores, precios, medios finales ni compromisos de ASODEF |
| `WhatsApp Image 2026-08-05 at 12.21.59 PM.jpeg` | 2026-08-05 (nombre del archivo) | Pieza institucional ASODEF / Capillas de La Fe | Identidad de marca y pieza de mejora de plan; canal de servicio #523; comunicación comercial por WhatsApp | Evidencia del uso de comunicaciones promocionales y de la necesidad de consentimiento/supresión | No contiene datos de titular; contiene claims y valores promocionales de una pieza puntual | No prueba vigencia general, cobertura contractual ni precio aplicable a otra transacción | Visual/institucional; no se trasladan valores o garantías a documentos legales generales |

## Activos de marca y metadatos

| Fuente | Fecha | Emisor | Contenido | Sensibilidad | Conflictos | Aptitud pública |
|---|---|---|---|---|---|---|
| `brand/ASODEF_logo_principal_web.webp` | No declarada | ASODEF S.A.S. | Logo principal oficial y lema | Ninguna apreciable | Ninguno | Alta; activo oficial para `BrandLogo` |
| `brand/ASODEF_isotipo_web.webp` | No declarada | ASODEF S.A.S. | Isotipo oficial | Ninguna apreciable | Ninguno | Alta |
| `brand/letras del logo.png` | No declarada | ASODEF S.A.S. | Variante tipográfica del nombre y lema | Ninguna apreciable | Calidad/fondo menos apropiados que el WebP principal | Uso interno de referencia; preferir componente/activo oficial vigente |
| Tres archivos `*:Zone.Identifier` | No declarada | Windows ZoneTransfer | Solo contienen `ZoneId=3` | Ninguna | No son contenido institucional | No publicar; metadatos técnicos |

## Fuentes internas verificadas

- `packages/config/src/company.ts`: datos corporativos tipados y procedencia por campo; se reconcilia la procedencia de la dirección con el certificado actual.
- `apps/api/prisma/schema.prisma` y 31 migraciones aplicadas: modelos reales de autenticación, sesiones, RBAC, pagos, recibos, reembolsos, conciliación, CRM, contratos, comunicaciones, PQR, solicitudes de titulares, consentimientos, auditoría y documentos legales.
- Código de `apps/api/src/modules` y `apps/web/src`: comportamiento efectivo de formularios, portales, controles de acceso, cookies, exportaciones, workflow y rutas.
- Estado local de PostgreSQL: 21 documentos institucionales y 2 fixtures sintéticos; 18 versiones DRAFT, 1 APPROVED y 4 PUBLISHED antes de la corrección.
- API local `GET /api/v1/health`: 200; documento público real en `GET /api/v1/legal-documents/:slug`; frontend servido en `http://localhost:8080`.

## Decisiones de uso

- No se usan la propuesta PISCO ni el contrato escaneado como prueba de proveedor, precio, plazo, cobertura, exclusión, garantía o medio de pago vigente.
- No se publican identificaciones completas, ingresos, capital ni estructura de control del certificado porque no son necesarios para informar la identidad empresarial del portal.
- Los periodos de conservación se expresan por criterios jurídicos, operativos y probatorios, sin inventar una cantidad de años.
- Los medios, precios, impuestos y condiciones particulares de una transacción son únicamente los mostrados y aceptados en su flujo específico.
- Los 21 documentos institucionales pueden completarse con redacción limitada donde corresponda; ninguno queda materialmente bloqueado.
