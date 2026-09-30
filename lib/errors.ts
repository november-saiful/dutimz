/**
 * Reader-facing error handling. Provider messages may contain URLs, SQL, keys,
 * policy details, or stack text, so they are logged for debugging and never
 * copied into the UI. Callers supply a fixed, operation-specific Bengali
 * fallback.
 */
export function reportError(context: string, error: unknown): void {
  if (error === undefined || error === null) return;
  console.error(`[dutimz] ${context}`, error);
}

export const GENERIC_ERROR = "কিছু একটা ভুল হয়েছে। আবার চেষ্টা করুন।";

/** True for a Postgres unique-constraint violation (SQLSTATE 23505). */
export function isUniqueViolation(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    (error as { code?: unknown }).code === "23505"
  );
}

/** Log the raw failure, then return only fixed Bengali reader-facing text. */
export function errorMessage(
  context: string,
  error: unknown,
  fallback: string = GENERIC_ERROR,
): string {
  reportError(context, error);
  return fallback;
}
