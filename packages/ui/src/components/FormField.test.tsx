import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FormField } from "./FormField";
import { Input } from "./Input";

describe("FormField", () => {
  it("associates the label with the control via a matching id/htmlFor", () => {
    render(
      <FormField label="Correo electrónico">
        {(fieldProps) => <Input {...fieldProps} type="email" />}
      </FormField>,
    );

    const input = screen.getByLabelText("Correo electrónico");
    expect(input).toBeInTheDocument();
    expect(input.tagName).toBe("INPUT");
  });

  it("links the hint text via aria-describedby when there is no error", () => {
    render(
      <FormField label="Documento" hint="Sin puntos ni espacios">
        {(fieldProps) => <Input {...fieldProps} />}
      </FormField>,
    );

    const input = screen.getByLabelText("Documento");
    const describedBy = input.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(screen.getByText("Sin puntos ni espacios")).toHaveAttribute("id", describedBy);
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("marks the control aria-invalid and links the error message via aria-describedby", () => {
    render(
      <FormField label="Correo electrónico" error="Ingresa un correo válido">
        {(fieldProps) => <Input {...fieldProps} type="email" />}
      </FormField>,
    );

    const input = screen.getByLabelText("Correo electrónico");
    expect(input).toHaveAttribute("aria-invalid", "true");

    const describedBy = input.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();

    const errorMessage = screen.getByRole("alert");
    expect(errorMessage).toHaveTextContent("Ingresa un correo válido");
    expect(errorMessage).toHaveAttribute("id", describedBy);
  });

  it("hides the hint once an error is present, so screen readers hear the error, not both", () => {
    render(
      <FormField label="Documento" hint="Sin puntos ni espacios" error="Documento requerido">
        {(fieldProps) => <Input {...fieldProps} />}
      </FormField>,
    );

    expect(screen.queryByText("Sin puntos ni espacios")).not.toBeInTheDocument();
    expect(screen.getByText("Documento requerido")).toBeInTheDocument();
  });

  it("marks the underlying control as required and shows a visual required indicator", () => {
    render(
      <FormField label="Nombre completo" required>
        {(fieldProps) => <Input {...fieldProps} />}
      </FormField>,
    );

    expect(screen.getByLabelText(/Nombre completo/)).toBeRequired();
  });
});
