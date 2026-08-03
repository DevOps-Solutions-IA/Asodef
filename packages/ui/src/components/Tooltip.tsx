import { Children, cloneElement, isValidElement, useId, useState } from "react";
import type { ReactElement, KeyboardEvent } from "react";
import { cn } from "../cn";

export type TooltipSide = "top" | "bottom";
export type TooltipAlign = "center" | "end";

export interface TooltipProps {
  content: string;
  side?: TooltipSide;
  /** "center" (default) centers the tooltip on the trigger - fine for
   * triggers with room on both sides. "end" right-aligns it to the
   * trigger's own right edge instead, for triggers that sit flush
   * against a viewport edge (e.g. a fixed bottom-right button), where
   * centering would push the tooltip off-screen. */
  align?: TooltipAlign;
  children: ReactElement;
}

const SIDE_ALIGN_STYLES: Record<TooltipSide, Record<TooltipAlign, string>> = {
  top: {
    center: "bottom-full left-1/2 mb-2 -translate-x-1/2",
    end: "bottom-full right-0 mb-2",
  },
  bottom: {
    center: "top-full left-1/2 mt-2 -translate-x-1/2",
    end: "top-full right-0 mt-2",
  },
};

/** Minimal, dependency-free tooltip: shows on hover or keyboard focus,
 * dismisses on mouse-leave, blur, or Escape. */
export function Tooltip({ content, side = "top", align = "center", children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  const child = Children.only(children);

  if (!isValidElement(child)) {
    return children;
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key === "Escape") {
      setVisible(false);
    }
  };

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
      onKeyDown={handleKeyDown}
    >
      {cloneElement(child as ReactElement<{ "aria-describedby"?: string }>, { "aria-describedby": id })}
      <span
        role="tooltip"
        id={id}
        className={cn(
          "pointer-events-none absolute z-50 whitespace-nowrap rounded-lg bg-brand-dark px-2.5 py-1.5 text-xs text-white",
          "transition-opacity motion-reduce:transition-none",
          visible ? "opacity-100" : "invisible opacity-0",
          SIDE_ALIGN_STYLES[side][align],
        )}
      >
        {content}
      </span>
    </span>
  );
}
