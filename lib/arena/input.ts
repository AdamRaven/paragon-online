import { DOUBLE_TAP_WINDOW } from "./constants";

const PREVENT = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyQ",
  "KeyE",
  "KeyR",
  "KeyF",
  "Space",
  "ShiftLeft",
  "ShiftRight",
]);

/**
 * Keyboard + mouse state for the arena.
 *
 * Movement is WASD only. Jumping deliberately requires Space *and* W together,
 * and dropping through a platform requires Space *and* S, per the design.
 * Sprinting is armed by double-tapping a direction and holding it.
 */
export class ArenaInput {
  private held = new Set<string>();
  private pressed = new Set<string>();
  private mouseHeld = [false, false, false];
  private mousePressed = [false, false, false];
  private lastTap: Record<string, number> = {};
  private detach: Array<() => void> = [];

  /** -1 sprinting left, 1 sprinting right, 0 walking. */
  sprintDir = 0;
  /** Seconds LMB and RMB have been held down together. */
  bothButtonsHeld = 0;

  attach(target: HTMLElement) {
    const now = () => performance.now() / 1000;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (PREVENT.has(e.code)) e.preventDefault();
      this.held.add(e.code);
      this.pressed.add(e.code);

      // Double-tap a direction to arm the sprint; it holds until release.
      if (e.code === "KeyD" || e.code === "KeyA") {
        const t = now();
        if (t - (this.lastTap[e.code] ?? -99) <= DOUBLE_TAP_WINDOW) {
          this.sprintDir = e.code === "KeyD" ? 1 : -1;
        }
        this.lastTap[e.code] = t;
        // Turning the other way cancels a sprint already in progress.
        const other = e.code === "KeyD" ? -1 : 1;
        if (this.sprintDir === other) this.sprintDir = 0;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      this.held.delete(e.code);
      if (
        (e.code === "KeyD" && this.sprintDir === 1) ||
        (e.code === "KeyA" && this.sprintDir === -1)
      ) {
        this.sprintDir = 0;
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button > 2) return;
      e.preventDefault();
      target.focus();
      this.mouseHeld[e.button] = true;
      this.mousePressed[e.button] = true;
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button > 2) return;
      this.mouseHeld[e.button] = false;
    };
    const onContext = (e: Event) => e.preventDefault();
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
    this.reset();
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
    return this.mouseHeld[0];
  }
  rmbDown() {
    return this.mouseHeld[2];
  }
  consumeLmb() {
    if (!this.mousePressed[0]) return false;
    this.mousePressed[0] = false;
    return true;
  }
  consumeRmb() {
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

  /** Horizontal intent from A/D. */
  moveX(): number {
    let x = 0;
    if (this.isDown("KeyA")) x -= 1;
    if (this.isDown("KeyD")) x += 1;
    return x;
  }

  /** Sprint applies only while holding the direction it was armed in. */
  isSprinting(): boolean {
    if (this.sprintDir === 1) return this.isDown("KeyD");
    if (this.sprintDir === -1) return this.isDown("KeyA");
    return false;
  }
}
