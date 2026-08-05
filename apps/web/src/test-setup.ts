import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// See packages/ui/src/test-setup.ts for the full rationale - same fix
// needed here since vitest.config's `test.globals` is false.
afterEach(() => {
  cleanup();
});

// Same jsdom HTMLDialogElement.showModal()/close() gap as packages/ui -
// layouts/pages here can render Dialog/Drawer from @asodef/ui.
if (typeof HTMLDialogElement !== "undefined" && typeof HTMLDialogElement.prototype.showModal !== "function") {
  const previouslyFocused = new WeakMap<HTMLDialogElement, HTMLElement>();
  const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    if (document.activeElement instanceof HTMLElement) {
      previouslyFocused.set(this, document.activeElement);
    }
    this.setAttribute("open", "");
    this.setAttribute("data-jsdom-modal", "true");
    const focusable = this.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (focusable ?? this).focus();
  };

  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    this.removeAttribute("data-jsdom-modal");
    this.dispatchEvent(new Event("close"));
    const restoreTarget = previouslyFocused.get(this);
    previouslyFocused.delete(this);
    restoreTarget?.focus();
  };

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    document.querySelectorAll<HTMLDialogElement>("dialog[open][data-jsdom-modal]").forEach((dialog) => {
      dialog.close();
    });
  });
}

// jsdom has no IntersectionObserver - needed for motion/react's
// `whileInView` (used by TrustBar/AboutSection, US-013). A minimal stub
// is enough: components only need the constructor to exist and not
// throw; tests assert on final rendered content, not on the actual
// scroll-triggered observation callback.
if (typeof globalThis.IntersectionObserver === "undefined") {
  class IntersectionObserverStub implements IntersectionObserver {
    readonly root: Element | Document | null = null;
    readonly rootMargin: string = "";
    readonly thresholds: ReadonlyArray<number> = [];
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }

  globalThis.IntersectionObserver = IntersectionObserverStub as unknown as typeof IntersectionObserver;
}

// jsdom has no scrollIntoView - needed by useScrollToHash, which runs for
// real on any route render that lands on a hash matching an on-page
// section id (e.g. the public marketing routes redirecting to /#anchor).
// A no-op stub is enough: tests assert on rendered content, not on actual
// scroll position.
if (typeof Element !== "undefined" && typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = () => {};
}
