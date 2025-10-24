import { isListOptionDisabled, rowTrackByFn, isNumber } from './list.util';

describe('List Utils', () => {
  describe('isListOptionDisabled', () => {
    it('should return true when disabled is true', () => {
      expect(isListOptionDisabled({ disabled: true })).toBe(true);
    });

    it('should return true when __placeholder is true', () => {
      expect(isListOptionDisabled({ __placeholder: true })).toBe(true);
    });

    it('should return true when both disabled and __placeholder are true', () => {
      expect(isListOptionDisabled({ disabled: true, __placeholder: true })).toBe(true);
    });

    it('should return false when both disabled and __placeholder are false', () => {
      expect(isListOptionDisabled({ disabled: false, __placeholder: false })).toBe(false);
    });

    it('should return false when option is empty object', () => {
      expect(isListOptionDisabled({})).toBe(false);
    });

    it('should return false when option is null', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(isListOptionDisabled(null as any)).toBe(false);
    });

    it('should return false when option is undefined', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(isListOptionDisabled(undefined as any)).toBe(false);
    });
  });

  describe('rowTrackByFn', () => {
    it('should return id property when present', () => {
      const row = { id: 123, name: 'test' };
      expect(rowTrackByFn(0, row)).toBe(123);
    });

    it('should return Id property when id is not present', () => {
      const row = { Id: 456, name: 'test' };
      expect(rowTrackByFn(0, row)).toBe(456);
    });

    it('should return ID property when id and Id are not present', () => {
      const row = { ID: 789, name: 'test' };
      expect(rowTrackByFn(0, row)).toBe(789);
    });

    it('should return index when no id properties are present', () => {
      const row = { name: 'test' };
      expect(rowTrackByFn(5, row)).toBe(5);
    });

    it('should prefer id over Id', () => {
      const row = { id: 123, Id: 456 };
      expect(rowTrackByFn(0, row)).toBe(123);
    });

    it('should prefer Id over ID', () => {
      const row = { Id: 456, ID: 789 };
      expect(rowTrackByFn(0, row)).toBe(456);
    });

    it('should return index when row is null', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(rowTrackByFn(3, null as any)).toBe(3);
    });

    it('should return index when row is undefined', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(rowTrackByFn(7, undefined as any)).toBe(7);
    });

    it('should handle id with value 0', () => {
      const row = { id: 0 };
      expect(rowTrackByFn(5, row)).toBe(0);
    });
  });

  describe('isNumber', () => {
    it('should return true for positive numbers', () => {
      expect(isNumber(42)).toBe(true);
      expect(isNumber(3.14)).toBe(true);
    });

    it('should return true for negative numbers', () => {
      expect(isNumber(-42)).toBe(true);
      expect(isNumber(-3.14)).toBe(true);
    });

    it('should return true for zero', () => {
      expect(isNumber(0)).toBe(true);
    });

    it('should return true for NaN (as it is of type number)', () => {
      expect(isNumber(NaN)).toBe(true);
    });

    it('should return true for Infinity', () => {
      expect(isNumber(Infinity)).toBe(true);
      expect(isNumber(-Infinity)).toBe(true);
    });

    it('should return false for strings', () => {
      expect(isNumber('42')).toBe(false);
      expect(isNumber('hello')).toBe(false);
    });

    it('should return false for null', () => {
      expect(isNumber(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isNumber(undefined)).toBe(false);
    });

    it('should return false for objects', () => {
      expect(isNumber({})).toBe(false);
      expect(isNumber({ value: 42 })).toBe(false);
    });

    it('should return false for arrays', () => {
      expect(isNumber([])).toBe(false);
      expect(isNumber([42])).toBe(false);
    });

    it('should return false for boolean', () => {
      expect(isNumber(true)).toBe(false);
      expect(isNumber(false)).toBe(false);
    });
  });
});
