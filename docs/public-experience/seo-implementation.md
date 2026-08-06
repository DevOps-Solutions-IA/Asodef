# Implementación SEO de la experiencia pública

## Alcance implementado

El registro tipado de rutas define título y descripción únicos. El componente `Seo` actualiza título, descripción, URL canónica, Open Graph y Twitter al cambiar de ruta. Las páginas editoriales aportan breadcrumbs; las páginas con preguntas visibles aportan `FAQPage`; las categorías de beneficio aportan `Service` con ASODEF como organización proveedora de la orientación descrita. No se publican precios, reseñas, calificaciones ni disponibilidad inventada.

El `index.html` contiene el fallback de Inicio, el activo oficial para social sharing y datos `Organization` y `WebSite`. El sitemap se genera durante el build desde los registros de rutas, beneficios, audiencias y documentos legales; no duplica una lista manual. `robots.txt` excluye portales autenticados y pasos transaccionales con referencias.

## Limitación de la SPA

La aplicación actual es una SPA de Vite sin renderizado en servidor. Los metadatos de ruta son correctos para navegador, lectores que ejecutan JavaScript y navegación del producto, pero algunos rastreadores que no ejecutan JavaScript solo reciben el fallback de Inicio. No se presenta esta solución como SSR. Una evolución futura puede añadir prerender o SSR sin cambiar el registro editorial ni las definiciones SEO creadas aquí.

## Validación

Las pruebas verifican unicidad del registro, URLs absolutas del sitemap, exclusión de rutas privadas/transaccionales, canonical, metadatos sociales y ausencia de calificaciones fabricadas en datos estructurados.
