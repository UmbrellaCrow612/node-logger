import src = require("../src");

let logger = new src.NodeLogger();

logger.info("Hello world", "more", 123);
logger.warn("Hello world");
logger.error(new Error("Yo"), "some other");

process.on("exit", () => {
  logger.flushLogsSync();
  console.log("finished");
});
