/** Number formatting for the HUD (SPEC §22). Never called from the hot loop. */

const SUFFIXES = [
  '',
  'K',
  'M',
  'B',
  'T',
  'Qa',
  'Qi',
  'Sx',
  'Sp',
  'Oc',
  'No',
  'Dc',
] as const;

const ALPHA = 'abcdefghijklmnopqrstuvwxyz';

/** Suffix for tier `t` (t=0 → ''), rolling into aa, ab, … past the named list. */
function suffixFor(tier: number): string {
  const named = SUFFIXES[tier];
  if (named !== undefined) return named;
  // Past Dc: aa..zz, then aaa..zzz. Two letters already reach ~1e2060.
  const n = tier - SUFFIXES.length;
  let len = 2;
  let capacity = 26 * 26;
  let base = 0;
  while (n >= base + capacity) {
    base += capacity;
    len++;
    capacity *= 26;
  }
  let idx = n - base;
  let out = '';
  for (let i = 0; i < len; i++) {
    out = (ALPHA[idx % 26] ?? '?') + out;
    idx = Math.floor(idx / 26);
  }
  return out;
}

/**
 * Abbreviates a number for display: 1234 → "1.2K", 45.8e6 → "45.8M".
 * Keeps 3 significant-ish digits, drops trailing ".0".
 */
export function fmt(value: number): string {
  if (!Number.isFinite(value)) return value > 0 ? '∞' : Number.isNaN(value) ? '0' : '-∞';
  const neg = value < 0;
  const v = neg ? -value : value;
  const sign = neg ? '-' : '';
  if (v < 1000) return sign + trim(v < 10 && !Number.isInteger(v) ? v.toFixed(1) : v.toFixed(0));

  // Derived from log10 rather than by repeated division: dividing by 1000 in a
  // loop drifts, and 1e33 would print as "1000No" instead of "1Dc".
  let tier = Math.floor(Math.log10(v) / 3);
  let m = v / Math.pow(1000, tier);
  // Rounding can push the mantissa to 1000 (999.7 → "1000"); carry into the next tier.
  if (m >= 999.5) {
    tier++;
    m = v / Math.pow(1000, tier);
  }
  const s = m < 10 ? m.toFixed(2) : m < 100 ? m.toFixed(1) : m.toFixed(0);
  return sign + trim(s) + suffixFor(tier);
}

/** Drops the fractional tail of a fixed-decimal string: "1.50" → "1.5", "2.0" → "2". */
function trim(s: string): string {
  if (!s.includes('.')) return s;
  return s.replace(/0+$/, '').replace(/\.$/, '');
}

/** Fixed-decimal formatting for rates and percentages. */
export function fmtFixed(value: number, digits: number): string {
  if (!Number.isFinite(value)) return '0';
  return value.toFixed(digits);
}

/** 0.125 → "12.5%" */
export function fmtPct(value: number, digits = 0): string {
  return (value * 100).toFixed(digits) + '%';
}

/** Seconds → "3:07" or "1:02:44". */
export function fmtTime(totalSeconds: number): string {
  const t = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const ss = s < 10 ? '0' + s : String(s);
  if (h > 0) {
    const mm = m < 10 ? '0' + m : String(m);
    return `${h}:${mm}:${ss}`;
  }
  return `${m}:${ss}`;
}

/** Milliseconds → "6h 12min", for the offline-return screen. */
export function fmtDuration(seconds: number): string {
  const t = Math.max(0, Math.floor(seconds));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  if (m > 0) return `${m}min`;
  return `${t}s`;
}
