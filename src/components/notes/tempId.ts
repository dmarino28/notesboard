/** Temporary ID prefix for optimistically-created entries before server response. */
export const TEMP_PREFIX = "tmp-";

export function tempId(): string {
  return `${TEMP_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function isTemp(id: string): boolean {
  return id.startsWith(TEMP_PREFIX);
}
