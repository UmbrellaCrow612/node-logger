const { Logger } = require("../dist/logger");

const logger = new Logger();

logger.info("Info")
logger.debug("Debug")
logger.error("Error")
logger.fatal("Fatal")
logger.warn("Warn")
