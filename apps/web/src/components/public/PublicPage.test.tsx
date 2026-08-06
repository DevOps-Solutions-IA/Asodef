import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { PublicHero } from "./PublicPage";

describe("PublicHero", () => {
  it("does not inject a generic trust panel when no route-specific aside exists", () => {
    render(<MemoryRouter><PublicHero eyebrow="Servicio" title="Gestiona un pago" description="Consulta una obligación y continúa con Bold." /></MemoryRouter>);
    expect(screen.getByRole("heading", { level: 1, name: "Gestiona un pago" })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/información para decidir con claridad|contenido verificable/i);
  });
});
