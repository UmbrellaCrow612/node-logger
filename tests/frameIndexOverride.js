/**
 * Test to see if the custom frame index override works
 */

import { Logger } from "../dist/index.js";
import { frameIndexLogWrapperCaller } from "./frameIndexOverrideOtherFile.js";

/**
 *
 * @param {Logger} log
 */
function localFrameIndexLogWrapper(log) {
  log.info("From local");
}

const main = async () => {
  let logger = new Logger({
    saveToLogFiles: true,
    showCallSite: true,
    callSiteOptions: {frameIndex: 1 },
    showTimestamps: false,
  });

  frameIndexLogWrapperCaller(logger);
  localFrameIndexLogWrapper(logger);

  await logger.flush();
  await logger.shutdown();
};

main();
