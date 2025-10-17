import { RelationType } from '../enums/relation-type.enum';

export function getRelationTypeName(type: RelationType): string {
  return type === RelationType.View ? 'Ansicht' : 'Tabelle';
}
