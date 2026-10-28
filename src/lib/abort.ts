/** abort.ts - the error a stopped measurement step rejects with. */

/** The error an aborted operation rejects with (like Node's own). */
export function abortError(signal: AbortSignal): Error {
  const err = new Error("The operation was aborted", { cause: signal.reason });
  err.name = "AbortError";
  return err;
}

export function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

/** Throw an AbortError if the signal has been aborted. */
export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError(signal);
}
