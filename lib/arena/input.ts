import { DOUBLE_TAP_WINDOW } from "./constants";

export interface KeyBindings {
  left: string;
  right: string;
  up: string;
  down: string;
  /** The Space-equivalent modifier: jump needs this + up, drop needs this + down. */
  jumpMod: string;
  q: string;
  e: string;
  r: string;
  f: string;
  shift: string;
  /**
   * Only player one has a mouse to share. Player two's LMB/RMB are ordinary
   * keys instead — set here and read through the same lmbDown()/rmbDown()
   * API so the rest of the input/engine code never has to know which
   * fighter is keyboard-only.
   */
  lmb?: string;
  rmb?: string;
}

export const P1_BINDINGS: KeyBindings = {
  left: "KeyA",
  right: "KeyD",
  up: "KeyW",
  down: "KeyS",
  jumpMod: "Space",
  q: "KeyQ",
  e: "KeyE",
  r: "KeyR",
  f: "KeyF",
  // Not an actual Shift key, despite the field name (kept for the Intent/
  // engine's existing "shift" vocabulary) — holding Shift while right-
  // clicking is a browser-level escape hatch (so a page can never fully
  // block access to "Inspect Element"), and it ignores preventDefault() no
  // matter what a page's JS does. RMB is Heavy Attack, so a Special bound to
  // Shift meant every Dash-into-heavy-attack combo had a chance of kicking
  // the browser's native context menu open mid-fight. KeyC has no such
  // reserved meaning.
  shift: "KeyC",
};

/** Keyboard-only, for local 2-player duels sharing one keyboard. */
export const P2_BINDINGS: KeyBindings = {
  left: "ArrowLeft",
  right: "ArrowRight",
  up: "ArrowUp",
  down: "ArrowDown",
  jumpMod: "Slash",
  lmb: "Comma",
  rmb: "Period",
  q: "Numpad1",
  e: "Numpad2",
  r: "Numpad3",
  f: "Numpad4",
  shift: "Numpad0",
};

const PREVENT = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyQ",
  "KeyE",
  "KeyR",
  "KeyF",
  "KeyC",
  "Space",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Slash",
  "Comma",
  "Period",
  "Numpad0",
  "Numpad1",
  "Numpad2",
  "Numpad3",
  "Numpad4",
]);

/**
 * Keyboard (+ mouse, for player one) state for the arena.
 *
 * Movement is bound by `bindings`, defaulting to WASD. Jumping deliberately
 * requires the jump modifier *and* up together, and dropping through a
 * platform requires the modifier *and* down, per the design. Sprinting is
 * armed by double-tapping a direction and holding it.
 */
export class ArenaInput {
  private held = new Set<string>();
  private pressed = new Set<string>();
  private mouseHeld = [false, false, false];
  private mousePressed = [false, false, false];
  private lastTap: Record<string, number> = {};
  private detach: Array<() => void> = [];
  private bindings: KeyBindings;
  /** True for player one, who has a real mouse; false uses bindings.lmb/rmb instead. */
  private useMouse: boolean;
  private target: HTMLElement | null = null;
  /**
   * True while gameplay wants the pointer locked — set by lockPointer()/
   * unlockPointer(), and re-checked opportunistically on every mousedown so
   * a lock dropped involuntarily (Esc, alt-tab) reacquires itself the next
   * time the player clicks back into the canvas, with no polling needed.
   */
  private wantsLock = false;

  /** -1 sprinting left, 1 sprinting right, 0 walking. */
  sprintDir = 0;
  /** Seconds LMB and RMB have been held down together. */
  bothButtonsHeld = 0;

  constructor(bindings: KeyBindings = P1_BINDINGS, useMouse = true) {
    this.bindings = bindings;
    this.useMouse = useMouse;
  }

  attach(target: HTMLElement) {
    const now = () => performance.now() / 1000;
    const b = this.bindings;
    this.target = target;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (PREVENT.has(e.code)) e.preventDefault();
      this.held.add(e.code);
      this.pressed.add(e.code);

      // Double-tap a direction to arm the sprint; it holds until release.
      if (e.code === b.right || e.code === b.left) {
        const t = now();
        if (t - (this.lastTap[e.code] ?? -99) <= DOUBLE_TAP_WINDOW) {
          this.sprintDir = e.code === b.right ? 1 : -1;
        }
        this.lastTap[e.code] = t;
        // Turning the other way cancels a sprint already in progress.
        const other = e.code === b.right ? -1 : 1;
        if (this.sprintDir === other) this.sprintDir = 0;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      this.held.delete(e.code);
      if (
        (e.code === b.right && this.sprintDir === 1) ||
        (e.code === b.left && this.sprintDir === -1)
      ) {
        this.sprintDir = 0;
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      if (!this.useMouse || e.button > 2) return;
      e.preventDefault();
      target.focus();
      this.mouseHeld[e.button] = true;
      this.mousePressed[e.button] = true;
      // A lock can be dropped involuntarily (Esc, alt-tab away) without any
      // panel opening to tell us to stop wanting it — clicking back into the
      // canvas is itself a fresh user gesture, so silently reacquire here
      // instead of leaving the player stuck with a visible cursor.
      if (this.wantsLock && document.pointerLockElement !== target) {
        this.requestLock();
      }
    };
    const onMouseUp = (e: MouseEvent) => {
      if (!this.useMouse || e.button > 2) return;
      this.mouseHeld[e.button] = false;
    };
    const onContext = (e: Event) => {
      if (this.useMouse) e.preventDefault();
    };
    const onBlur = () => this.reset();

    window.addEventListener("keydown", onKeyDown, { passive: false });
    window.addEventListener("keyup", onKeyUp);
    target.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    target.addEventListener("contextmenu", onContext);
    window.addEventListener("blur", onBlur);

    this.detach = [
      () => window.removeEventListener("keydown", onKeyDown),
      () => window.removeEventListener("keyup", onKeyUp),
      () => target.removeEventListener("mousedown", onMouseDown),
      () => window.removeEventListener("mouseup", onMouseUp),
      () => target.removeEventListener("contextmenu", onContext),
      () => window.removeEventListener("blur", onBlur),
    ];
  }

  dispose() {
    for (const fn of this.detach) fn();
    this.detach = [];
    this.unlockPointer();
    this.reset();
  }

  private requestLock() {
    if (!this.target) return;
    try {
      // Chromium returns a Promise; older implementations return undefined
      // and fire pointerlockerror instead — either way, a rejection here
      // just means "no lock this time" (most commonly: called without a
      // fresh-enough user gesture), never worth surfacing to the player.
      const p = this.target.requestPointerLock() as unknown as Promise<void> | undefined;
      p?.catch?.(() => {});
    } catch {
      /* ignore */
    }
  }

  /**
   * Engages the pointer lock and keeps it engaged: hiding the OS cursor over
   * the canvas is what actually stops Chromium's Shift+right-click "open
   * Inspect Element" escape hatch, since that override only exists for the
   * ordinary visible-cursor context-menu path — with no cursor to attach a
   * menu to, it never fires. Mouse position was never read anywhere in this
   * codebase (LMB/RMB are plain button states), so losing absolute cursor
   * coordinates while locked costs nothing. Must be called from inside a
   * user-gesture handler (a click), same as any requestPointerLock() call.
   */
  lockPointer() {
    if (!this.useMouse) return;
    this.wantsLock = true;
    if (this.target && document.pointerLockElement !== this.target) this.requestLock();
  }

  /** Releases the lock for a mouse-driven menu/panel, and stops the
   *  opportunistic reacquire in onMouseDown until lockPointer() is called again. */
  unlockPointer() {
    this.wantsLock = false;
    if (this.target && document.pointerLockElement === this.target) {
      document.exitPointerLock();
    }
  }

  private reset() {
    this.held.clear();
    this.pressed.clear();
    this.mouseHeld = [false, false, false];
    this.mousePressed = [false, false, false];
    this.sprintDir = 0;
    this.bothButtonsHeld = 0;
  }

  isDown(code: string) {
    return this.held.has(code);
  }

  /** True once per key press. */
  consume(code: string) {
    if (!this.pressed.has(code)) return false;
    this.pressed.delete(code);
    return true;
  }

  wasPressed(code: string) {
    return this.pressed.has(code);
  }

  lmbDown() {
    if (this.useMouse) return this.mouseHeld[0];
    return this.bindings.lmb ? this.isDown(this.bindings.lmb) : false;
  }
  rmbDown() {
    if (this.useMouse) return this.mouseHeld[2];
    return this.bindings.rmb ? this.isDown(this.bindings.rmb) : false;
  }
  consumeLmb() {
    if (!this.useMouse) return this.bindings.lmb ? this.consume(this.bindings.lmb) : false;
    if (!this.mousePressed[0]) return false;
    this.mousePressed[0] = false;
    return true;
  }
  consumeRmb() {
    if (!this.useMouse) return this.bindings.rmb ? this.consume(this.bindings.rmb) : false;
    if (!this.mousePressed[2]) return false;
    this.mousePressed[2] = false;
    return true;
  }

  /** Called once per simulation step, after the engine has read input. */
  step(dt: number) {
    if (this.lmbDown() && this.rmbDown()) this.bothButtonsHeld += dt;
    else this.bothButtonsHeld = 0;

    this.pressed.clear();
    this.mousePressed = [false, false, false];
  }

  /** Horizontal intent from the configured left/right keys. */
  moveX(): number {
    let x = 0;
    if (this.isDown(this.bindings.left)) x -= 1;
    if (this.isDown(this.bindings.right)) x += 1;
    return x;
  }

  /** Sprint applies only while holding the direction it was armed in. */
  isSprinting(): boolean {
    if (this.sprintDir === 1) return this.isDown(this.bindings.right);
    if (this.sprintDir === -1) return this.isDown(this.bindings.left);
    return false;
  }

  /** Exposes the active binding set, e.g. for readIntent() and control-list UI. */
  getBindings(): KeyBindings {
    return this.bindings;
  }

  /** Swaps in a freshly-edited binding set mid-session — see KeybindsPanel,
   *  applied when the pause menu closes rather than requiring a page reload. */
  setBindings(bindings: KeyBindings) {
    this.bindings = bindings;
    this.reset();
  }
}
