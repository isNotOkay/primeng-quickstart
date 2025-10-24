/**
 * Checks if a list option is disabled or is a placeholder.
 */
export function isListOptionDisabled(opt: { disabled?: boolean; __placeholder?: boolean }): boolean {
  return !!opt?.disabled || !!opt?.__placeholder;
}

/**
 * TrackBy function for row rendering in tables.
 * Tries to use id, Id, or ID properties, falls back to index.
 */
export function rowTrackByFn(index: number, row: Record<string, unknown>): unknown {
  return row?.['id'] ?? row?.['Id'] ?? row?.['ID'] ?? index;
}

/**
 * Type guard to check if a value is a number.
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number';
}
