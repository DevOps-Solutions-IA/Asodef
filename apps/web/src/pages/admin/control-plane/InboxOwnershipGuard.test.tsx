import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  InboxOwnershipGuard,
  type InboxOwnershipView,
} from "./InboxOwnershipGuard";

const OWNERSHIP: InboxOwnershipView = {
  activeAssigneeUserId: "advisor-2",
  activeAssigneeDisplayName: "Asesor asignado",
  conversationVersion: 4,
};

describe("InboxOwnershipGuard", () => {
  it("fails closed while ownership cannot be verified", () => {
    render(
      <InboxOwnershipGuard
        ownership={null}
        currentActorId="advisor-1"
        contractAvailable={false}
      />,
    );
    expect(screen.getByText("Asignación no verificable")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("visually blocks collision with another advisor", () => {
    render(
      <InboxOwnershipGuard
        ownership={OWNERSHIP}
        currentActorId="advisor-1"
        contractAvailable
      />,
    );
    expect(screen.getByText("Caso tomado por otro asesor")).toBeInTheDocument();
    expect(screen.getByText("Bloqueado por colisión")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("only offers returnToKoral to the current owner", () => {
    const onReturnToKoral = vi.fn();
    render(
      <InboxOwnershipGuard
        ownership={{ ...OWNERSHIP, activeAssigneeUserId: "advisor-1" }}
        currentActorId="advisor-1"
        contractAvailable
        onReturnToKoral={onReturnToKoral}
      />,
    );
    screen.getByRole("button", { name: "Devolver a Koral" }).click();
    expect(onReturnToKoral).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("button", { name: "Tomar caso" }),
    ).not.toBeInTheDocument();
  });
});
