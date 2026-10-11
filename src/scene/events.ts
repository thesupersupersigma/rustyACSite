// A minimal event emitter for the burnout events (task 03 hangs the sound on these).
import type { SimEvent, SimEventType } from './sim';

export type BurnoutEvent = SimEvent;
export type BurnoutEventType = SimEventType;
/** The event object is reused for the next event: read it, do not keep it. */
export type BurnoutListener = (event: BurnoutEvent) => void;

export interface BurnoutEvents {
  /** Listens for one kind of event, or for all of them with `'*'`. Returns a function that removes the listener. */
  on(type: BurnoutEventType | '*', listener: BurnoutListener): () => void;
  off(type: BurnoutEventType | '*', listener: BurnoutListener): void;
}

export class Emitter implements BurnoutEvents {
  private readonly listeners = new Map<string, BurnoutListener[]>();

  // on() and off() replace the list instead of changing it, so a listener may remove itself (or add
  // another) while an event is being delivered without upsetting that delivery.
  on(type: BurnoutEventType | '*', listener: BurnoutListener): () => void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
    return () => this.off(type, listener);
  }

  off(type: BurnoutEventType | '*', listener: BurnoutListener): void {
    const list = this.listeners.get(type);
    if (!list) return;
    const i = list.indexOf(listener);
    if (i >= 0) this.listeners.set(type, [...list.slice(0, i), ...list.slice(i + 1)]);
  }

  emit(event: BurnoutEvent): void {
    this.dispatch(this.listeners.get(event.type), event);
    this.dispatch(this.listeners.get('*'), event);
  }

  clear(): void {
    this.listeners.clear();
  }

  private dispatch(list: BurnoutListener[] | undefined, event: BurnoutEvent): void {
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      try {
        list[i]?.(event);
      } catch (err) {
        console.error(`[f2004] a "${event.type}" listener threw`, err);
      }
    }
  }
}
