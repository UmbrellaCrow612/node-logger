const { NodeLogger } = require("./dist/index");

let logger = new NodeLogger();

for (let i = 0; i < 50; i++) {
  logger.info("ded");
  logger.error(new Error(""), new Error(""), {}, 123, false);
  logger.warn("deded", false);
}

logger.flush();
