const { NodeLogger } = require("./dist/index");

let logger = new NodeLogger();

logger.info("ded");

logger.Flush()