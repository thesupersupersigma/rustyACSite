// The stage controls: the round "Hold to rev" button (which turns into "Pit stop" after the pop), the
// speaker button next to it, the first-time hint, the pit-stop timer and the screen-reader announcements. Built here, in the scene
// chunk, so the homepage carries none of it for visitors who never get the scene.
//
// This file only reports what the visitor is doing (`held`, `onPitStop`, `onSound`); burnout.ts and
// audio/sound.ts decide what that means.
import type { SoundState } from './types';

export type ControlMode = 'rev' | 'pit' | 'busy';

const RING = 2 * Math.PI * 46; // circumference of the rev ring in SVG units

const CSS = /* css */ `
.rev {
  position: absolute;
  left: 50%;
  /* room below the button for the hint, which is out of the flow so the button never moves */
  bottom: clamp(52px, 9vh, 76px);
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
  position: absolute;
  top: calc(100% + 10px);
  left: 50%;
  transform: translateX(-50%);
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
.rev__sound {
  position: absolute;
  /* beside the round button, level with its middle */
  left: calc(50% + 52px + 14px);
  bottom: 30px;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: rgb(14 14 14 / 0.7);
  color: rgb(245 245 245 / 0.66);
  cursor: pointer;
  pointer-events: auto;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 0.2s linear, color 0.2s linear;
}
.rev__sound:hover { background: rgb(14 14 14 / 0.84); color: #f5f5f5; }
.rev__sound.is-on { color: #f5f5f5; }
.rev__sound svg { width: 22px; height: 22px; pointer-events: none; }
.rev__sound .rev__waves { display: none; }
.rev__sound:not(.is-off) .rev__waves { display: inline; }
.rev__sound:not(.is-off) .rev__mute { display: none; }
/* loading: a ring that fills as the clips arrive (no spinning, so it is fine with reduced motion) */
.rev__sound.is-loading::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: conic-gradient(#d2581f calc(var(--sound-load, 0) * 1turn), rgb(245 245 245 / 0.22) 0);
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2.5px));
  mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2.5px));
  pointer-events: none;
}
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
  .rev__btn, .rev__hint, .rev__timer, .rev__sound { transition: none; }
}
`;

/** How long after the release of a popped hold a click still counts as that release, in ms. */
const SWALLOW_MS = 450;
/** How long after the pop a Space press on the page is ignored, in ms. */
const PIT_KEY_DELAY_MS = 600;

const LABEL: Record<ControlMode, string> = { rev: 'Hold to rev', pit: 'Pit stop', busy: 'Pit stop' };

/** The speaker button per state: its accessible name, whether it counts as pressed, and its tooltip. */
const SOUND: Record<SoundState, { label: string; pressed: boolean; title: string }> = {
  off: { label: 'Sound off', pressed: false, title: 'Turn sound on' },
  armed: { label: 'Sound on', pressed: true, title: 'Sound starts with your first rev' },
  loading: { label: 'Sound on', pressed: true, title: 'Loading the sound' },
  on: { label: 'Sound on', pressed: true, title: 'Turn sound off' },
};

function isOtherControl(el: Element | null, own: Element): boolean {
  if (!el || el === own || el === document.body || el === document.documentElement) return false;
  return true;
}

export class Controls {
  /** True while the visitor holds the throttle (button, Space or Enter). */
  held = false;
  /** Called when the visitor asks for the pit stop. */
  onPitStop: (() => void) | undefined;
  /** Called when the visitor clicks the speaker button. */
  onSound: (() => void) | undefined;
  /** Called, still inside the key or pointer event, when a hold starts or the round button is clicked. */
  onPress: (() => void) | undefined;

  private mode: ControlMode = 'rev';
  private inStage = false;
  private pointerId = -1;
  private spaceDown = false;
  private enterDown = false;
  /** A hold was down when the tyres popped: the click its release produces is not a "Pit stop" click. */
  private swallowClick = false;
  /** Clicks before this time (performance.now) are that same release; a touch tap's click can arrive late. */
  private swallowUntil = 0;
  /** Space presses before this time are ignored in "Pit stop" mode: a reflex second tap right after the pop. */
  private pitKeyFrom = 0;
  private hintGone = false;
  private ringStep = -1;
  private timerCentis = -1;
  private timerOn = false;

  private readonly root: HTMLDivElement;
  private readonly style: HTMLStyleElement;
  private readonly button: HTMLButtonElement;
  private readonly soundButton: HTMLButtonElement;
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
      '<button class="rev__sound is-off" type="button" aria-pressed="false" aria-label="Sound off" title="Turn sound on">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<path d="M3.5 9.2v5.6h3.9l5 4.1V5.1l-5 4.1z" fill="currentColor"/>' +
      '<path class="rev__waves" d="M15.6 8.6a4.8 4.8 0 0 1 0 6.8M18.2 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
      '<path class="rev__mute" d="M16 9.4l5.2 5.2m0-5.2L16 14.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
      '</svg></button>' +
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
    this.soundButton = pick<HTMLButtonElement>('.rev__sound');
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
    b.addEventListener('blur', this.onButtonBlur);
    this.soundButton.addEventListener('click', this.onSoundClick);
    this.soundButton.addEventListener('pointerdown', this.onSoundPointerDown);
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
      if (document.activeElement === this.soundButton) this.soundButton.blur();
    }
    this.root.hidden = !on;
  }

  setMode(mode: ControlMode): void {
    if (mode === this.mode) return;
    // a hold that is still down when the tyres pop must not count as a click on "Pit stop"
    if (mode !== 'rev' && this.held) this.swallowClick = true;
    if (mode === 'pit') this.pitKeyFrom = performance.now() + PIT_KEY_DELAY_MS;
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

  /** Shows the speaker button as off, on, loading, or on-but-waiting-for-a-press. */
  setSound(state: SoundState): void {
    const b = this.soundButton;
    const look = SOUND[state];
    b.classList.toggle('is-off', state === 'off');
    b.classList.toggle('is-on', state === 'on');
    b.classList.toggle('is-loading', state === 'loading');
    b.setAttribute('aria-label', look.label);
    b.setAttribute('aria-pressed', look.pressed ? 'true' : 'false');
    b.title = look.title;
    if (state === 'loading') b.setAttribute('aria-busy', 'true');
    else b.removeAttribute('aria-busy');
    if (state !== 'loading') b.style.removeProperty('--sound-load');
  }

  /** How much of the sound has arrived, 0 to 1 (the ring around the speaker while it loads). */
  setSoundProgress(fraction: number): void {
    this.soundButton.style.setProperty('--sound-load', Math.min(1, Math.max(0, fraction)).toFixed(3));
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
    if (held) this.onPress?.();
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
    // a second finger must not take the hold over from the first
    if (this.pointerId !== -1) return;
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
   * Any pointer or key going up ends the hold that was down during the pop. The click such a release
   * produces follows at once for a mouse and a moment later for a touch tap, so it is ignored for a
   * short while instead of until the next timer tick.
   */
  private readonly onAnyRelease = (): void => {
    if (!this.swallowClick) return;
    this.swallowClick = false;
    this.swallowUntil = performance.now() + SWALLOW_MS;
  };

  private readonly onClick = (): void => {
    if (this.swallowClick || performance.now() < this.swallowUntil) return;
    this.onPress?.();
    if (this.mode === 'pit' && this.inStage) this.onPitStop?.();
  };

  private readonly onSoundClick = (e: MouseEvent): void => {
    this.onSound?.();
    // A mouse or touch click must not leave the focus here, or the next press of Space would switch
    // the sound instead of revving. A click made with the keyboard (detail 0) keeps its focus.
    if (e.detail > 0) this.soundButton.blur();
  };

  private readonly onSoundPointerDown = (e: PointerEvent): void => {
    // like the round button: a press here is not a camera drag
    e.stopPropagation();
  };

  private readonly onContextMenu = (e: Event): void => {
    // a long press on a touch screen is a hold, not a request for the menu
    e.preventDefault();
  };

  private readonly onButtonKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== 'Enter') return;
    if (this.mode !== 'rev') {
      // a key still held from before the pop repeats, and every repeat would be a click on "Pit stop"
      if (e.repeat) e.preventDefault();
      return;
    }
    // in rev mode Enter is a hold, not a click
    e.preventDefault();
    if (e.repeat) return;
    this.enterDown = true;
    this.sync();
  };

  /** Enter is only a hold while the button has focus; its key-up may land somewhere else. */
  private readonly onButtonBlur = (): void => {
    if (!this.enterDown) return;
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
    if (e.repeat || this.mode !== 'pit' || performance.now() < this.pitKeyFrom) return;
    this.onPitStop?.();
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.onAnyRelease();
    if (e.key === 'Enter' && this.enterDown) {
      this.enterDown = false;
      this.sync();
      return;
    }
    if (e.code !== 'Space' && e.key !== ' ') return;
    if (!this.spaceDown) return;
    this.spaceDown = false;
    this.sync();
  };
}
