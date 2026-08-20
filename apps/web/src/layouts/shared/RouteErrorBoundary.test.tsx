import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import type { RouteObject } from "react-router-dom";
import { RouteErrorBoundary } from "./RouteErrorBoundary";

function ThrowingComponent(): never {
  throw new Error("boom - this internal detail must never reach the user");
}

function renderWithError(routes: RouteObject[], initialPath = "/") {
  const router = createMemoryRouter(routes, {
    initialEntries: [initialPath],
    future: { v7_relativeSplatPath: true },
  });
  return render(<RouterProvider router={router} />);
}

describe("RouteErrorBoundary", () => {
  it("renders the generic service-unavailable page for an unexpected render error, without leaking the error message", () => {
    renderWithError([{ path: "/", element: <ThrowingComponent />, errorElement: <RouteErrorBoundary /> }]);

    expect(screen.getByText("Servicio no disponible")).toBeInTheDocument();
    expect(screen.queryByText(/boom/)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/internal detail/);
  });

  it("renders NotFoundPage for a 404 route error response", () => {
    // A pathless root route always structurally matches (it contributes no
    // URL segment), so when its only child ("/known") doesn't match the
    // requested location, React Router surfaces a genuine 404
    // ErrorResponse at the root's errorElement - the standard way to test
    // this in isolation, without a real catch-all route absorbing it.
    renderWithError(
      [
        {
          element: <div />,
          errorElement: <RouteErrorBoundary />,
          children: [{ path: "/known", element: <div>known</div> }],
        },
      ],
      "/does-not-exist-anywhere",
    );

    expect(screen.getByText("Página no encontrada")).toBeInTheDocument();
  });

  it("does not render any stack trace text on the fallback page", () => {
    renderWithError([{ path: "/", element: <ThrowingComponent />, errorElement: <RouteErrorBoundary /> }]);

    expect(document.body.textContent).not.toMatch(/at ThrowingComponent/);
    expect(document.body.textContent).not.toMatch(/\.tsx:\d+/);
  });
});
