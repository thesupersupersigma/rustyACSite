// The `?debug=1` overlay: FPS, frame time, tier, pixel ratio, draw calls and triangles, plus the
// burnout's state (revs, throttle, heat, smoke).
import type { WebGLRenderer } from 'three';
import type { Tier } from './types';

export class DebugOverlay {
  private readonly el: HTMLPreElement;
  private frames = 0;
  private elapsed = 0;
  private worst = 0;

  constructor(parent: HTMLElement) {
    const el = document.createElement('pre');
    el.setAttribute('data-scene-debug', '');
    Object.assign(el.style, {
      position: 'absolute',
      top: '72px',
      right: '16px',
      margin: '0',
      padding: '10px 12px',
      background: 'rgb(14 14 14 / 0.78)',
      border: '1px solid #2a2a2a',
      borderRadius: '8px',
      color: '#f5f5f5',
      font: "12px/1.5 'JetBrains Mono', ui-monospace, monospace",
      pointerEvents: 'none',
      zIndex: '3',
      whiteSpace: 'pre',
    });
    parent.appendChild(el);
    this.el = el;
  }

  /** Call once per rendered frame; the text refreshes about four times a second. */
  frame(dtMs: number, renderer: WebGLRenderer, tier: Tier, dpr: number, p: number, extra?: { debugText(): string }): void {
    this.frames++;
    this.elapsed += dtMs;
    if (dtMs > this.worst) this.worst = dtMs;
    if (this.elapsed < 250) return;

    const ms = this.elapsed / this.frames;
    const { calls, triangles } = renderer.info.render;
    this.el.textContent =
      `fps    ${(1000 / ms).toFixed(0)}\n` +
      `frame  ${ms.toFixed(1)} ms (worst ${this.worst.toFixed(0)})\n` +
      `tier   ${tier}\n` +
      `dpr    ${dpr.toFixed(2)}\n` +
      `calls  ${calls}\n` +
      `tris   ${triangles.toLocaleString('en-US')}\n` +
      `p      ${p.toFixed(3)}` +
      (extra ? `\n${extra.debugText()}` : '');
    this.frames = 0;
    this.elapsed = 0;
    this.worst = 0;
  }

  dispose(): void {
    this.el.remove();
  }
}
