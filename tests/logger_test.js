const { Logger } = require("../dist/logger");

async function main() {
  const logger = new Logger({ showCallSite: true, basePath: "./logs",saveToLogFiles: true });

  for (let i = 0; i < 10000; i++) {
    logger.info("log ", i);
  }

  await logger.flush();
  await logger.shutdown();
}


main()