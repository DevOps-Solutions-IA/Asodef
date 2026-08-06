import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AboutPage } from "./AboutPage";

describe("AboutPage", () => {
  it("presents verified corporate data and identifies current editorial formulations", () => {
    render(<MemoryRouter><AboutPage /></MemoryRouter>);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/organización con historia/i);
    expect(screen.getByText("900552882-2")).toBeInTheDocument();
    expect(screen.getByText(/formulaciones son el marco editorial institucional vigente/i)).toBeInTheDocument();
    expect(screen.queryByText(/líder|premio|testimonio/i)).not.toBeInTheDocument();
  });
});
