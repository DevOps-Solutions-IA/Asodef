import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "./StatusBadge";
import { STATUS_TONE_CONFIG, type StatusTone } from "../status/status-tone";

describe("StatusBadge", () => {
  it.each(Object.keys(STATUS_TONE_CONFIG) as StatusTone[])(
    "renders the centrally-defined Spanish label for tone '%s'",
    (tone) => {
      render(<StatusBadge tone={tone} />);
      expect(screen.getByText(STATUS_TONE_CONFIG[tone].label)).toBeInTheDocument();
    },
  );

  it("allows a domain-specific label to override the default tone label without changing the tone's color treatment", () => {
    render(<StatusBadge tone="success" label="Pago aprobado" />);

    expect(screen.getByText("Pago aprobado")).toBeInTheDocument();
    expect(screen.queryByText(STATUS_TONE_CONFIG.success.label)).not.toBeInTheDocument();
    expect(screen.getByText("Pago aprobado").closest("span")).toHaveClass(
      ...STATUS_TONE_CONFIG.success.className.split(" "),
    );
  });

  it("visually distinguishes danger-family tones (rejected/failed/cancelled) from success-family tones (success/active)", () => {
    render(
      <>
        <StatusBadge tone="rejected" />
        <StatusBadge tone="success" />
      </>,
    );

    const rejected = screen.getByText(STATUS_TONE_CONFIG.rejected.label);
    const success = screen.getByText(STATUS_TONE_CONFIG.success.label);
    expect(rejected.className).not.toBe(success.className);
  });
});
