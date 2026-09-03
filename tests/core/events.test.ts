import { describe, it, expect, vi } from 'vitest';
import { EventBus, EV } from '../../src/core/events.ts';

describe('EventBus', () => {
  it('delivers three numeric args to every listener', () => {
    const bus = new EventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.on(EV.EnemyKilled, a);
    bus.on(EV.EnemyKilled, b);
    bus.emit(EV.EnemyKilled, 1, 2, 3);
    expect(a).toHaveBeenCalledWith(1, 2, 3);
    expect(b).toHaveBeenCalledWith(1, 2, 3);
  });

  it('defaults missing args to 0', () => {
    const bus = new EventBus();
    const fn = vi.fn();
    bus.on(EV.LevelUp, fn);
    bus.emit(EV.LevelUp);
    expect(fn).toHaveBeenCalledWith(0, 0, 0);
  });

  it('does not deliver to other event types', () => {
    const bus = new EventBus();
    const fn = vi.fn();
    bus.on(EV.WaveStart, fn);
    bus.emit(EV.WaveEnd);
    expect(fn).not.toHaveBeenCalled();
  });

  it('off() removes a listener', () => {
    const bus = new EventBus();
    const fn = vi.fn();
    bus.on(EV.GoldChanged, fn);
    bus.off(EV.GoldChanged, fn);
    bus.emit(EV.GoldChanged, 5);
    expect(fn).not.toHaveBeenCalled();
  });

  it('off() during dispatch is deferred, not a mid-iteration splice', () => {
    const bus = new EventBus();
    const second = vi.fn();
    const first = vi.fn(() => bus.off(EV.Sfx, second));
    bus.on(EV.Sfx, first);
    bus.on(EV.Sfx, second);
    bus.emit(EV.Sfx);
    expect(second).toHaveBeenCalledTimes(1); // still ran this dispatch
    bus.emit(EV.Sfx);
    expect(second).toHaveBeenCalledTimes(1); // removed by the next one
  });

  it('clear() drops everything', () => {
    const bus = new EventBus();
    const fn = vi.fn();
    bus.on(EV.RunEnded, fn);
    bus.clear();
    bus.emit(EV.RunEnded);
    expect(fn).not.toHaveBeenCalled();
  });
});
