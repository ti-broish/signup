import { describe, it, expect } from 'vitest';
import { generateReferralCode, getReferralFromUrl } from './referral';

describe('generateReferralCode', () => {
  const ALLOWED_CHARS = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const AMBIGUOUS_CHARS = ['0', 'O', 'I', 'l'];

  it('should return a string of exactly 6 characters', () => {
    expect(generateReferralCode()).toHaveLength(6);
  });

  it('should only contain allowed characters and no ambiguous ones', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateReferralCode();
      for (const char of code) {
        expect(ALLOWED_CHARS).toContain(char);
      }
      for (const char of AMBIGUOUS_CHARS) {
        expect(code).not.toContain(char);
      }
    }
  });

  it('should generate different codes on successive calls', () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateReferralCode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});

describe('getReferralFromUrl', () => {
  function setSearch(search: string) {
    Object.defineProperty(window, 'location', { value: { search }, writable: true });
  }

  it.each([
    { search: '?ref=ABC123', expected: 'ABC123', desc: 'returns ref value' },
    { search: '?foo=bar&ref=XYZ789&baz=qux', expected: 'XYZ789', desc: 'extracts ref among multiple params' },
    { search: '', expected: null, desc: 'returns null when no params' },
    { search: '?ref=', expected: null, desc: 'returns null for empty ref' },
    { search: '?foo=bar&baz=qux', expected: null, desc: 'returns null when ref is absent' },
  ])('$desc (search=$search)', ({ search, expected }) => {
    setSearch(search);
    expect(getReferralFromUrl()).toBe(expected);
  });
});
