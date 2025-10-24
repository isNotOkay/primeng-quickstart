import { createAnchorId } from '../../utils/dom.util';

describe('DOM Utils', () => {
  describe('createAnchorId', () => {
    it('should create anchor id from simple string', () => {
      expect(createAnchorId('test')).toBe('list-item-test');
    });

    it('should replace pipe characters with underscores', () => {
      expect(createAnchorId('Table|Orders')).toBe('list-item-Table_Orders');
    });

    it('should replace multiple special characters', () => {
      expect(createAnchorId('test@example.com')).toBe('list-item-test_example_com');
    });

    it('should preserve alphanumeric characters', () => {
      expect(createAnchorId('test123ABC')).toBe('list-item-test123ABC');
    });

    it('should preserve hyphens', () => {
      expect(createAnchorId('test-value')).toBe('list-item-test-value');
    });

    it('should preserve underscores', () => {
      expect(createAnchorId('test_value')).toBe('list-item-test_value');
    });

    it('should replace spaces with underscores', () => {
      expect(createAnchorId('hello world')).toBe('list-item-hello_world');
    });

    it('should replace dots with underscores', () => {
      expect(createAnchorId('file.txt')).toBe('list-item-file_txt');
    });

    it('should replace slashes with underscores', () => {
      expect(createAnchorId('path/to/file')).toBe('list-item-path_to_file');
    });

    it('should handle null by returning null', () => {
      expect(createAnchorId(null)).toBe(null);
    });

    it('should handle undefined by returning null', () => {
      expect(createAnchorId(undefined)).toBe(null);
    });

    it('should handle empty string', () => {
      expect(createAnchorId('')).toBe(null);
    });

    it('should handle string with only special characters', () => {
      expect(createAnchorId('@#$%^&*()')).toBe('list-item-_________');
    });

    it('should handle complex relation keys', () => {
      expect(createAnchorId('View|CustomerSummary')).toBe('list-item-View_CustomerSummary');
    });
  });
});
