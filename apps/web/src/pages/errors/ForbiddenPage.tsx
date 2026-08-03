import { Link } from "react-router-dom";
import { EmptyState } from "@asodef/ui";
import { ShieldAlert } from "lucide-react";

export function ForbiddenPage() {
  return (
    <EmptyState
      icon={<ShieldAlert className="h-10 w-10" />}
      title="No tienes permisos para ver esta página"
      description="Si crees que esto es un error, contacta a un administrador."
      action={
        <Link
          to="/"
          className="inline-flex h-11 items-center justify-center rounded-full bg-brand-dark px-5 text-sm font-medium text-white transition-colors hover:bg-brand-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-dark focus-visible:ring-offset-2"
        >
          Volver al inicio
        </Link>
      }
    />
  );
}
