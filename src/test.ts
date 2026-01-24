import src = require(".");

let logger = new src.NodeLogger();

logger.error(new Error("yo sup"));

logger.flush();
