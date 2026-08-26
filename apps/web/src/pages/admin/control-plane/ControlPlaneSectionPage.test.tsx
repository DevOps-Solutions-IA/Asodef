import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ControlPlaneSectionPage } from "./ControlPlaneSectionPage";

function renderSection(path: string, area: "koral" | "comunicaciones") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/admin/:area/:sectionSlug"
          element={<ControlPlaneSectionPage area={area} />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ControlPlaneSectionPage", () => {
  it("does not render a cosmetic fallback for a Koral route", () => {
    renderSection("/admin/koral/inbox", "koral");
    expect(screen.getByText("Sección no disponible")).toBeInTheDocument();
    expect(screen.queryByText(/Runtime administrativo pendiente/)).not.toBeInTheDocument();
  });

  it("includes preview, diff and audit in editable communications", () => {
    renderSection("/admin/comunicaciones/plantillas", "comunicaciones");
    expect(screen.getByText("Vista previa")).toBeInTheDocument();
    expect(screen.getByText("Diferencias")).toBeInTheDocument();
    expect(screen.getByText("Auditoría")).toBeInTheDocument();
    expect(
      screen.getByText("Communications runtime NOT_CONFIGURED"),
    ).toBeInTheDocument();
  });

  it("does not render a cosmetic automation foundation", () => {
    renderSection("/admin/koral/automatizaciones", "koral");
    expect(screen.getByText("Sección no disponible")).toBeInTheDocument();
    expect(screen.queryByText("Trigger")).not.toBeInTheDocument();
  });

  it("keeps recommendations outside the generic Koral foundation", () => {
    renderSection("/admin/koral/recomendaciones", "koral");
    expect(screen.getByText("Sección no disponible")).toBeInTheDocument();
  });
});
