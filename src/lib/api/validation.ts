/**
 * Request-body validation for the public API routes.
 *
 * Every route used to hand-roll the same `try { await request.json() } catch`
 * plus a chain of `if (!x)` checks, which drifted between endpoints (some
 * trimmed, some did not; some capped length, some did not). This module gives
 * them one shape: a zod schema per payload, plus a helper that turns a schema
 * failure into the `{ error, issues }` body the routes already returned.
 *
 * Deliberately free of `next/*` imports so the schemas and the mapping can be
 * unit-tested directly.
 */
import { z } from "zod";

/** A single field-level problem, safe to show to a client. */
export interface FieldIssue {
  /** Dotted path of the offending field, e.g. `body` or `pollId`. */
  field: string;
  message: string;
}

export type ValidationOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; issues: FieldIssue[] };

/** Join a zod `path` (string | number | symbol segments) into a dotted key. */
function fieldPath(path: readonly PropertyKey[]): string {
  return path.length > 0 ? path.map((part) => String(part)).join(".") : "_";
}

/**
 * HTTP status for a failed field. Oversized payloads keep their own status
 * (the comment route has always answered `413` for a too-long body) rather
 * than collapsing everything into a generic `400`.
 */
function statusForIssues(issues: readonly z.core.$ZodIssue[]): number {
  return issues.some((issue) => issue.code === "too_big") ? 413 : 400;
}

/**
 * Validate `input` against `schema`.
 *
 * The error message is the first issue's message, which reads well for the
 * single-field cases that dominate here; callers get the full list in
 * `issues` for anything more structured.
 */
export function validate<S extends z.ZodType>(
  schema: S,
  input: unknown,
): ValidationOutcome<z.output<S>> {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { ok: true, data: parsed.data };

  const issues: FieldIssue[] = parsed.error.issues.map((issue) => ({
    field: fieldPath(issue.path),
    message: issue.message,
  }));

  return {
    ok: false,
    status: statusForIssues(parsed.error.issues),
    error: issues[0]?.message ?? "Invalid request body",
    issues,
  };
}

export type JsonBodyOutcome =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

/** Read a JSON request body, converting a parse failure into a message. */
export async function readJsonBody(request: Request): Promise<JsonBodyOutcome> {
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return { ok: false, error: "Invalid JSON body" };
  }
}
