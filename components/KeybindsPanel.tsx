"use client";

import { useEffect, useState } from "react";
import type { KeyBindings } from "@/lib/arena/input";
import { loadCustomBindings, resetCustomBindings, saveCustomBindings } from "@/lib/arena/keybinds";
import { playSound } from "@/lib/arena/sound";

type RemappableAction = "left" | "right" | "up" | "down" | "jumpMod" | "q" | "e" | "r" | "f" | "shift";

const ACTION_LABELS: Record<RemappableAction, string> = {
  left: "Move Left",
  right: "Move Right",
  up: "Aim Up",
  down: "Aim Down",
  jumpMod: "Jump / Drop Modifier",
  q: "Skill Q",
  e: "Skill E",
  r: "Skill R",
  f: "Skill F",
  shift: "Skill (5th)",
};
const ACTIONS = Object.keys(ACTION_LABELS) as RemappableAction[];

/** Escape/Tab are already reserved by the pause menu and the combo list —
 *  binding an action to either would make it impossible to reach that menu. */
const RESERVED = new Set(["Escape", "Tab"]);

function keyLabel(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Arrow")) return code.slice(5);
  return code;
}

export function KeybindsPanel({ onClose }: { onClose: () => void }) {
  const [bindings, setBindingsState] = useState<KeyBindings>(() => loadCustomBindings());
  const [listening, setListening] = useState<RemappableAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      if (RESERVED.has(e.code)) {
        setError(`${e.code} is reserved for menus.`);
        return;
      }
      const conflict = ACTIONS.find((a) => a !== listening && bindings[a] === e.code);
      if (conflict) {
        setError(`Already bound to ${ACTION_LABELS[conflict]}.`);
        return;
      }
      const next = { ...bindings, [listening]: e.code };
      setBindingsState(next);
      saveCustomBindings(next);
      setListening(null);
      setError(null);
      playSound("uiClick");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [listening, bindings]);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>Controls</h2>
          <button className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="hint" style={{ marginBottom: 10 }}>
          Click a binding, then press the key you want. Mouse buttons (attack) aren&apos;t
          remappable. Takes effect as soon as you resume.
        </p>
        {error && <p className="hint" style={{ color: "var(--danger)" }}>{error}</p>}
        <div className="keybind-list">
          {ACTIONS.map((action) => (
            <div className="keybind-row" key={action}>
              <span>{ACTION_LABELS[action]}</span>
              <button
                className={`btn tiny ${listening === action ? "" : "btn-ghost"}`}
                onClick={() => {
                  setError(null);
                  setListening(action);
                }}
              >
                {listening === action ? "Press a key…" : keyLabel(bindings[action] as string)}
              </button>
            </div>
          ))}
        </div>
        <button
          className="btn btn-ghost"
          style={{ width: "100%", marginTop: 16 }}
          onClick={() => {
            resetCustomBindings();
            setBindingsState(loadCustomBindings());
            setError(null);
            playSound("uiClick");
          }}
        >
          Reset to Defaults
        </button>
      </div>
    </div>
  );
}
