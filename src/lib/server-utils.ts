"use server";
import { exec, ExecOptions, spawn } from "child_process";
// import { getLogger } from "./logger";
// const logger = getLogger("server-utils");

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
 * @param command to execute
 * @returns { stdout , stderr }
 */
export const execAsync = async (
  command: string,
): Promise<{ stdout: string; stderr: string }> => {
  // @ts-expect-error // "shell" is the name of the shell program, but prop must be boolean
  const options: ExecOptions = { shell: true }; // Node.js finds the right binary for the OS

  return new Promise((resolve, reject) => {
    // logger.info("Executing command:", command);
    exec(command, options, (error, stdout, stderr) => {
      if (error) {
        // logger.info(`execAsync(${command} rejects with "${error}")`);
        reject(error);
      } else {
        // logger.info(`Command result: ${JSON.stringify(stdout)}`);
        resolve({ stdout: stdout.trimEnd(), stderr: stderr.trimEnd() });
      }
    });
  });
};

/**
 * runDetached(cmd, [args])
 *   Use this function to start a process but ignore its return
 *   and simply use some other effect to know when it's complete
 * Setting shell: true (below) allows you to use shell syntax,
 *   so the command can be exactly as you type it
 *   (and args can be empty/missing)
 *
 * @param command - command to run
 * @param args array of arguments to pass along
 */
export async function runDetached(command: string, args: string[] = []) {
  const subprocess = spawn(command, args, {
    detached: true,
    stdio: "ignore", // Don't keep stdio open
    shell: true, // Needed if you're using shell syntax
  });

  subprocess.unref(); // Allow parent to exit independently
}

/**
 * delay a given number of milliseconds
 * @param ms:number - number of milliseconds to delay
 * @returns Promise<void>
 */
export async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
