# Restauración del baseline protegido del Centro Legal

## Alcance determinista

- HEAD auditado antes de cambios: `f3c854f7ef71664d7985846f326d63e367587354`.
- Baseline visual congelado: `f642d44`.
- Regresión encontrada: el commit `f3c854f` sustituyó únicamente la cabecera propia de `LegalLayout` por `PublicHeader`.
- Restauración aplicada: solo `apps/web/src/layouts/LegalLayout.tsx`; las mejoras legítimas de `PublicLayout`, `AuthLayout`, `PaymentLayout` y `PublicHeader` permanecen.

## Huellas protegidas

| Archivo | SHA-256 baseline `f642d44` |
|---|---|
| `apps/web/src/layouts/LegalLayout.tsx` | `d597ea5cd80989bfe850f98db4508f07c018d9e139eac46744adfddd3719a458` |
| `apps/web/src/pages/legal/LegalCenterPage.tsx` | `91c535203b430d8e8b88db7b7c7d78c1c4fa8b697635dc3b57cd927ef275aa44` |
| `apps/web/src/pages/legal/LegalDocumentPage.tsx` | `d694dd82f79d81ea7e6095b1a30eb40e2fd479f9179276e81e331a607b572432` |
| `apps/web/src/lib/legal/legal-api.ts` | `04e97080574b9342f02590e24795a577f48f1427ae631d1312cbbadb416eebac` |
| `apps/web/src/lib/legal/legal-catalog.ts` | `81fe81c556a995173190322ecd2aafb44b86ef5fc4229e3f5c4d07dc0298b60b` |
| `apps/web/src/lib/legal/legal-types.ts` | `ca6e4f0fb966718524c2ff65d1c1b09d93120e37e02c0048c57c123834d3c26f` |
| `apps/api/src/database/legal-document-catalog.ts` | `7a9b6c38b86bd38a368d27ec1d289f15625bb5a599325f33b5795b05216b54f4` |
| `apps/api/src/database/seed-legal-documents.ts` | `a61fcbaf1fe88b49148ca0e4820c06d1f358566680cd560cb7c73b9a9933818f` |

La huella concatenada de estos ocho archivos es
`ec8fd836cd092570cf2708afbab6d92f7298677f575f4b304fa6f5e9a7f5d547`
tanto en `f642d44` como después de la restauración. Antes de restaurar,
`LegalLayout.tsx` tenía la huella divergente
`eb31efd9b2f41cec2bf5bb457c9c1288c83ee593826b36670c5ad51af63e62c1`.

## Estado legal de base de datos

- Documentos institucionales: `21`.
- Documentos con `currentVersionId`: `21`.
- Versiones vigentes: `21/21`, todas versión `2`, estado `PUBLISHED`.
- Digest determinista inicial de slug, currentVersionId, versión, estado y cuerpo aprobado: `1655c18339f6e6a432b59ded4ad404a4` (MD5 usado solo como huella de regresión, no como control criptográfico).

## Rutas y renderizado

La definición protegida continúa montando `/legal`, las entradas del catálogo,
`LegacyDataSubjectRequestPage` y `LegacyPqrCasePage` bajo el mismo `LegalLayout`.
El cierre de US-157 debe repetir las ocho huellas, el digest de base de datos,
la disponibilidad HTTP de las 21 rutas y una comparación Chromium representativa.
Los artefactos desechables se almacenan únicamente en `test-results/`, que está
ignorado por Git.
