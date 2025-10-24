import { RelationType } from '../enums/relation-type.enum';
import { getRelationTypeName } from '../utils/sql.util';

describe('SQL Utils', () => {
  describe('getRelationTypeName (deprecated)', () => {
    it('should return "Tabelle" for Table type', () => {
      expect(getRelationTypeName(RelationType.Table)).toBe('Tabelle');
    });

    it('should return "Ansicht" for View type', () => {
      expect(getRelationTypeName(RelationType.View)).toBe('Ansicht');
    });
  });
});
