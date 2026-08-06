# Inventario de rutas y contenido público

| Ruta actual | Ruta objetivo | Audiencia | Necesidad | Objetivo de negocio | CTA principal | CTA secundario | Fuente | Integración | SEO | Estado baseline |
|---|---|---|---|---|---|---|---|---|---|---|
| `/` | `/` | Todas | Comprender ASODEF y elegir camino | Orientación y conversión calificada | Comenzar orientación | Explorar beneficios | Dossier, app real | Funnel y rutas reales | Marca/organización | Existe; narrativa repetitiva |
| `/quienes-somos` → `/#quienes-somos` | `/quienes-somos` | Todas | Verificar identidad y propósito | Confianza institucional | Conocer cómo funciona | Centro Legal | Dossier, certificado, config | Contacto/legal | Institucional | Falta página |
| `/beneficios` → `/#beneficios` | `/beneficios` | Personas, afiliados, empresas | Explorar valor disponible | Descubrimiento | Filtrar beneficios | Iniciar orientación | Dossier, catálogo | Funnel | Beneficios ASODEF | Falta hub |
| `/portafolio` → `/#portafolio` | `/beneficios` | Todas | Ver categorías | Consolidar taxonomía | Ver beneficios | Comenzar | Dossier | Redirect preservado | Consolidado | Duplicado conceptual |
| — | `/beneficios/:slug` | Según beneficio | Decidir con contexto | Conversión informada | Consultar orientación | Ver relacionados | Dossier, límites legales | Funnel/legal | Intención específica | No existe |
| — | `/soluciones` | Todas | Elegir por perfil | Segmentación | Elegir perfil | Ver beneficios | Comportamiento real | Portales/funnel | Soluciones por perfil | No existe |
| — | `/soluciones/personas` | Personas | Orientación, pago o solicitud | Lead o autoservicio | Comenzar | Pagos/recursos | App y documentos | Funnel/pagos/PQR/DSR | Personas | No existe |
| — | `/soluciones/afiliados` | Afiliados | Usar cuenta, pagos y beneficios | Adopción de portal | Ingresar | Explorar beneficios | Portal real | `/mi-cuenta`, pagos | Afiliados | No existe |
| — | `/soluciones/empresas` | Empresas | Relación empresarial | Lead empresarial | Evaluar necesidad | Ver empresas | CRM/portal empresa | Funnel/CRM | Empresas | No existe |
| — | `/soluciones/aliados` | Aliados potenciales | Proponer relación | Lead aliado | Presentar interés | Conocer proceso | CRM partners/dossier | Funnel/CRM | Aliados | No existe |
| `/empresas` scaffolding | `/empresas` | Empresas | Comprender relación empresarial | Conversión B2B | Comenzar evaluación | Solución empresas | CRM, dossier | Funnel/CRM | ASODEF empresas | Scaffolding |
| `/pagos` | `/pagos` | Pagadores | Consultar obligación o referencia | Autoservicio seguro | Consultar pago | Términos | Pagos/Bold real | Backend pagos/consentimiento | Transaccional no index prioritario | Funcional |
| — | `/recursos` | Todas | Encontrar ayuda | Reducir fricción | Elegir recurso | Comenzar | Flujos existentes | PQR/DSR/pagos/legal | Recursos | No existe |
| — | `/recursos/preguntas-frecuentes` | Todas | Resolver dudas verificables | Orientación | Comenzar | Contacto | App y políticas | Rutas reales | FAQ | No existe |
| `/contacto` → `/#contacto` | `/contacto` | Todas | Contactar por canal apropiado | Lead calificado | Comenzar orientación | Ver canales | Config/CRM | Leads/consentimiento | Contacto | Solo ancla/formulario rígido |
| — | `/comenzar` | Todas | Recibir ruta personalizada | Lead/derivación | Continuar flujo | Volver | App real | CRM, consentimientos, pagos/PQR/DSR | No index de datos personales | No existe |
| `/legal` | `/legal` | Todas | Consultar políticas vigentes | Transparencia | Ver documento | Ejercer derecho | 21 publicaciones | API legal | Legal | Funcional premium |
| `/legal/:slug` | `/legal/:slug` | Todas | Leer documento | Evidencia | Imprimir/relacionados | Centro Legal | Versiones publicadas | API legal | Legal específico | Funcional |
| `/pqr` → `/legal/pqr` | `/pqr` → `/legal/pqr` | Solicitantes | Radicar PQR | Atención trazable | Radicar | Política PQR | Flujo PQR | API PQR | Recurso | Funcional; preservar query |
| — | `/solicitudes-de-datos` → `/legal/solicitudes-de-datos` | Titulares | Ejercer derechos | Cumplimiento | Crear solicitud | Procedimiento | Flujo DSR | API DSR | Recurso legal | Falta alias superior |
| `/login` → `/iniciar-sesion` | `/login` → `/iniciar-sesion` | Usuarios | Autenticarse | Acceso a portal | Ingresar | Recuperar clave | Auth real | API auth | noindex | Funcional |

