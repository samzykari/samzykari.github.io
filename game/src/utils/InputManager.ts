export type InputAction =
  | "laneLeft"
  | "laneRight"
  | "accelerate"
  | "brake"
  | "nitro"
  | "powerup"
  | "pause";

const DEFAULT_BINDINGS: Record<InputAction, string[]> = {
  laneLeft: ["KeyA", "ArrowLeft"],
  laneRight: ["KeyD", "ArrowRight"],
  accelerate: ["KeyW", "ArrowUp"],
  brake: ["KeyS", "ArrowDown"],
  nitro: ["Space"],
  powerup: ["ShiftLeft", "ShiftRight"],
  pause: ["Escape"],
};

/**
 * Keyboard input manager. Tracks pressed state and emits
 * discrete "just pressed" events for lane-switching.
 */
export class InputManager {
  private _pressed: Set<string> = new Set();
  private _justPressed: Set<string> = new Set();
  private _bindings: Record<InputAction, string[]>;
  private _enabled = true;

  // Touch-injected actions (separate from keyboard codes)
  private _touchHeld: Set<InputAction> = new Set();
  private _touchJustPressed: Set<InputAction> = new Set();
  private _touchPointers: Map<InputAction, Set<number>> = new Map();

  constructor(bindings?: Record<InputAction, string[]>) {
    this._bindings = bindings ?? { ...DEFAULT_BINDINGS };
    this._setupListeners();
    this._setupTouchControls();
  }

  private _setupListeners(): void {
    window.addEventListener("keydown", (e) => {
      if (!this._enabled) return;
      if (!this._pressed.has(e.code)) {
        this._justPressed.add(e.code);
      }
      this._pressed.add(e.code);
    });

    window.addEventListener("keyup", (e) => {
      this._pressed.delete(e.code);
    });

    // Clear state on blur to prevent stuck keys
    window.addEventListener("blur", () => {
      this._pressed.clear();
      this._justPressed.clear();
      this._clearTouchState();
    });
  }

  // ─── Touch Controls ───

  private _setupTouchControls(): void {
    const isTouchDevice =
      "ontouchstart" in window || navigator.maxTouchPoints > 0;
    if (!isTouchDevice) return;

    document.body.classList.add("touch-enabled");

    const usePointerEvents = "PointerEvent" in window;

    // Steering zones
    this._wireTouchControl("touch-left", "laneLeft", usePointerEvents);
    this._wireTouchControl("touch-right", "laneRight", usePointerEvents);

    // Action buttons
    this._wireTouchControl("touch-nitro", "nitro", usePointerEvents);
    this._wireTouchControl("touch-blast", "powerup", usePointerEvents);
    this._wireTouchControl("touch-brake", "brake", usePointerEvents);
  }

  private _wireTouchControl(
    elementId: string,
    action: InputAction,
    usePointerEvents: boolean
  ): void {
    const el = document.getElementById(elementId);
    if (!el) return;

    if (usePointerEvents) {
      this._wirePointer(el, action);
      return;
    }

    this._wireTouch(el, action);
  }

  private _wirePointer(el: HTMLElement, action: InputAction): void {
    el.addEventListener(
      "pointerdown",
      (e) => {
        e.preventDefault();
        if (typeof el.setPointerCapture === "function") {
          el.setPointerCapture(e.pointerId);
        }
        this._trackPointer(action, e.pointerId, true);
      },
      { passive: false }
    );

    const release = (e: PointerEvent) => {
      this._trackPointer(action, e.pointerId, false);
    };

    el.addEventListener("pointerup", release);
    el.addEventListener("pointercancel", release);
    el.addEventListener("pointerleave", release);
  }

  private _wireTouch(el: HTMLElement, action: InputAction): void {
    const onStart = (e: TouchEvent) => {
      e.preventDefault();
      for (const touch of Array.from(e.changedTouches)) {
        this._trackPointer(action, touch.identifier, true);
      }
    };

    const onEnd = (e: TouchEvent) => {
      for (const touch of Array.from(e.changedTouches)) {
        this._trackPointer(action, touch.identifier, false);
      }
    };

    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
  }

  private _trackPointer(action: InputAction, id: number, isDown: boolean): void {
    if (!this._touchPointers.has(action)) {
      this._touchPointers.set(action, new Set());
    }

    const ids = this._touchPointers.get(action);
    if (!ids) return;

    if (isDown) {
      if (!ids.has(id)) {
        ids.add(id);
        if (!this._touchHeld.has(action)) {
          this._touchJustPressed.add(action);
          this._touchHeld.add(action);
        }
      }
      return;
    }

    if (ids.has(id)) {
      ids.delete(id);
      if (ids.size === 0) {
        this._touchHeld.delete(action);
      }
    }
  }

  private _clearTouchState(): void {
    this._touchHeld.clear();
    this._touchJustPressed.clear();
    this._touchPointers.clear();
  }

  /** Inject a virtual press for an action (used by touch controls). */
  injectPress(action: InputAction): void {
    if (!this._enabled) return;
    if (!this._touchHeld.has(action)) {
      this._touchJustPressed.add(action);
    }
    this._touchHeld.add(action);
  }

  /** Release a virtual press for an action (used by touch controls). */
  injectRelease(action: InputAction): void {
    this._touchHeld.delete(action);
  }

  /** Call at end of each frame to reset just-pressed state. */
  endFrame(): void {
    this._justPressed.clear();
    this._touchJustPressed.clear();
  }

  /** Is the action currently held down? */
  isHeld(action: InputAction): boolean {
    if (this._touchHeld.has(action)) return true;
    return this._bindings[action].some((code) => this._pressed.has(code));
  }

  /** Was the action pressed this frame (not held from previous)? */
  isJustPressed(action: InputAction): boolean {
    if (this._touchJustPressed.has(action)) return true;
    return this._bindings[action].some((code) => this._justPressed.has(code));
  }

  set enabled(v: boolean) {
    this._enabled = v;
    if (!v) {
      this._pressed.clear();
      this._justPressed.clear();
      this._clearTouchState();
    }
  }

  get enabled(): boolean {
    return this._enabled;
  }
}
