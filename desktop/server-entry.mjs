/**
 * What the desktop shell runs instead of server.js directly.
 *
 * The shell keeps the write end of this process's stdin. When the shell goes
 * away for any reason (normal quit, crash, force quit, Ctrl-C on `tauri dev`)
 * the pipe closes and the server exits with it, so no node process is left
 * behind on any platform. A normal quit also kills this process directly; this
 * is the fallback for the cases where the shell never gets to.
 */
process.stdin.on("end", () => process.exit(0));
process.stdin.on("error", () => process.exit(0));
process.stdin.resume();

await import("./server.js");
