const { NodeLogger } = require("../dist/index");

async function main() {
  let logger = new NodeLogger({showStackTraceOfLogCalls: true});

  logger.info("yo", new Error("Hello world"), {hello: "e"}, (e) => {}, Symbol("hello"));

  await logger.flush();
}

main();
