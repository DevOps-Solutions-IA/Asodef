export interface SkipToContentProps {
  targetId: string;
}

/**
 * Visually hidden until focused (standard sr-only + focus:not-sr-only
 * pattern), so keyboard users can jump past repeated navigation straight
 * to the main content landmark of whichever layout renders this.
 */
export function SkipToContent({ targetId }: SkipToContentProps) {
  return (
    <a
      href={`#${targetId}`}
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-brand-dark focus:px-5 focus:py-3 focus:text-sm focus:font-semibold focus:text-white focus:outline-none focus:ring-2 focus:ring-white"
    >
      Saltar al contenido principal
    </a>
  );
}
