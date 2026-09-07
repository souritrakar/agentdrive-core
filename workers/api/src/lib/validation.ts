import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import type { ZodType } from "zod";

/**
 * Request validation for the whole API.
 *
 * Wraps `@hono/zod-validator` for one reason: its default failure response is
 * Zod's raw `SafeParseResult`, which does not match the `{ error: { code,
 * message } }` shape every other route and `app.onError` already produce. One
 * envelope for every failure means a client needs exactly one error path.
 *
 * Parsing happens here, at the boundary, once — handlers receive typed,
 * already-validated values via `c.req.valid(target)`. See
 * docs/architecture/backend-principles.md §6.
 */
export function validate<T extends ZodType, Target extends keyof ValidationTargets>(
  target: Target,
  schema: T,
) {
  return zValidator(target, schema, (result, c) => {
    if (result.success) return;

    // `path` is a segment array; join it so nested fields read as "a.b[0].c".
    const details = result.error.issues.map((issue) => ({
      field: issue.path.map(String).join(".") || "(root)",
      message: issue.message,
    }));

    return c.json(
      {
        error: {
          code: "invalid_input",
          message: details.map((d) => `${d.field}: ${d.message}`).join("; "),
          details,
        },
      },
      400,
    );
  });
}
