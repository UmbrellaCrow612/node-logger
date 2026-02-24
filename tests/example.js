import { Logger } from "../dist/index.js";

async function main() {
  let logger = new Logger({ saveToLogFiles: false, basePath: "./logs" });

  logger.info({ hello: "world" }, 123, "some more");
  logger.error(new Error("Yo"));
  logger.warn("warning");

  await logger.flush();
  await logger.shutdown();
}

main();
