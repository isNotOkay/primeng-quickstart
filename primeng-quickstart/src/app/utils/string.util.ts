/**
 * Normalizes a string by converting to lowercase and removing diacritics.
 * Used for case-insensitive and accent-insensitive string comparison.
 */
export function normalizeString(s: string): string {
  return (s || '')
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
