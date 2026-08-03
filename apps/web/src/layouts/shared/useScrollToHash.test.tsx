import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useScrollToHash } from "./useScrollToHash";

function Target() {
  useScrollToHash();
  return <div id="quienes-somos">Sección objetivo</div>;
}

describe("useScrollToHash", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("scrolls the matching element into view when the URL has a hash", () => {
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    render(
      <MemoryRouter initialEntries={["/#quienes-somos"]}>
        <Target />
      </MemoryRouter>,
    );

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
  });

  it("does nothing when the URL has no hash", () => {
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    render(
      <MemoryRouter initialEntries={["/"]}>
        <Target />
      </MemoryRouter>,
    );

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("does nothing when the hash has no matching element id", () => {
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    render(
      <MemoryRouter initialEntries={["/#no-existe"]}>
        <Target />
      </MemoryRouter>,
    );

    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
