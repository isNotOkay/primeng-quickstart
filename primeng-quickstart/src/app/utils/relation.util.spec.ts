import { RelationType } from '../enums/relation-type.enum';
import {
  makeRelationValue,
  parseRelationValue,
  getRelationTypeLabel,
  makeRelationKey,
} from './relation.util';

describe('Relation Utils', () => {
  describe('makeRelationValue', () => {
    it('should create value with table type', () => {
      expect(makeRelationValue(RelationType.Table, 'Orders')).toBe('table|Orders');
    });

    it('should create value with view type', () => {
      expect(makeRelationValue(RelationType.View, 'CustomerSummary')).toBe('view|CustomerSummary');
    });

    it('should handle empty id', () => {
      expect(makeRelationValue(RelationType.Table, '')).toBe('table|');
    });

    it('should handle id with pipe character', () => {
      expect(makeRelationValue(RelationType.Table, 'Test|Value')).toBe('table|Test|Value');
    });

    it('should handle id with special characters', () => {
      expect(makeRelationValue(RelationType.View, 'Test-View_123')).toBe('view|Test-View_123');
    });
  });

  describe('parseRelationValue', () => {
    it('should parse table relation value', () => {
      const result = parseRelationValue('table|Orders');
      expect(result.type).toBe(RelationType.Table);
      expect(result.id).toBe('Orders');
    });

    it('should parse view relation value', () => {
      const result = parseRelationValue('view|CustomerSummary');
      expect(result.type).toBe(RelationType.View);
      expect(result.id).toBe('CustomerSummary');
    });

    it('should handle id with multiple pipe characters', () => {
      const result = parseRelationValue('table|Test|Value|123');
      expect(result.type).toBe(RelationType.Table);
      expect(result.id).toBe('Test|Value|123');
    });

    it('should handle empty id', () => {
      const result = parseRelationValue('table|');
      expect(result.type).toBe(RelationType.Table);
      expect(result.id).toBe('');
    });

    it('should default to Table type for unknown types', () => {
      const result = parseRelationValue('unknown|SomeId');
      expect(result.type).toBe(RelationType.Table);
      expect(result.id).toBe('SomeId');
    });

    it('should handle value with only type part', () => {
      const result = parseRelationValue('table');
      expect(result.type).toBe(RelationType.Table);
      expect(result.id).toBe('');
    });

    it('should handle view type correctly', () => {
      const result = parseRelationValue('view|TestView');
      expect(result.type).toBe(RelationType.View);
      expect(result.id).toBe('TestView');
    });
  });

  describe('getRelationTypeLabel', () => {
    it('should return "Tabelle" for Table type', () => {
      expect(getRelationTypeLabel(RelationType.Table)).toBe('Tabelle');
    });

    it('should return "Sicht" for View type', () => {
      expect(getRelationTypeLabel(RelationType.View)).toBe('Sicht');
    });
  });

  describe('makeRelationKey', () => {
    it('should create key with Table prefix for table type', () => {
      expect(makeRelationKey(RelationType.Table, 'Orders')).toBe('Table|Orders');
    });

    it('should create key with View prefix for view type', () => {
      expect(makeRelationKey(RelationType.View, 'CustomerSummary')).toBe('View|CustomerSummary');
    });

    it('should handle empty id', () => {
      expect(makeRelationKey(RelationType.Table, '')).toBe('Table|');
    });

    it('should handle id with pipe character', () => {
      expect(makeRelationKey(RelationType.Table, 'Test|Value')).toBe('Table|Test|Value');
    });

    it('should handle id with special characters', () => {
      expect(makeRelationKey(RelationType.View, 'Test-View_123')).toBe('View|Test-View_123');
    });

    it('should create different keys for same id but different types', () => {
      const tableKey = makeRelationKey(RelationType.Table, 'Orders');
      const viewKey = makeRelationKey(RelationType.View, 'Orders');
      expect(tableKey).not.toBe(viewKey);
      expect(tableKey).toBe('Table|Orders');
      expect(viewKey).toBe('View|Orders');
    });
  });
});
