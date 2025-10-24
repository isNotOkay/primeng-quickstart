import { extractFilenameFromContentDisposition, downloadBlobAsFile } from '../utils/file.util';

describe('File Utils', () => {
  describe('extractFilenameFromContentDisposition', () => {
    it('should extract filename from RFC 5987 format', () => {
      const header = "attachment; filename*=UTF-8''test%20file.pdf";
      expect(extractFilenameFromContentDisposition(header)).toBe('test file.pdf');
    });

    it('should extract filename from quoted format', () => {
      const header = 'attachment; filename="document.pdf"';
      expect(extractFilenameFromContentDisposition(header)).toBe('document.pdf');
    });

    it('should extract filename from unquoted format', () => {
      const header = 'attachment; filename=report.xlsx';
      expect(extractFilenameFromContentDisposition(header)).toBe('report.xlsx');
    });

    it('should handle RFC 5987 with special characters', () => {
      const header = "attachment; filename*=UTF-8''%C3%BCber%20file.pdf";
      expect(extractFilenameFromContentDisposition(header)).toBe('über file.pdf');
    });

    it('should prefer RFC 5987 over quoted filename', () => {
      const header = 'attachment; filename="fallback.pdf"; filename*=UTF-8\'\'primary.pdf';
      expect(extractFilenameFromContentDisposition(header)).toBe('primary.pdf');
    });

    it('should return null for null input', () => {
      expect(extractFilenameFromContentDisposition(null)).toBe(null);
    });

    it('should return null for undefined input', () => {
      expect(extractFilenameFromContentDisposition(undefined)).toBe(null);
    });

    it('should return null for empty string', () => {
      expect(extractFilenameFromContentDisposition('')).toBe(null);
    });

    it('should return null when no filename is present', () => {
      const header = 'attachment';
      expect(extractFilenameFromContentDisposition(header)).toBe(null);
    });

    it('should handle filename with semicolons', () => {
      const header = 'attachment; filename="file;name.pdf"';
      expect(extractFilenameFromContentDisposition(header)).toBe('file;name.pdf');
    });

    it('should trim whitespace from unquoted filename', () => {
      const header = 'attachment; filename=  report.xlsx  ; other-param=value';
      expect(extractFilenameFromContentDisposition(header)).toBe('report.xlsx');
    });

    it('should handle case-insensitive filename parameter', () => {
      const header = 'attachment; FILENAME="document.pdf"';
      expect(extractFilenameFromContentDisposition(header)).toBe('document.pdf');
    });

    it('should handle case-insensitive RFC 5987 parameter', () => {
      const header = "attachment; FILENAME*=UTF-8''test.pdf";
      expect(extractFilenameFromContentDisposition(header)).toBe('test.pdf');
    });

    it('should return filename as-is if decodeURIComponent fails', () => {
      const header = "attachment; filename*=UTF-8''%E0%A4%A";
      const result = extractFilenameFromContentDisposition(header);
      expect(result).toBe('%E0%A4%A');
    });

    it('should handle inline disposition', () => {
      const header = 'inline; filename="image.jpg"';
      expect(extractFilenameFromContentDisposition(header)).toBe('image.jpg');
    });
  });

  describe('downloadBlobAsFile', () => {
    let originalCreateObjectURL: typeof URL.createObjectURL;
    let originalRevokeObjectURL: typeof URL.revokeObjectURL;
    let mockAnchor: HTMLAnchorElement;
    let createdURL: string;

    beforeEach(() => {
      // Save original functions
      originalCreateObjectURL = URL.createObjectURL;
      originalRevokeObjectURL = URL.revokeObjectURL;

      // Setup mocks
      createdURL = '';

      mockAnchor = {
        href: '',
        download: '',
        click: jasmine.createSpy('click'),
        remove: jasmine.createSpy('remove'),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      spyOn(document, 'createElement').and.returnValue(mockAnchor);
      spyOn(document.body, 'appendChild');

      URL.createObjectURL = jasmine.createSpy('createObjectURL').and.callFake(() => {
        createdURL = 'blob:mock-url';
        return createdURL;
      });

      URL.revokeObjectURL = jasmine.createSpy('revokeObjectURL');
    });

    afterEach(() => {
      // Restore original functions
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
    });

    it('should create object URL from blob', () => {
      const blob = new Blob(['test content'], { type: 'text/plain' });
      downloadBlobAsFile(blob, 'test.txt');

      expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    });

    it('should create anchor element with correct attributes', () => {
      const blob = new Blob(['test'], { type: 'text/plain' });
      downloadBlobAsFile(blob, 'document.pdf');

      expect(document.createElement).toHaveBeenCalledWith('a');
      expect(mockAnchor.href).toBe('blob:mock-url');
      expect(mockAnchor.download).toBe('document.pdf');
    });

    it('should append anchor to body', () => {
      const blob = new Blob(['test'], { type: 'text/plain' });
      downloadBlobAsFile(blob, 'test.txt');

      expect(document.body.appendChild).toHaveBeenCalledWith(mockAnchor);
    });

    it('should click anchor to trigger download', () => {
      const blob = new Blob(['test'], { type: 'text/plain' });
      downloadBlobAsFile(blob, 'test.txt');

      expect(mockAnchor.click).toHaveBeenCalled();
    });

    it('should remove anchor after clicking', () => {
      const blob = new Blob(['test'], { type: 'text/plain' });
      downloadBlobAsFile(blob, 'test.txt');

      expect(mockAnchor.remove).toHaveBeenCalled();
    });

    it('should revoke object URL after download', () => {
      const blob = new Blob(['test'], { type: 'text/plain' });
      downloadBlobAsFile(blob, 'test.txt');

      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    });

    it('should handle different blob types', () => {
      const blob = new Blob(['{"key": "value"}'], { type: 'application/json' });
      downloadBlobAsFile(blob, 'data.json');

      expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
      expect(mockAnchor.download).toBe('data.json');
    });

    it('should handle filename with special characters', () => {
      const blob = new Blob(['test'], { type: 'text/plain' });
      downloadBlobAsFile(blob, 'file with spaces & special.txt');

      expect(mockAnchor.download).toBe('file with spaces & special.txt');
    });
  });
});
