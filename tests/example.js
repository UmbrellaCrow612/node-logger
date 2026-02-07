const { Logger } = require("../dist");

async function main() {
  let logger = new Logger({ saveToLogFiles: true, basePath: "./logs" });

  logger.info({ hello: "world" }, 123, "some more");
  logger.error(new Error("Yo"));
  logger.warn("warning");

  await logger.flush();
  await logger.shutdown();
}

main();
