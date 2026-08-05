import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PaymentLayout } from "./PaymentLayout";

describe("PaymentLayout", () => {
  it("US-045 AC: links to the Legal Center before the payment flow", () => {
    render(
      <MemoryRouter initialEntries={["/pagos"]}>
        <Routes>
          <Route element={<PaymentLayout />}>
            <Route path="/pagos" element={<div>Centro de Pagos</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Centro legal" })).toHaveAttribute("href", "/legal");
  });
});
