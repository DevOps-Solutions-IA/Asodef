/**
 * Cross-tab logout sync (US-010 section 4/7) without storing any token -
 * the localStorage value is only ever a timestamp used purely as a
 * broadcast signal ("someone logged out, react to it"), read via the
 * standard `storage` event other open tabs already receive for free.
 */
const BROADCAST_KEY = "asodef:auth:logout-broadcast";

export function broadcastLogout(): void {
  try {
    localStorage.setItem(BROADCAST_KEY, String(Date.now()));
  } catch {
    // localStorage can throw (private browsing, disabled storage) - this
    // tab's own logout still proceeds regardless; cross-tab sync simply
    // degrades to "no sync" rather than breaking logout itself.
  }
}

export function subscribeToLogoutBroadcast(onLogout: () => void): () => void {
  function handleStorage(event: StorageEvent): void {
    if (event.key === BROADCAST_KEY) {
      onLogout();
    }
  }
  window.addEventListener("storage", handleStorage);
  return () => window.removeEventListener("storage", handleStorage);
}
