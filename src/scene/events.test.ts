import { describe, expect, it } from 'vitest';
import { Emitter } from './events';
import type { SimEvent } from './sim';

const pop: SimEvent = { type: 'pop', wheel: null };
const nut: SimEvent = { type: 'nut:off', wheel: 'RL' };

describe('Emitter', () => {
  it('delivers to the listeners of that type and to "*"', () => {
    const emitter = new Emitter();
    const seen: string[] = [];
    emitter.on('pop', (e) => seen.push(`pop:${e.type}`));
    emitter.on('*', (e) => seen.push(`any:${e.type}:${e.wheel}`));
    emitter.emit(pop);
    emitter.emit(nut);
    expect(seen).toEqual(['pop:pop', 'any:pop:null', 'any:nut:off:RL']);
  });

  it('stops delivering after the returned function or off()', () => {
    const emitter = new Emitter();
    let count = 0;
    const listener = () => count++;
    const remove = emitter.on('pop', listener);
    emitter.emit(pop);
    remove();
    emitter.emit(pop);
    emitter.on('pop', listener);
    emitter.off('pop', listener);
    emitter.emit(pop);
    expect(count).toBe(1);
  });

  it('lets a listener remove itself without the next one missing the event', () => {
    const emitter = new Emitter();
    const seen: string[] = [];
    const remove = emitter.on('pop', () => {
      seen.push('once');
      remove();
    });
    emitter.on('pop', () => seen.push('always'));
    emitter.emit(pop);
    emitter.emit(pop);
    expect(seen).toEqual(['once', 'always', 'always']);
  });

  it('keeps going when a listener throws', () => {
    const emitter = new Emitter();
    const seen: string[] = [];
    const error = console.error;
    console.error = () => {};
    try {
      emitter.on('pop', () => {
        throw new Error('boom');
      });
      emitter.on('pop', () => seen.push('second'));
      emitter.emit(pop);
    } finally {
      console.error = error;
    }
    expect(seen).toEqual(['second']);
  });
});
