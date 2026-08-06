import { useEffect, useMemo } from "react";
import { PUBLIC_ROUTES } from "../public-content/public-routes";

const BASE_URL = "https://asodef.com.co";

interface SeoDefinition { path: string; title: string; description: string }
interface Breadcrumb { name: string; path: string }

function setMeta(selector: string, attribute: "name" | "property", key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) { element = document.createElement("meta"); element.setAttribute(attribute, key); document.head.append(element); }
  element.content = content;
}

export function Seo({ routeKey, custom, breadcrumbs, faq, service }: { routeKey?: keyof typeof PUBLIC_ROUTES; custom?: SeoDefinition; breadcrumbs?: Breadcrumb[]; faq?: readonly { question: string; answer: string }[]; service?: { name: string; description: string } }) {
  const route = useMemo(() => custom ?? (routeKey ? { path: PUBLIC_ROUTES[routeKey].path, ...PUBLIC_ROUTES[routeKey].seo } : null), [custom, routeKey]);
  useEffect(() => {
    if (!route) return;
    const canonical = `${BASE_URL}${route.path === "/" ? "" : route.path}`;
    document.title = route.title;
    setMeta('meta[name="description"]', "name", "description", route.description);
    setMeta('meta[property="og:title"]', "property", "og:title", route.title);
    setMeta('meta[property="og:description"]', "property", "og:description", route.description);
    setMeta('meta[property="og:url"]', "property", "og:url", canonical);
    setMeta('meta[property="og:type"]', "property", "og:type", "website");
    setMeta('meta[name="twitter:card"]', "name", "twitter:card", "summary_large_image");
    setMeta('meta[name="twitter:title"]', "name", "twitter:title", route.title);
    setMeta('meta[name="twitter:description"]', "name", "twitter:description", route.description);
    let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) { link = document.createElement("link"); link.rel = "canonical"; document.head.append(link); }
    link.href = canonical;
    const graph: Record<string, unknown>[] = [];
    if (breadcrumbs?.length) graph.push({ "@type": "BreadcrumbList", itemListElement: breadcrumbs.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, item: `${BASE_URL}${item.path === "/" ? "" : item.path}` })) });
    if (faq?.length) graph.push({ "@type": "FAQPage", mainEntity: faq.map(item => ({ "@type": "Question", name: item.question, acceptedAnswer: { "@type": "Answer", text: item.answer } })) });
    if (service) graph.push({ "@type": "Service", name: service.name, description: service.description, provider: { "@type": "Organization", name: "ASODEF S.A.S." } });
    const id = "route-structured-data";
    document.getElementById(id)?.remove();
    if (graph.length) { const script = document.createElement("script"); script.id = id; script.type = "application/ld+json"; script.text = JSON.stringify({ "@context": "https://schema.org", "@graph": graph }); document.head.append(script); }
    return () => document.getElementById(id)?.remove();
  }, [route, breadcrumbs, faq, service]);
  return null;
}
