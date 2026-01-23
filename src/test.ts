import src = require("../src");

let logger = new src.NodeLogger();

logger.info("Hello world");
logger.warn("Hello world");
logger.error(new Error(""));
