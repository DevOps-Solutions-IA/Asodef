import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PaymentLayout } from "./PaymentLayout";

describe("PaymentLayout", () => {
  it("uses the common public menu and keeps the Legal Center link", () => {
    render(
      <MemoryRouter initialEntries={["/pagos"]}>
        <Routes>
          <Route element={<PaymentLayout />}>
            <Route path="/pagos" element={<div>Centro de Pagos</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("navigation", { name: "Principal" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pagar" })).toHaveAttribute("href", "/pagos");
    expect(screen.getByRole("link", { name: "Centro legal" })).toHaveAttribute("href", "/legal");
  });
});
