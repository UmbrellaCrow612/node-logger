import src = require("../src");

let logger = new src.NodeLogger({
  showLogTime: false,
  logFileRetentionPeriodInDays: 30,
  logFilesBasePath: "./logs",
  saveToLogFile: true,
  useColoredOutput: true,
});

logger.info("Hello world");
logger.warn("Hello world");
logger.error(new Error(""));

logger.destroy();
