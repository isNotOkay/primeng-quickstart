import { RelationType } from '../enums/relation-type.enum';

/**
 * Creates a unique value string from a relation type and ID.
 * Format: "type|id"
 */
export function makeRelationValue(type: RelationType, id: string): string {
  return `${type}|${id}`;
}

/**
 * Parses a relation value string into its type and ID components.
 */
export function parseRelationValue(value: string): { type: RelationType; id: string } {
  const [typeStr, ...rest] = value.split('|');
  const id = rest.join('|');
  const type = typeStr === RelationType.View ? RelationType.View : RelationType.Table;
  return { type, id };
}

/**
 * Returns the localized label for a relation type.
 */
export function getRelationTypeLabel(type: RelationType): string {
  return type === RelationType.View ? 'Sicht' : 'Tabelle';
}

/**
 * Creates a stable relation key for storage/state purposes.
 * Format: "TypeName|id" (e.g., "Table|Orders" or "View|CustomerSummary")
 */
export function makeRelationKey(type: RelationType, id: string): string {
  const typeKey = type === RelationType.View ? 'View' : 'Table';
  return `${typeKey}|${id}`;
}
