import { RelationType } from '../enums/relation-type.enum';

/**
 * @deprecated Use getRelationTypeLabel from relation.util.ts instead
 */
export function getRelationTypeName(type: RelationType): string {
  return type === RelationType.View ? 'Ansicht' : 'Tabelle';
}
