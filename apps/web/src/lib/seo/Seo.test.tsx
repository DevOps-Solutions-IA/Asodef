import { render, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Seo } from "./Seo";

describe("route SEO", () => {
  it("sets unique canonical, social metadata and visible-content structured data", async () => {
    render(<Seo custom={{ path: "/prueba", title: "Ruta de prueba | ASODEF", description: "Descripción institucional suficientemente precisa para la ruta pública bajo prueba." }} breadcrumbs={[{name:"Inicio",path:"/"},{name:"Prueba",path:"/prueba"}]} faq={[{question:"¿Pregunta visible?",answer:"Respuesta visible en la página."}]}/>);
    await waitFor(()=>expect(document.title).toBe("Ruta de prueba | ASODEF"));
    expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute("href","https://asodef.com.co/prueba");
    expect(document.querySelector('meta[property="og:title"]')).toHaveAttribute("content","Ruta de prueba | ASODEF");
    expect(document.getElementById("route-structured-data")?.textContent).toContain("FAQPage");
    expect(document.getElementById("route-structured-data")?.textContent).not.toContain("aggregateRating");
  });
});
