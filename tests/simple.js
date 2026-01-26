const { NodeLogger } = require("../dist/index");

async function main() {
  let logger = new NodeLogger({showStackTraceOfLogCalls: true});

  logger.info("yo");

  await logger.flush();
}

main();
