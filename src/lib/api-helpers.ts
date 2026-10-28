/**
 * api-helpers.ts - shared bits of the survey route handlers (route files
 * may only export HTTP methods, so these live here).
 */
import { NextResponse } from "next/server";
import type { z } from "zod";
import { describeIssues } from "./schema";
import { SurveyChangeError, SurveyFileError } from "./survey-store";

export function jsonError(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

/** Parse a JSON body with a (strict) schema; a 400 answer if it doesn't fit. */
export async function readBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<
  { ok: true; data: z.output<T> } | { ok: false; response: NextResponse }
> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, response: jsonError(400, "The body is not JSON") };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      response: jsonError(
        400,
        `Invalid request: ${describeIssues(parsed.error)}`,
      ),
    };
  }
  return { ok: true, data: parsed.data };
}

/** Parse the query string with a (strict) schema; a 400 answer if it doesn't fit. */
export function readQuery<T extends z.ZodType>(
  request: { nextUrl: URL },
  schema: T,
): { ok: true; data: z.output<T> } | { ok: false; response: NextResponse } {
  const parsed = schema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return {
      ok: false,
      response: jsonError(
        400,
        `Invalid request: ${describeIssues(parsed.error)}`,
      ),
    };
  }
  return { ok: true, data: parsed.data };
}

/** The answer for an error thrown by survey-store. */
export function storeErrorResponse(err: unknown, what: string) {
  if (err instanceof SurveyChangeError)
    return jsonError(err.status, err.message);
  if (err instanceof SurveyFileError) {
    return jsonError(500, `${what}: ${err.message}. Fix or delete the file.`);
  }
  return jsonError(500, `${what}: ${err}`);
}
