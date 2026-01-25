const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { NodeLogger } = require("../dist/index");

async function runTest() {
  // 1. Define an absolute path for the logs directory relative to this test file
  const logDir = path.resolve(__dirname, "logs");

  // 2. Initialize logger with the absolute path
  const logger = new NodeLogger({
    logFilesBasePath: logDir,
    saveToLogFile: true
  });

  const INFO_COUNT = 2;
  const infoMsg = "ded";
  const warnMsg = "warn message";
  const errorMsg = "error message";

  console.log("--- Producing Logs ---");
  for (let i = 0; i < INFO_COUNT; i++) {
    logger.info(infoMsg);
  }
  logger.warn(warnMsg);
  logger.error(errorMsg);

  try {
    // 3. Wait for the child process to flush and EXIT
    console.log("Waiting for flush and child exit...");
    await logger.flush();
    console.log("Child process exited.");

    // 4. Construct the log file path
    const today = new Date().toISOString().split("T")[0];
    const logFilePath = path.join(logDir, `${today}.log`);

    console.log(`Verifying file at: ${logFilePath}`);

    // 5. Assertions
    assert.ok(fs.existsSync(logFilePath), `Log file does not exist at: ${logFilePath}`);

    const rawContent = fs.readFileSync(logFilePath, "utf8");
    const lines = rawContent.split("\n").filter(Boolean);

    // FIX: Match the actual file format (e.g., "GMT INFO ded" instead of "[INFO]")
    const infoLogs = lines.filter(l => l.includes(" INFO ") && l.endsWith(infoMsg));
    const warnLogs = lines.filter(l => l.includes(" WARN ") && l.endsWith(warnMsg));
    const errorLogs = lines.filter(l => l.includes(" ERROR ") && l.endsWith(errorMsg));

    try {
      assert.strictEqual(infoLogs.length, INFO_COUNT, `Expected ${INFO_COUNT} INFO logs, found ${infoLogs.length}`);
      assert.strictEqual(warnLogs.length, 1, "Expected 1 WARN log");
      assert.strictEqual(errorLogs.length, 1, "Expected 1 ERROR log");
      
      console.log("✅ Logger test passed — correct log counts verified");
    } catch (assertionError) {
      console.log("\n--- File Content for Debugging ---");
      console.log(rawContent);
      console.log("----------------------------------\n");
      throw assertionError;
    }

  } catch (err) {
    console.error("❌ Test failed:", err.message);
    process.exit(1);
  }
}

runTest();