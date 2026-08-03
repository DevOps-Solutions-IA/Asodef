import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pagination } from "./Pagination";

describe("Pagination", () => {
  it("shows the current range and total", () => {
    render(<Pagination page={2} pageSize={20} total={45} onPageChange={vi.fn()} />);
    expect(screen.getByText("21–40 de 45")).toBeInTheDocument();
    expect(screen.getByText("Página 2 de 3")).toBeInTheDocument();
  });

  it("shows a safe empty-result message with zero total", () => {
    render(<Pagination page={1} pageSize={20} total={0} onPageChange={vi.fn()} />);
    expect(screen.getByText("Sin resultados")).toBeInTheDocument();
  });

  it("disables 'Anterior' on the first page and 'Siguiente' on the last page", () => {
    render(<Pagination page={1} pageSize={20} total={20} onPageChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled();
  });

  it("calls onPageChange with the next/previous page number", async () => {
    const onPageChange = vi.fn();
    const user = userEvent.setup();
    render(<Pagination page={2} pageSize={10} total={50} onPageChange={onPageChange} />);

    await user.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(onPageChange).toHaveBeenCalledWith(3);

    await user.click(screen.getByRole("button", { name: "Anterior" }));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });
});
