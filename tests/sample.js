import { Logger } from "../dist/index.js";

async function main() {
  let logger = new Logger({
    saveToLogFiles: true,
    showCallSite: false,
    showTimestamps: false,
    showLogLevel: true,
  });

  logger.info("Hello world");

  await logger.flush();
  await logger.shutdown();
}

main();
