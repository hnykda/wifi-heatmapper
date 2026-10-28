"use server";
import { exec, ExecOptions } from "child_process";
import { getLogger } from "./logger";
import { hideSudoPassword } from "./redact";
import { abortError } from "./abort";
const logger = getLogger("server-utils");

/**
 * exexAsync - asynchronously run the command, return { stdout, stderr }
 * Trim **ends** of both return values to remove the trailing newline
 * The {shell:true} option allows shell options (pipes, redirection, etc)
 * The option is set to true so that Node can use the proper command for the OS
 * @ts-expect-error avoids Typescript error (the option is typed as a string)
 *
 * Completion Handling:
 * If the command completes normally (return of zero), stdout and stderr
 *    (strings) are filled with the results, and the "else" clause
 *    executes the resolve() function, passing back { stdout, stderr }
 * If the command has an error (non-zero return), error (string)
 *    is set to the result, and the reject() function is called
 * The caller can use catch() to handle a non-zero error return
 *
 * Pass `signal` to stop the command: aborting it kills the child process
 * and rejects with an AbortError.
 *
 * @param command to execute
 * @returns { stdout , stderr }
 */

export const execAsync = async (
  command: string,
  { signal }: { signal?: AbortSignal } = {},
): Promise<{ stdout: string; stderr: string }> => {
  const options: ExecOptions = {
    // @ts-expect-error // "shell" is the name of the shell program, but prop must be boolean
    shell: true, // Node.js finds the right binary for the OS
    // Windows: never open a console window for cmd.exe/netsh/iperf3 (the
    // desktop app runs node without one). No effect elsewhere.
    windowsHide: true,
    signal,
  };

  // `echo <password> | sudo -S ...` must never reach a log or the UI
  const shown = hideSudoPassword(command);
  return new Promise((resolve, reject) => {
    logger.debug("Executing command:", shown);
    exec(command, options, (error, stdout, stderr) => {
      if (error) {
        // Node puts the whole command line in the message ("Command failed:
        // echo pw | sudo -S ...") and in `cmd`; callers show and log both.
        error.message = hideSudoPassword(error.message);
        (error as { cmd?: string }).cmd = shown;
        if (error.stack) error.stack = hideSudoPassword(error.stack);
        logger.debug(`execAsync(${shown}) rejects with "${error}"`);
        // Like util.promisify(exec): callers may need the output of a
        // command that failed (netsh prints why it was denied on stdout).
        reject(Object.assign(error, { stdout, stderr }));
      } else {
        logger.debug(`Command result: ${JSON.stringify(stdout)}`);
        resolve({ stdout: stdout.trimEnd(), stderr: stderr.trimEnd() });
      }
    });
  });
};

/**
 * delay a given number of milliseconds
 * @param ms:number - number of milliseconds to delay
 * @param signal - rejects with an AbortError as soon as it is aborted
 * @returns Promise<void>
 */
export async function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError(signal));
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError(signal!));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
