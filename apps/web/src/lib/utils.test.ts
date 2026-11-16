import { describe, expect, it } from 'vitest';
import { cn, formatDuration, formatRelativeTime } from './utils';

describe('cn', () => {
  it('resolves conflicting Tailwind classes', () => {
    const hidden: boolean = false;
    expect(cn('px-2', hidden && 'hidden', 'px-4')).toBe('px-4');
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '0s'],
    [59, '59s'],
    [125, '2m 5s'],
    [3_720, '1h 2m'],
    [90_000, '1d 1h'],
  ])('%i seconds → %s', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });
});

describe('formatRelativeTime', () => {
  const now = 1_000_000_000;
  it('describes recent timestamps relatively', () => {
    expect(formatRelativeTime(now - 2_000, now)).toBe('just now');
    expect(formatRelativeTime(now - 45_000, now)).toBe('45s ago');
    expect(formatRelativeTime(now - 5 * 60_000, now)).toBe('5m ago');
    expect(formatRelativeTime(now - 3 * 3_600_000, now)).toBe('3h ago');
  });
});
