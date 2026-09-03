import { describe, it, expect } from 'vitest';
import { fmt, fmtPct, fmtTime, fmtDuration } from '../../src/core/format.ts';

describe('fmt', () => {
  it('formats below 1000 as integers', () => {
    expect(fmt(0)).toBe('0');
    expect(fmt(7)).toBe('7');
    expect(fmt(999)).toBe('999');
  });

  it('formats the named suffix tiers', () => {
    expect(fmt(1000)).toBe('1K');
    expect(fmt(1234)).toBe('1.23K');
    expect(fmt(12_345)).toBe('12.3K');
    expect(fmt(123_456)).toBe('123K');
    expect(fmt(45.8e6)).toBe('45.8M');
    expect(fmt(1e9)).toBe('1B');
    expect(fmt(1e12)).toBe('1T');
    expect(fmt(1e15)).toBe('1Qa');
    expect(fmt(1e18)).toBe('1Qi');
    expect(fmt(1e21)).toBe('1Sx');
    expect(fmt(1e24)).toBe('1Sp');
    expect(fmt(1e27)).toBe('1Oc');
    expect(fmt(1e30)).toBe('1No');
    expect(fmt(1e33)).toBe('1Dc');
  });

  it('rolls into alphabetic suffixes past Dc', () => {
    expect(fmt(1e36)).toBe('1aa');
    expect(fmt(1e39)).toBe('1ab');
    expect(fmt(1e111)).toBe('1az');
    expect(fmt(1e114)).toBe('1ba');
    expect(fmt(Number.MAX_VALUE * 10)).toBe('∞'); // overflow still never prints NaN
  });

  it('handles negatives and non-finite input', () => {
    expect(fmt(-5)).toBe('-5');
    expect(fmt(-1500)).toBe('-1.5K');
    expect(fmt(Infinity)).toBe('∞');
    expect(fmt(NaN)).toBe('0');
  });

  it('never produces a trailing .0 or NaN across a wide sweep', () => {
    for (let e = 0; e < 250; e++) {
      for (const m of [1, 1.5, 3.333, 9.999]) {
        const s = fmt(m * Math.pow(10, e));
        expect(s).not.toContain('NaN');
        expect(s).not.toContain('undefined');
        expect(s.endsWith('.0')).toBe(false);
      }
    }
  });
});

describe('time helpers', () => {
  it('fmtPct', () => {
    expect(fmtPct(0.125, 1)).toBe('12.5%');
    expect(fmtPct(1)).toBe('100%');
  });

  it('fmtTime', () => {
    expect(fmtTime(0)).toBe('0:00');
    expect(fmtTime(187)).toBe('3:07');
    expect(fmtTime(3764)).toBe('1:02:44');
  });

  it('fmtDuration', () => {
    expect(fmtDuration(45)).toBe('45s');
    expect(fmtDuration(600)).toBe('10min');
    expect(fmtDuration(22_320)).toBe('6h 12min');
  });
});
