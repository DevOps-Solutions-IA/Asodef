import { Link } from "react-router-dom";
import { EmptyState } from "@asodef/ui";
import { Compass } from "lucide-react";

export function NotFoundPage() {
  return (
    <EmptyState
      icon={<Compass className="h-10 w-10" />}
      title="Página no encontrada"
      titleAs="h1"
      description="La dirección a la que intentaste acceder no existe o fue movida."
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
