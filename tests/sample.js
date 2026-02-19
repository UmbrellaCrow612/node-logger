import { Logger } from "../dist/index.js";

async function main() {
  let logger = new Logger({
    saveToLogFiles: true,
    showCallSite: true,
    showTimestamps: false,
    showLogLevel: true,
    callSiteOptions: {
      fullFilePath: false
    }
  });

  logger.log(1, "Hello world");

  await logger.flush();
  await logger.shutdown();
}

main();
