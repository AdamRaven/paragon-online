"use client";

import { useEffect, useRef } from "react";
import type { ArenaInput } from "@/lib/arena/input";

/**
 * On-screen touch controls for adventure mode — a movement pad (bottom
 * left), Jump/Attack/Heavy buttons (bottom right), and a contextual "talk"
 * button that appears over an in-range town NPC. Always mounted so touch
 * events work the moment a finger lands on the screen; visibility itself is
 * handled by CSS (`@media (pointer: coarse)`, see .touch in globals.css) so
 * nothing here has to guess whether the current device is a phone.
 *
 * Every control drives the same ArenaInput instance real keyboard/mouse
 * input does (see the touch* methods on ArenaInput) — readIntent() and the
 * engine never know the difference.
 */
export function TouchControls({
  input,
  nearNpc,
  onInteract,
}: {
  input: ArenaInput;
  nearNpc?: "Blacksmith" | "Vendor" | "Storage" | null;
  onInteract: () => void;
}) {
  return (
    <div className="touch">
      <MovePad input={input} />
      <div className="touch-buttons">
        <HoldButton
          className="touch-btn"
          label="JUMP"
          onDown={() => {
            const b = input.getBindings();
            input.touchKeyDown(b.jumpMod);
            input.touchKeyDown(b.up);
          }}
          onUp={() => {
            const b = input.getBindings();
            input.touchKeyUp(b.jumpMod);
            input.touchKeyUp(b.up);
          }}
        />
        <HoldButton
          className="touch-btn"
          label="ATK"
          onDown={() => input.touchMouseDown(0)}
          onUp={() => input.touchMouseUp(0)}
        />
        <HoldButton
          className="touch-btn"
          label="HVY"
          onDown={() => input.touchMouseDown(2)}
          onUp={() => input.touchMouseUp(2)}
        />
      </div>
      {nearNpc && (
        <button type="button" className="touch-btn touch-interact" onClick={onInteract}>
          Talk to {nearNpc}
        </button>
      )}
    </div>
  );
}

/** A press-and-hold circular button — Jump/Attack/Heavy all just need the
 *  bound key or mouse button held for exactly as long as the finger is
 *  down, same as a real keydown/mousedown would. */
function HoldButton({
  className,
  label,
  onDown,
  onUp,
}: {
  className: string;
  label: string;
  onDown: () => void;
  onUp: () => void;
}) {
  const active = useRef(false);

  const press = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    if (active.current) return;
    active.current = true;
    onDown();
  };
  const release = () => {
    if (!active.current) return;
    active.current = false;
    onUp();
  };

  useEffect(() => () => release(), []);

  return (
    <button
      type="button"
      className={className}
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={release}
    >
      {label}
    </button>
  );
}

/** Left/right movement, drag-to-sprint: the nub follows the finger
 *  horizontally within the pad, arming a direction past a small deadzone
 *  and sprint once dragged near the pad's edge — the touch equivalent of
 *  double-tapping a direction and holding it. */
function MovePad({ input }: { input: ArenaInput }) {
  const padRef = useRef<HTMLDivElement>(null);
  const nubRef = useRef<HTMLDivElement>(null);
  const dirRef = useRef<-1 | 0 | 1>(0);
  const pointerId = useRef<number | null>(null);

  const DEADZONE = 14;
  const SPRINT_AT = 34;

  const setDir = (dir: -1 | 0 | 1, sprint: boolean) => {
    if (dirRef.current !== dir) {
      const b = input.getBindings();
      if (dirRef.current === -1) input.touchKeyUp(b.left);
      if (dirRef.current === 1) input.touchKeyUp(b.right);
      if (dir === -1) input.touchKeyDown(b.left);
      if (dir === 1) input.touchKeyDown(b.right);
      dirRef.current = dir;
    }
    input.setTouchSprintDir(sprint ? dir : 0);
  };

  const updateFromClientX = (clientX: number) => {
    const pad = padRef.current;
    const nub = nubRef.current;
    if (!pad || !nub) return;
    const rect = pad.getBoundingClientRect();
    const max = rect.width / 2 - nub.offsetWidth / 2;
    const dx = Math.max(-max, Math.min(max, clientX - (rect.left + rect.width / 2)));
    nub.style.transform = `translateX(${dx}px)`;
    const mag = Math.abs(dx);
    const dir = mag < DEADZONE ? 0 : dx > 0 ? 1 : -1;
    setDir(dir, mag >= SPRINT_AT);
  };

  const reset = () => {
    setDir(0, false);
    if (nubRef.current) nubRef.current.style.transform = "translateX(0)";
  };

  useEffect(() => () => reset(), []);

  return (
    <div
      ref={padRef}
      className="touch-pad"
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        pointerId.current = e.pointerId;
        updateFromClientX(e.clientX);
      }}
      onPointerMove={(e) => {
        if (pointerId.current !== e.pointerId) return;
        updateFromClientX(e.clientX);
      }}
      onPointerUp={(e) => {
        if (pointerId.current !== e.pointerId) return;
        pointerId.current = null;
        reset();
      }}
      onPointerCancel={(e) => {
        if (pointerId.current !== e.pointerId) return;
        pointerId.current = null;
        reset();
      }}
    >
      <div ref={nubRef} className="touch-nub" />
    </div>
  );
}
