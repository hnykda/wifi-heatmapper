/**
 * Next.js calls register() once when the server process starts.
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initServer } = await import("./lib/server-init");
    await initServer();
  }
}
