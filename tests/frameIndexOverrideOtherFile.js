/**
 * Acts as wrapper around logger to see if override works
 */

/**
 * @param {import("../dist/index").Logger} log
 */
export function frameIndexLogWrapperCaller(log) {
  log.info("Hello world");
}
