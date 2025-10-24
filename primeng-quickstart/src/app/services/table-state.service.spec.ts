import { TestBed } from '@angular/core/testing';
import { TableStateService, ColWidths } from './table-state.service';

describe('TableStateService', () => {
  let service: TableStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TableStateService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getWidths', () => {
    it('should return undefined for non-existent relation key', () => {
      const result = service.getWidths('non-existent-key');
      expect(result).toBeUndefined();
    });

    it('should return widths for existing relation key', () => {
      const widths: ColWidths = { Id: '120px', Name: '240px' };
      service.setWidths('table1', widths);

      const result = service.getWidths('table1');
      expect(result).toEqual(widths);
    });
  });

  describe('getWidth', () => {
    it('should return undefined for non-existent relation key', () => {
      const result = service.getWidth('non-existent-key', 'Id');
      expect(result).toBeUndefined();
    });

    it('should return undefined for non-existent column', () => {
      const widths: ColWidths = { Id: '120px' };
      service.setWidths('table1', widths);

      const result = service.getWidth('table1', 'NonExistentColumn');
      expect(result).toBeUndefined();
    });

    it('should return width for existing column', () => {
      const widths: ColWidths = { Id: '120px', Name: '240px' };
      service.setWidths('table1', widths);

      const result = service.getWidth('table1', 'Id');
      expect(result).toBe('120px');
    });
  });

  describe('setWidths', () => {
    it('should store widths for a relation key', () => {
      const widths: ColWidths = { Id: '120px', Name: '240px' };
      service.setWidths('table1', widths);

      const result = service.getWidths('table1');
      expect(result).toEqual(widths);
    });

    it('should overwrite existing widths for the same key', () => {
      const widths1: ColWidths = { Id: '120px' };
      const widths2: ColWidths = { Id: '150px', Name: '240px' };

      service.setWidths('table1', widths1);
      service.setWidths('table1', widths2);

      const result = service.getWidths('table1');
      expect(result).toEqual(widths2);
    });

    it('should store widths independently for different keys', () => {
      const widths1: ColWidths = { Id: '120px' };
      const widths2: ColWidths = { Name: '240px' };

      service.setWidths('table1', widths1);
      service.setWidths('table2', widths2);

      expect(service.getWidths('table1')).toEqual(widths1);
      expect(service.getWidths('table2')).toEqual(widths2);
    });
  });

  describe('clear', () => {
    it('should clear all widths when no key is provided', () => {
      service.setWidths('table1', { Id: '120px' });
      service.setWidths('table2', { Name: '240px' });

      service.clear();

      expect(service.getWidths('table1')).toBeUndefined();
      expect(service.getWidths('table2')).toBeUndefined();
    });

    it('should clear widths for a specific relation key', () => {
      service.setWidths('table1', { Id: '120px' });
      service.setWidths('table2', { Name: '240px' });

      service.clear('table1');

      expect(service.getWidths('table1')).toBeUndefined();
      expect(service.getWidths('table2')).toEqual({ Name: '240px' });
    });

    it('should not throw error when clearing non-existent key', () => {
      expect(() => service.clear('non-existent')).not.toThrow();
    });
  });
});
