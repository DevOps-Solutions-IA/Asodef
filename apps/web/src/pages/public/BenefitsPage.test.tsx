import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { BenefitsPage } from "./BenefitsPage";

describe("BenefitsPage", () => {
  it("filters the sourced registry by audience and need", () => {
    render(<MemoryRouter><BenefitsPage /></MemoryRouter>);
    expect(screen.getByText("8 categorías encontradas")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Necesidad"), { target: { value: "educacion" } });
    expect(screen.getByText("1 categoría encontrada")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Educación" })).toBeInTheDocument();
  });
});
