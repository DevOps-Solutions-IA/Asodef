import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// vitest.config.ts uses globals: false, so Testing Library's automatic
// afterEach-cleanup detection never engages - wire it up explicitly,
// otherwise each test's rendered DOM accumulates across every other test
// in the same file (causing duplicate-element query failures).
afterEach(() => {
  cleanup();
});

/**
 * jsdom does not implement HTMLDialogElement.showModal()/close() (a
 * long-standing, documented gap - https://github.com/jsdom/jsdom/issues/3294).
 * Dialog.tsx and Drawer.tsx are built on the real native <dialog> element
 * specifically for its built-in focus trap/Escape/top-layer/focus-restore
 * behavior, so this polyfill reproduces just enough of that for jsdom
 * tests to meaningfully exercise it:
 *  - showModal() toggles `open`, remembers the previously-focused element,
 *    and moves focus to the first focusable descendant (or the dialog
 *    itself) - mirroring the browser's automatic focus-entry.
 *  - close() fires a real `close` event (all our components listen for
 *    this) and restores focus to whatever was focused before showModal().
 *  - a capturing Escape listener closes whichever dialog is "modal",
 *    mirroring native Escape-to-close.
 * This does not enforce an actual Tab-focus trap (that's the browser's
 * job, not reproducible without a heavier polyfill) - only entry/restore.
 */
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
