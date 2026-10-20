/**
 * Invite codes from private-room links (`/room/:id?invite=…`), kept for the
 * tab so the room can still be opened after the URL is cleaned up or the
 * page reloads. Per-tab convenience only (sessionStorage).
 */
const STORAGE_KEY = "swm.room-invites";
const memory = new Map<string, string>();

function load(): void {
  if (memory.size > 0 || typeof window === "undefined") return;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object") {
      for (const [roomId, code] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof code === "string") memory.set(roomId, code);
      }
    }
  } catch {
    // Storage unavailable: the code just lives as long as the page.
  }
}

function save(): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(memory)));
  } catch {
    // Not persisted; still works for this page.
  }
}

export function rememberInvite(roomId: string, code: string): void {
  load();
  memory.set(roomId, code);
  save();
}

export function inviteFor(roomId: string): string | undefined {
  load();
  return memory.get(roomId);
}
