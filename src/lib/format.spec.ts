import { describe, expect, it } from 'vitest';
import { formatStroops, isDisplayCurrency } from './format';

describe('formatStroops', () => {
  it('defaults to XLM', () => {
    expect(formatStroops('123456789')).toBe('12.34 XLM');
  });

  it('formats stroops with thousands separators', () => {
    expect(formatStroops('123456789', 'stroops')).toBe('123,456,789 stroops');
    expect(formatStroops(5n, 'stroops')).toBe('5 stroops');
  });

  it('converts to a USD estimate at the given XLM price in cents', () => {
    // 10 XLM at 25 cents each = $2.50
    expect(formatStroops('100000000', 'usd', 25)).toBe('≈ $2.50');
  });

  it('falls back to XLM when the USD rate is missing or invalid', () => {
    expect(formatStroops('100000000', 'usd')).toBe('10.00 XLM');
    expect(formatStroops('100000000', 'usd', null)).toBe('10.00 XLM');
    expect(formatStroops('100000000', 'usd', 0)).toBe('10.00 XLM');
    expect(formatStroops('100000000', 'usd', Number.NaN)).toBe('10.00 XLM');
  });

  it('accepts bigint and string input alike', () => {
    expect(formatStroops(100000000n, 'xlm')).toBe(formatStroops('100000000', 'xlm'));
  });
});

describe('isDisplayCurrency', () => {
  it('accepts only the three supported currencies', () => {
    expect(isDisplayCurrency('stroops')).toBe(true);
    expect(isDisplayCurrency('xlm')).toBe(true);
    expect(isDisplayCurrency('usd')).toBe(true);
    expect(isDisplayCurrency('eur')).toBe(false);
    expect(isDisplayCurrency(null)).toBe(false);
  });
});
