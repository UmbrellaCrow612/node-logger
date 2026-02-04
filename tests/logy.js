const { NodeLogger } = require("../dist");

async function main() {
  var logger = new NodeLogger();

  setTimeout(async () => {
    logger.info("Ending")
    await logger.flush();
  }, 4000)
}


main()