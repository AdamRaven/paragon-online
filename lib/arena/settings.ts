/** Small persisted UI preferences that aren't audio (see sound.ts) and
 *  aren't part of a character save — screen shake and the colorblind-safer
 *  palette apply across every character and every mode. */

const STORAGE_KEY = "paragon:settings";

interface UiSettings {
  screenShake: boolean;
  colorblind: boolean;
}

function load(): UiSettings {
  const fallback: UiSettings = { screenShake: true, colorblind: false };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return {
      screenShake: typeof parsed.screenShake === "boolean" ? parsed.screenShake : fallback.screenShake,
      colorblind: typeof parsed.colorblind === "boolean" ? parsed.colorblind : fallback.colorblind,
    };
  } catch {
    return fallback;
  }
}

let settings = load();

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* private mode: the preference just won't persist */
  }
}

export function getScreenShakeEnabled() {
  return settings.screenShake;
}
export function setScreenShakeEnabled(v: boolean) {
  settings = { ...settings, screenShake: v };
  persist();
}

export function getColorblindMode() {
  return settings.colorblind;
}
export function setColorblindMode(v: boolean) {
  settings = { ...settings, colorblind: v };
  persist();
}
