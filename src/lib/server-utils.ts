"use server";
import { exec } from "child_process";
import util from "util";
import { getLogger } from "./logger";

const logger = getLogger("server-utils");

export const execAsync = async (command: string) => {
  logger.trace("Executing command:", command);
  const result = await util.promisify(exec)(command);
  logger.trace("Command executed:", { result });
  return result;
};
