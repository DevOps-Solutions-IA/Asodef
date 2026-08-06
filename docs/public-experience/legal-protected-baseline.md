# Línea base protegida del Centro Legal

Fecha: 2026-08-06 (America/Bogota)  
Commit: `5e364bea210cccd1cdc31a3eca6a45bd78a6da46`

Esta evidencia se capturó antes de US-126–US-137. Excluye deliberadamente las interfaces públicas autorizadas `/pqr` y `/solicitudes-de-datos`, aunque sus componentes residan bajo `pages/legal`. La protección aplica a `/legal`, `/legal/*`, contenido, metadata, layouts, catálogo, publicación y versiones.

## Estado determinístico

- Documentos institucionales vigentes: `21`.
- Digest ordenado de slugs: `8b0c9e087020ded401a53cb1f826acda`.
- Digest ordenado de slug, versión, estado, currentVersionId, versionId y cuerpo aprobado: `81ace6d758bfa83c82dfd3e4382940c1`.
- Firma del bloque de rutas `/legal`: `5379073ca17db829ad7b412737cd3e630db89fb6a39bc353d69e4712fee31503`.

## Hashes de archivos protegidos

| Archivo | SHA-256 |
|---|---|
| `apps/api/src/database/legal-document-catalog.ts` | `7a9b6c38b86bd38a368d27ec1d289f15625bb5a599325f33b5795b05216b54f4` |
| `apps/api/src/database/seed-legal-documents.ts` | `a61fcbaf1fe88b49148ca0e4820c06d1f358566680cd560cb7c73b9a9933818f` |
| `apps/api/src/modules/legal-documents/legal-content-validator.ts` | `b6e8e722fd2754a4306abe9070835664cee5cfff9710c3862a2378d25b7fcf6c` |
| `apps/api/src/modules/legal-documents/legal-document.types.ts` | `b82b7a85026a73627e60a98b390d7bda0dbf989d72f737fde18df7344e682f88` |
| `apps/api/src/modules/legal-documents/legal-documents.controller.ts` | `07b7aeb36878a87a5e146e676cbc486b7ca214cad5a7f4f1d809a7c65113dd50` |
| `apps/api/src/modules/legal-documents/legal-documents.module.ts` | `3efe6cd6440dc4c5916f1889183fde08a39b90ab68c20db7e0d7f4dbb4518a68` |
| `apps/api/src/modules/legal-documents/legal-documents.service.ts` | `1c28ad5936a017e0ff25c4a889671598f2097400128dec54f7250fd3b9d45ec6` |
| `apps/web/src/layouts/LegalLayout.tsx` | `d597ea5cd80989bfe850f98db4508f07c018d9e139eac46744adfddd3719a458` |
| `apps/web/src/lib/legal/legal-api.ts` | `04e97080574b9342f02590e24795a577f48f1427ae631d1312cbbadb416eebac` |
| `apps/web/src/lib/legal/legal-catalog.ts` | `81fe81c556a995173190322ecd2aafb44b86ef5fc4229e3f5c4d07dc0298b60b` |
| `apps/web/src/lib/legal/legal-types.ts` | `ca6e4f0fb966718524c2ff65d1c1b09d93120e37e02c0048c57c123834d3c26f` |
| `apps/web/src/pages/legal/LegalCenterPage.tsx` | `91c535203b430d8e8b88db7b7c7d78c1c4fa8b697635dc3b57cd927ef275aa44` |
| `apps/web/src/pages/legal/LegalDocumentPage.tsx` | `d694dd82f79d81ea7e6095b1a30eb40e2fd479f9179276e81e331a607b572432` |

## Evidencia renderizada ignorada

Directorio: `test-results/legal-protected-baseline/`.

| Captura | SHA-256 |
|---|---|
| `legal-wide.png` | `53c0e25a0fcf64a301a1d4f4d897f7e34e05850d7e65e72c3a8daaaa23ebdf24` |
| `legal-mobile.png` | `47d03b78c5dbdc91b19662795c8ed3106cf16628c96f1eafb011dd430201b0f0` |
| `privacy-wide.png` | `053f0bbb45c535272532752f7916acb91051859161645a8d89598e942629e821` |

## Mapa de propiedad

| Rol | Archivos exclusivos |
|---|---|
| Lead architect | PRD, `router.tsx`, documentación, integración, Git y cierre |
| Content and information architect | registries públicos, Home, About y componentes editoriales no legales |
| Mobile/motion/frontend specialist | componentes mobile, primitivas motion, métricas y `PublicLayout` |
| Transactional UX specialist | `PqrCasePage`, `DataSubjectRequestPage`, `ContactPage` y sus pruebas |
| Accessibility/quality/release reviews | revisiones secuenciales; correcciones vuelven al propietario o al lead |

Ningún especialista puede editar PRD, remotos, archivos protegidos o hacer push.
