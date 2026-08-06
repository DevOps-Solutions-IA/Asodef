import { useCallback, useEffect, useState } from "react";

interface RecoverableStateEnvelope<Value> {
  version: number;
  value: Value;
}

export function useRecoverableFormState<Value>(storageKey: string, initialValue: Value, version = 1) {
  const [value, setValue] = useState<Value>(() => {
    try {
      const stored = sessionStorage.getItem(storageKey);
      if (!stored) return initialValue;
      const envelope = JSON.parse(stored) as RecoverableStateEnvelope<Value>;
      return envelope.version === version ? envelope.value : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({ version, value } satisfies RecoverableStateEnvelope<Value>));
    } catch {
      // Storage can be unavailable in private browsing. The in-memory flow remains usable.
    }
  }, [storageKey, value, version]);

  const clear = useCallback(() => {
    try { sessionStorage.removeItem(storageKey); } catch { /* The state is still reset in memory. */ }
    setValue(initialValue);
  }, [initialValue, storageKey]);

  return { value, setValue, clear } as const;
}
