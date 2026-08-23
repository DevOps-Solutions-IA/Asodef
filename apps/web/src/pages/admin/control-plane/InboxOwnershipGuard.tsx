import { Alert, Button, StatusBadge } from "@asodef/ui";

/** UI projection only. Koral Core owns the conversation and assignment contract. */
export interface InboxOwnershipView {
  activeAssigneeUserId: string | null;
  activeAssigneeDisplayName: string | null;
  conversationVersion: number;
}

export interface InboxOwnershipGuardProps {
  ownership: InboxOwnershipView | null;
  currentActorId: string;
  contractAvailable: boolean;
  onTakeover?: () => void;
  onReturnToKoral?: () => void;
}

/**
 * Visual concurrency boundary for the future inbox. The backend must still
 * enforce expectedVersion atomically; this component never treats a
 * disabled button as an authorization or locking mechanism.
 */
export function InboxOwnershipGuard({
  ownership,
  currentActorId,
  contractAvailable,
  onTakeover,
  onReturnToKoral,
}: InboxOwnershipGuardProps) {
  if (!contractAvailable || !ownership) {
    return (
      <Alert variant="warning" title="Asignación no verificable">
        No se habilitan takeover ni devolución mientras el contrato de propiedad
        del caso no esté disponible.
      </Alert>
    );
  }

  const ownedByCurrentActor = ownership.activeAssigneeUserId === currentActorId;
  const ownedByAnotherActor =
    Boolean(ownership.activeAssigneeUserId) && !ownedByCurrentActor;

  if (ownedByAnotherActor) {
    return (
      <Alert variant="danger" title="Caso tomado por otro asesor">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>
            {ownership.activeAssigneeDisplayName ?? "Otro asesor"} conserva la
            asignación. Actualiza el caso antes de intentar una acción.
          </span>
          <StatusBadge tone="failed" label="Bloqueado por colisión" />
        </div>
      </Alert>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-dark/10 bg-white p-4">
      <div>
        <p className="text-sm font-semibold text-text-main">
          {ownedByCurrentActor
            ? "Caso bajo tu atención"
            : "Caso gestionado por Koral"}
        </p>
        <p className="mt-1 text-xs text-text-muted">
          Versión de conversación {ownership.conversationVersion}
        </p>
      </div>
      {ownedByCurrentActor ? (
        <Button type="button" variant="secondary" onClick={onReturnToKoral}>
          Devolver a Koral
        </Button>
      ) : (
        <Button type="button" onClick={onTakeover}>
          Tomar caso
        </Button>
      )}
    </div>
  );
}
