import { Alert, Button } from "@asodef/ui";

export const BACKEND_GOVERNANCE_REQUIRED =
  "ACTION_DISABLED_BACKEND_GOVERNANCE_REQUIRED";

export function SensitiveActionUnavailable({
  domain,
}: {
  domain: string;
}) {
  return (
    <Alert variant="warning" title="Acciones operativas deshabilitadas">
      <p>
        {domain} permanece disponible en modo de consulta. Las mutaciones se
        habilitarán únicamente cuando el backend exija step-up, idempotencia,
        auditoría y control de concurrencia de forma canónica.
      </p>
      <code className="mt-2 block break-all text-xs font-semibold">
        {BACKEND_GOVERNANCE_REQUIRED}
      </code>
    </Alert>
  );
}

export function GovernanceDisabledButton({ label }: { label: string }) {
  return (
    <Button
      type="button"
      size="sm"
      disabled
      aria-describedby="operations-governance-requirement"
      title={BACKEND_GOVERNANCE_REQUIRED}
    >
      {label}
    </Button>
  );
}

export function GovernanceRequirementDescription() {
  return (
    <span id="operations-governance-requirement" className="sr-only">
      Acción no disponible: el backend todavía no garantiza step-up,
      idempotencia, auditoría y control de concurrencia.
    </span>
  );
}
