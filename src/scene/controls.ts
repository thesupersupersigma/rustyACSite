// The stage controls: the round "Hold to rev" button (which turns into "Pit stop" after the pop), the
// first-time hint, the pit-stop timer and the screen-reader announcements. Built here, in the scene
// chunk, so the homepage carries none of it for visitors who never get the scene.
//
// This file only reports what the visitor is doing (`held`, `onPitStop`); burnout.ts decides what
// that means.

export type ControlMode = 'rev' | 'pit' | 'busy';

const RING = 2 * Math.PI * 46; // circumference of the rev ring in SVG units

const CSS = /* css */ `
.rev {
  position: absolute;
  left: 50%;
  bottom: clamp(20px, 5vh, 44px);
  z-index: 2;
  display: grid;
  justify-items: center;
  gap: 10px;
  transform: translateX(-50%);
  opacity: var(--stage, 1);
  pointer-events: none;
  /* the stage is a night scene in both themes */
  color: #f5f5f5;
}
.rev[hidden] { display: none; }
.rev__btn {
  position: relative;
  display: grid;
  place-items: center;
  width: 104px;
  height: 104px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: rgb(14 14 14 / 0.7);
  color: inherit;
  font: 600 0.8125rem/1.15 var(--font-body, system-ui, sans-serif);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
  pointer-events: auto;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.12s var(--ease, ease), background-color 0.2s linear;
}
.rev__btn:hover { background: rgb(14 14 14 / 0.84); }
.rev__btn.is-held { transform: scale(0.95); background: rgb(30 14 6 / 0.82); }
.rev__btn[aria-disabled='true'] { cursor: default; opacity: 0.55; }
.rev__ring {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
  pointer-events: none;
}
.rev__ring circle { fill: none; stroke-width: 5; }
.rev__ring .rev__track { stroke: rgb(245 245 245 / 0.2); }
.rev__ring .rev__fill {
  stroke: #d2581f;
  stroke-linecap: round;
  stroke-dasharray: ${RING.toFixed(2)};
  stroke-dashoffset: ${RING.toFixed(2)};
}
.rev__btn.is-pit .rev__fill { stroke-dashoffset: 0; }
.rev__label { position: relative; max-width: 5.5em; text-align: center; pointer-events: none; }
.rev__hint {
  margin: 0;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgb(14 14 14 / 0.55);
  color: rgb(245 245 245 / 0.82);
  font-size: 0.8125rem;
  white-space: nowrap;
  transition: opacity 0.4s linear;
}
.rev__hint.is-gone { opacity: 0; }
.rev__timer {
  margin: 0 0 6px;
  font: 500 clamp(2.5rem, 6vw, 4.5rem)/1 var(--font-mono, ui-monospace, monospace);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
  text-shadow: 0 2px 18px rgb(0 0 0 / 0.7);
  opacity: 0;
  transition: opacity 0.5s linear;
}
.rev__timer.is-on { opacity: 1; transition-duration: 0.1s; }
.rev__live {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
@media (prefers-reduced-motion: reduce) {
  .rev__btn, .rev__hint, .rev__timer { transition: none; }
}
`;

const LABEL: Record<ControlMode, string> = { rev: 'Hold to rev', pit: 'Pit stop', busy: 'Pit stop' };

function isOtherControl(el: Element | null, own: Element): boolean {
  if (!el || el === own || el === document.body || el === document.documentElement) return false;
  return true;
}

export class Controls {
  /** True while the visitor holds the throttle (button, Space or Enter). */
  held = false;
  /** Called when the visitor asks for the pit stop. */
  onPitStop: (() => void) | undefined;

  private mode: ControlMode = 'rev';
  private inStage = false;
  private pointerId = -1;
  private spaceDown = false;
  private enterDown = false;
  private swallowClick = false;
  private hintGone = false;
  private ringStep = -1;
  private timerCentis = -1;
  private timerOn = false;

  private readonly root: HTMLDivElement;
  private readonly style: HTMLStyleElement;
  private readonly button: HTMLButtonElement;
  private readonly label: HTMLSpanElement;
  private readonly fill: SVGCircleElement;
  private readonly hint: HTMLParagraphElement;
  private readonly timer: HTMLParagraphElement;
  private readonly live: HTMLParagraphElement;
  /** Dash offsets for 0 to 100% of the ring, made once so a frame never builds a string. */
  private readonly ringOffsets: string[] = [];
  private readonly timerTexts: string[] = [];

  constructor(parent: HTMLElement) {
    this.style = document.createElement('style');
    this.style.textContent = CSS;
    document.head.appendChild(this.style);

    for (let i = 0; i <= 100; i++) this.ringOffsets.push((RING * (1 - i / 100)).toFixed(2));

    const root = document.createElement('div');
    root.className = 'rev';
    root.hidden = true;
    root.innerHTML =
      '<p class="rev__timer" aria-hidden="true">0.00 s</p>' +
      '<button class="rev__btn" type="button" aria-pressed="false" aria-describedby="rev-hint">' +
      '<svg class="rev__ring" viewBox="0 0 104 104" aria-hidden="true" focusable="false">' +
      '<circle class="rev__track" cx="52" cy="52" r="46"/><circle class="rev__fill" cx="52" cy="52" r="46"/>' +
      '</svg><span class="rev__label">Hold to rev</span></button>' +
      '<p class="rev__hint" id="rev-hint">Hold to rev · drag to look around</p>' +
      '<p class="rev__live" aria-live="polite"></p>';
    parent.appendChild(root);
    this.root = root;

    const pick = <T extends Element>(selector: string): T => {
      const el = root.querySelector<T>(selector);
      if (!el) throw new Error(`[f2004] controls: ${selector} is missing`);
      return el;
    };
    this.button = pick<HTMLButtonElement>('.rev__btn');
    this.label = pick<HTMLSpanElement>('.rev__label');
    this.fill = pick<SVGCircleElement>('.rev__fill');
    this.hint = pick<HTMLParagraphElement>('.rev__hint');
    this.timer = pick<HTMLParagraphElement>('.rev__timer');
    this.live = pick<HTMLParagraphElement>('.rev__live');

    const b = this.button;
    b.addEventListener('pointerdown', this.onPointerDown);
    b.addEventListener('pointerup', this.onPointerEnd);
    b.addEventListener('pointercancel', this.onPointerEnd);
    b.addEventListener('lostpointercapture', this.onPointerEnd);
    b.addEventListener('click', this.onClick);
    b.addEventListener('contextmenu', this.onContextMenu);
    b.addEventListener('keydown', this.onButtonKeyDown);
    b.addEventListener('keyup', this.onButtonKeyUp);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('pointerup', this.onAnyRelease, true);
    window.addEventListener('pointercancel', this.onAnyRelease, true);
    window.addEventListener('blur', this.releaseAll);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  /** Shows the controls only while the scene is in its stage phase; leaving it lets go of the throttle. */
  setStage(on: boolean): void {
    if (on === this.inStage) return;
    this.inStage = on;
    if (!on) {
      this.releaseAll();
      if (document.activeElement === this.button) this.button.blur();
    }
    this.root.hidden = !on;
  }

  setMode(mode: ControlMode): void {
    if (mode === this.mode) return;
    // a hold that is still down when the tyres pop must not count as a click on "Pit stop"
    if (mode !== 'rev' && this.held) this.swallowClick = true;
    this.mode = mode;
    this.releaseAll();
    const b = this.button;
    this.label.textContent = LABEL[mode];
    b.classList.toggle('is-pit', mode !== 'rev');
    if (mode === 'rev') b.setAttribute('aria-pressed', 'false');
    else b.removeAttribute('aria-pressed');
    if (mode === 'busy') b.setAttribute('aria-disabled', 'true');
    else b.removeAttribute('aria-disabled');
  }

  /** Fills the ring: 0 at idle, 1 at the limiter. */
  setRev(fraction: number): void {
    const step = fraction <= 0 ? 0 : fraction >= 1 ? 100 : Math.round(fraction * 100);
    if (step === this.ringStep) return;
    this.ringStep = step;
    this.fill.style.strokeDashoffset = this.ringOffsets[step] ?? '0';
  }

  /** Shows the pit-stop clock; `visible` false lets it fade out. */
  setTimer(seconds: number, visible: boolean): void {
    if (visible) {
      const centis = Math.max(0, Math.min(9999, Math.floor(seconds * 100 + 1e-6)));
      if (centis !== this.timerCentis) {
        this.timerCentis = centis;
        this.timer.textContent = this.timerTexts[centis] ??= `${(centis / 100).toFixed(2)} s`;
      }
    }
    if (visible !== this.timerOn) {
      this.timerOn = visible;
      this.timer.classList.toggle('is-on', visible);
    }
  }

  announce(text: string): void {
    this.live.textContent = text;
  }

  /** The hint has done its job after the first rev. */
  hideHint(): void {
    if (this.hintGone) return;
    this.hintGone = true;
    this.hint.classList.add('is-gone');
    this.button.removeAttribute('aria-describedby');
    window.setTimeout(() => this.hint.remove(), 600);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('pointerup', this.onAnyRelease, true);
    window.removeEventListener('pointercancel', this.onAnyRelease, true);
    window.removeEventListener('blur', this.releaseAll);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.root.remove();
    this.style.remove();
  }

  private sync(): void {
    const held = this.mode === 'rev' && this.inStage && (this.pointerId !== -1 || this.spaceDown || this.enterDown);
    if (held === this.held) return;
    this.held = held;
    this.button.classList.toggle('is-held', held);
    if (this.mode === 'rev') this.button.setAttribute('aria-pressed', held ? 'true' : 'false');
  }

  private readonly releaseAll = (): void => {
    if (this.pointerId !== -1) {
      const id = this.pointerId;
      this.pointerId = -1;
      try {
        this.button.releasePointerCapture(id);
      } catch {
        // already released
      }
    }
    this.spaceDown = false;
    this.enterDown = false;
    this.sync();
  };

  private readonly onVisibility = (): void => {
    if (document.visibilityState !== 'visible') this.releaseAll();
  };

  private readonly onPointerDown = (e: PointerEvent): void => {
    // the canvas is a sibling, so this never reaches the camera; stopping it here makes that explicit
    e.stopPropagation();
    if (this.mode !== 'rev' || !this.inStage) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    this.button.focus({ preventScroll: true });
    this.pointerId = e.pointerId;
    try {
      this.button.setPointerCapture(e.pointerId);
    } catch {
      // without capture the hold still ends on pointerup over the button
    }
    this.sync();
  };

  private readonly onPointerEnd = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = -1;
    this.sync();
  };

  /**
   * Any pointer or key going up ends the hold that was down during the pop. The click that such a
   * release produces arrives before any timer, so the flag is dropped right after it.
   */
  private readonly onAnyRelease = (): void => {
    if (this.swallowClick) window.setTimeout(() => (this.swallowClick = false), 0);
  };

  private readonly onClick = (): void => {
    if (this.swallowClick) {
      this.swallowClick = false;
      return;
    }
    if (this.mode === 'pit' && this.inStage) this.onPitStop?.();
  };

  private readonly onContextMenu = (e: Event): void => {
    // a long press on a touch screen is a hold, not a request for the menu
    e.preventDefault();
  };

  private readonly onButtonKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== 'Enter' || this.mode !== 'rev') return;
    // in rev mode Enter is a hold, not a click
    e.preventDefault();
    if (e.repeat) return;
    this.enterDown = true;
    this.sync();
  };

  private readonly onButtonKeyUp = (e: KeyboardEvent): void => {
    if (e.key !== 'Enter' || !this.enterDown) return;
    this.enterDown = false;
    this.sync();
  };

  /** Space anywhere on the page, as long as the stage fills the screen and focus is not on another control. */
  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.code !== 'Space' && e.key !== ' ') return;
    if (!this.inStage || e.altKey || e.ctrlKey || e.metaKey) return;
    const focused = document.activeElement;
    if (isOtherControl(focused, this.button)) return;
    if (this.mode === 'rev') {
      e.preventDefault(); // the page must not scroll while Space is the throttle
      if (e.repeat) return;
      this.spaceDown = true;
      this.sync();
      return;
    }
    // "Pit stop": on the focused button the browser turns Space into a click by itself
    if (focused === this.button) return;
    e.preventDefault();
    if (e.repeat || this.mode !== 'pit') return;
    this.onPitStop?.();
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.onAnyRelease();
    if (e.code !== 'Space' && e.key !== ' ') return;
    if (!this.spaceDown) return;
    this.spaceDown = false;
    this.sync();
  };
}
