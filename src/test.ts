import src = require(".");

let logger = new src.NodeLogger();

logger.info("Info");
logger.error(new Error("yo sup"));
logger.warn("ednden ");

logger.flush();
