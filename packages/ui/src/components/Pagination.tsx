import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../cn";
import { Button } from "./Button";

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  className?: string;
}

/**
 * Minimal, accessible previous/next pager - deliberately not a full
 * numbered-page-list widget: every admin list in this story is expected
 * to have a bounded, moderate page count, and "previous/next + a plain-
 * language summary" is easier to use correctly with a keyboard/screen
 * reader than a row of numbered buttons.
 */
export function Pagination({ page, pageSize, total, onPageChange, className }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const canGoPrevious = page > 1;
  const canGoNext = page < totalPages;

  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <nav aria-label="Paginación" className={cn("flex items-center justify-between gap-4", className)}>
      <p className="text-sm text-text-muted" aria-live="polite">
        {total === 0 ? "Sin resultados" : `${rangeStart}–${rangeEnd} de ${total}`}
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          iconLeft={<ChevronLeft className="h-4 w-4" aria-hidden="true" />}
          disabled={!canGoPrevious}
          onClick={() => onPageChange(page - 1)}
        >
          Anterior
        </Button>
        <span className="text-sm text-text-muted">
          Página {page} de {totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          iconRight={<ChevronRight className="h-4 w-4" aria-hidden="true" />}
          disabled={!canGoNext}
          onClick={() => onPageChange(page + 1)}
        >
          Siguiente
        </Button>
      </div>
    </nav>
  );
}
