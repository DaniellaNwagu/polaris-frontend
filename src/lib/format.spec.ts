import { describe, it, expect } from 'vitest';
import { stroopsToXlm } from './format';

describe('stroopsToXlm', () => {
  it('formats zero', () => {
    expect(stroopsToXlm(0n)).toBe('0.00');
  });

  it('formats whole amounts', () => {
    expect(stroopsToXlm(10_000_000n)).toBe('1.00');
  });

  it('formats fractional amounts', () => {
    expect(stroopsToXlm(12_345_678n)).toBe('1.23');
  });

  it('pads small fractions', () => {
    expect(stroopsToXlm(1n)).toBe('0.00');
  });

  it('respects fractionDigits', () => {
    expect(stroopsToXlm(12_345_678n, 4)).toBe('1.2345');
  });

  it('formats negative whole amounts', () => {
    expect(stroopsToXlm(-10_000_000n)).toBe('-1.00');
  });

  it('formats negative fractional amounts', () => {
    expect(stroopsToXlm(-12_345_678n)).toBe('-1.23');
  });

  it('formats small negative amounts', () => {
    expect(stroopsToXlm(-1n)).toBe('0.00');
  });

  it('respects fractionDigits for negative amounts', () => {
    expect(stroopsToXlm(-12_345_678n, 4)).toBe('-1.2345');
  });
});
