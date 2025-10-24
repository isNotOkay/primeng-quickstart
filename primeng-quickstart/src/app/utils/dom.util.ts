/**
 * Creates a stable DOM ID from a value string by replacing non-alphanumeric characters.
 * Example: "Table|Orders" -> "list-item-Table_Orders"
 */
export function createAnchorId(value: string | null | undefined): string | null {
  if (!value) return null;
  return `list-item-${value.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}
