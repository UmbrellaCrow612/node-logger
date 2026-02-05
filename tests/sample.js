const { Logger } = require("../dist/logger");

const logger = new Logger();

logger.info("Info")
logger.debug("Debug")
logger.error("Error", new Error("yo"))
logger.fatal("Fatal")
logger.warn("Warn")
