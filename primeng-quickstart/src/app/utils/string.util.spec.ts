import { normalizeString } from './string.util';

describe('String Utils', () => {
  describe('normalizeString', () => {
    it('should convert uppercase to lowercase', () => {
      expect(normalizeString('HELLO')).toBe('hello');
      expect(normalizeString('TeSt')).toBe('test');
    });

    it('should remove diacritics from characters', () => {
      expect(normalizeString('café')).toBe('cafe');
      expect(normalizeString('naïve')).toBe('naive');
      expect(normalizeString('résumé')).toBe('resume');
    });

    it('should handle German umlauts', () => {
      expect(normalizeString('Müller')).toBe('muller');
      expect(normalizeString('Öl')).toBe('ol');
    });

    it('should handle Spanish characters', () => {
      expect(normalizeString('niño')).toBe('nino');
      expect(normalizeString('señor')).toBe('senor');
    });

    it('should handle French accents', () => {
      expect(normalizeString('français')).toBe('francais');
      expect(normalizeString('École')).toBe('ecole');
    });

    it('should handle empty string', () => {
      expect(normalizeString('')).toBe('');
    });

    it('should handle null by treating it as empty string', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(normalizeString(null as any)).toBe('');
    });

    it('should handle undefined by treating it as empty string', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(normalizeString(undefined as any)).toBe('');
    });

    it('should handle strings with mixed content', () => {
      expect(normalizeString('Hello Wörld! 123')).toBe('hello world! 123');
    });

    it('should handle already normalized strings', () => {
      expect(normalizeString('test')).toBe('test');
      expect(normalizeString('hello world')).toBe('hello world');
    });

    it('should preserve spaces and special characters', () => {
      expect(normalizeString('Hello World!')).toBe('hello world!');
      expect(normalizeString('test@example.com')).toBe('test@example.com');
    });
  });
});
