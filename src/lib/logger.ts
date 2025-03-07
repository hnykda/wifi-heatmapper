import { Logger } from "tslog";

const rootLogger = new Logger({
  name: "root",
  // 0: silly, 1: trace, 2: debug, 3: info, 4: warn, 5: error, 6: fatal
  minLevel: parseInt(process.env.LOG_LEVEL || "3"),
});

export function getLogger(name: string) {
  return rootLogger.getSubLogger({ name });
}
