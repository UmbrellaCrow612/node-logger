const { NodeLogger } = require("./dist/index");

let logger = new NodeLogger();

logger.info("ded");
logger.error(new Error(""), new Error(""), {}, 123, false)
logger.warn("deded", false)

logger.flush()