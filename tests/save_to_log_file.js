const { Logger } = require("../dist/logger");

async function main() {
  const logger = new Logger({ saveToLogFiles: true, outputToConsole: false });

  for (let i = 0; i < 10000; i++) {
    logger.info("Request ", i);
  }

  await logger.flush();
}

main();
