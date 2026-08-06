import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { BenefitDetailPage } from "./BenefitDetailPage";

describe("BenefitDetailPage", () => {
  it("renders decision-making detail and visible FAQ for a verified benefit", () => {
    render(<MemoryRouter initialEntries={["/beneficios/movilidad"]}><Routes><Route path="/beneficios/:slug" element={<BenefitDetailPage/>}/></Routes></MemoryRouter>);
    expect(screen.getByRole("heading", { level: 1, name: "Movilidad" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cómo avanzar" })).toBeInTheDocument();
    expect(screen.getByText(/cada alternativa puede tener condiciones propias/i)).toBeInTheDocument();
  });
});
