import { P1_BINDINGS, type KeyBindings } from "./input";

const STORAGE_KEY = "paragon:keybinds:v1";

/** P1's bindings only — P2 in local co-op is keyboard-only and needs both
 *  hands free of P1's remapped keys, so its layout stays fixed. */
export function loadCustomBindings(): KeyBindings {
  if (typeof window === "undefined") return { ...P1_BINDINGS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...P1_BINDINGS };
    const parsed = JSON.parse(raw) as Partial<KeyBindings>;
    return { ...P1_BINDINGS, ...parsed };
  } catch {
    return { ...P1_BINDINGS };
  }
}

export function saveCustomBindings(bindings: KeyBindings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
  } catch {
    /* private mode: the remap just won't persist */
  }
}

export function resetCustomBindings() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
