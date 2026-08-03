import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "../cn";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  /** Renders a link for non-final items; defaults to a plain <a>. Pass
   * your router's Link component to get client-side navigation. */
  linkComponent?: (props: { href: string; children: ReactNode; className?: string }) => JSX.Element;
  className?: string;
}

export function Breadcrumb({ items, linkComponent, className }: BreadcrumbProps) {
  const LinkComponent =
    linkComponent ??
    (({ href, children, className: linkClassName }: { href: string; children: ReactNode; className?: string }) => (
      <a href={href} className={linkClassName}>
        {children}
      </a>
    ));

  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-text-muted">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
              {index > 0 && <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />}
              {isLast || !item.href ? (
                <span aria-current={isLast ? "page" : undefined} className={cn(isLast && "font-medium text-text-main")}>
                  {item.label}
                </span>
              ) : (
                <LinkComponent href={item.href} className="hover:text-brand-dark hover:underline">
                  {item.label}
                </LinkComponent>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
