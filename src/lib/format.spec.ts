import { describe, expect, it } from 'vitest';
import { xlmToStroops } from './format';

describe('xlmToStroops', () => {
  it.each([
    ['10', 100_000_000n],
    ['10.5', 105_000_000n],
    ['.5', 5_000_000n],
    ['0.0000001', 1n],
    [' 1 ', 10_000_000n],
  ])('converts %j', (input, expected) => {
    expect(xlmToStroops(input)).toBe(expected);
  });

  it.each(['10.123456789', '.12345678'])('rejects excess precision in %j', (input) => {
    expect(() => xlmToStroops(input)).toThrow('XLM supports at most 7 decimal places');
  });

  it.each(['', '.', '10.', '1,000', '-1', 'abc'])('rejects %j', (input) => {
    expect(() => xlmToStroops(input)).toThrow('Enter a valid amount');
  });
});
