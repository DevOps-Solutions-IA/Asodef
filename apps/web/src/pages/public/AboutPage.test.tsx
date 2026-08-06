import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AboutPage } from "./AboutPage";

describe("AboutPage", () => {
  it("presents a concise identity and verified corporate summary", () => {
    render(<MemoryRouter><AboutPage /></MemoryRouter>);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/conecta personas y organizaciones/i);
    expect(screen.getAllByText("900552882-2").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("854303").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/formulaciones institucionales vigentes para este sitio web/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /cuatro perfiles/i })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/información para decidir con claridad|contenido verificable|líder|premio|testimonio/i);
  });
});
