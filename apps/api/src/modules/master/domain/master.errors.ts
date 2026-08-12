export type MasterErrorCode =
  | "MASTER_DISABLED"
  | "MASTER_DRIVER_NOT_INSTALLED"
  | "MASTER_IDENTITY_MISMATCH"
  | "MASTER_UNAVAILABLE"
  | "MASTER_TIMEOUT"
  | "MASTER_CIRCUIT_OPEN"
  | "MASTER_QUERY_NOT_READY"
  | "MASTER_INVALID_RESPONSE";

export class MasterDomainError extends Error {
  constructor(
    readonly code: MasterErrorCode,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "MasterDomainError";
  }
}

export class MasterDisabledError extends MasterDomainError {
  constructor() {
    super("MASTER_DISABLED", "La integración con el sistema maestro está deshabilitada.", false);
  }
}

export class MasterDriverNotInstalledError extends MasterDomainError {
  constructor() {
    super("MASTER_DRIVER_NOT_INSTALLED", "El cliente Firebird de solo lectura aún no está instalado.", false);
  }
}

export class MasterIdentityMismatchError extends MasterDomainError {
  constructor() {
    super(
      "MASTER_IDENTITY_MISMATCH",
      "La identidad de conexión al sistema maestro no está autorizada.",
      false,
    );
  }
}

export class MasterUnavailableError extends MasterDomainError {
  constructor() {
    super("MASTER_UNAVAILABLE", "El sistema maestro no está disponible.", true);
  }
}

export class MasterTimeoutError extends MasterDomainError {
  constructor() {
    super("MASTER_TIMEOUT", "La consulta al sistema maestro excedió el tiempo permitido.", true);
  }
}

export class MasterCircuitOpenError extends MasterDomainError {
  constructor() {
    super("MASTER_CIRCUIT_OPEN", "El acceso al sistema maestro está temporalmente suspendido.", true);
  }
}

export class MasterQueryNotReadyError extends MasterDomainError {
  constructor(operation: string, reason: string) {
    super("MASTER_QUERY_NOT_READY", `La operación ${operation} permanece bloqueada: ${reason}`, false);
  }
}

export class MasterInvalidResponseError extends MasterDomainError {
  constructor(operation: string) {
    super("MASTER_INVALID_RESPONSE", `El sistema maestro devolvió datos inválidos para ${operation}.`, false);
  }
}
