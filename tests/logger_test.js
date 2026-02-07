const { Logger } = require("../dist");
const fs = require("fs");
const path = require("path");

async function main() {
  const logsDir = "./logs";

  // Clean up any existing logs first
  if (fs.existsSync(logsDir)) {
    fs.rmSync(logsDir, { recursive: true, force: true });
  }

  let logger = new Logger({
    saveToLogFiles: true,
    outputToConsole: false,
    basePath: logsDir,
  });

  // Write multiple log entries with different levels
  logger.info("Hello world");
  logger.debug("Debug message");
  logger.warn("Warning message");
  logger.error("Error message");
  logger.info("Second info message");

  await logger.flush();
  await logger.shutdown();

  // --- TEST ASSERTIONS ---

  // 1. Check logs folder exists
  if (!fs.existsSync(logsDir)) {
    throw new Error("FAIL: logs folder was not created");
  }
  console.log("✓ Logs folder exists");

  // 2. Check file with YYYY-MM-DD format exists
  const today = new Date().toISOString().split("T")[0]; // "2026-02-07"
  const expectedFilename = `${today}.log`;
  const expectedFilePath = path.join(logsDir, expectedFilename);

  if (!fs.existsSync(expectedFilePath)) {
    throw new Error(
      `FAIL: Expected log file ${expectedFilename} not found in ${logsDir}`,
    );
  }
  console.log(`✓ Log file exists: ${expectedFilename}`);

  // 3. Check all lines were written to the file
  const fileContent = fs.readFileSync(expectedFilePath, "utf-8");
  const lines = fileContent
    .trim()
    .split("\n")
    .filter((line) => line.length > 0);

  const expectedMessages = [
    "Hello world",
    "Debug message",
    "Warning message",
    "Error message",
    "Second info message",
  ];

  // Verify we have the expected number of log lines
  if (lines.length !== expectedMessages.length) {
    throw new Error(
      `FAIL: Expected ${expectedMessages.length} log lines, but found ${lines.length}`,
    );
  }
  console.log(`✓ All ${lines.length} log lines written to file`);

  // 4. Verify each expected message appears in the file
  for (const msg of expectedMessages) {
    const found = lines.some((line) => line.includes(msg));
    if (!found) {
      throw new Error(`FAIL: Expected message "${msg}" not found in log file`);
    }
  }
  console.log("✓ All expected messages found in log file");

  // 5. Verify log format includes timestamp and level
  const firstLine = lines[0];
  const hasTimestamp = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(firstLine);
  const hasLogLevel = /\[INFO\]|\[DEBUG\]|\[WARN\]|\[ERROR\]/.test(firstLine);

  if (!hasTimestamp) {
    throw new Error("FAIL: Log line missing valid timestamp format");
  }
  if (!hasLogLevel) {
    throw new Error("FAIL: Log line missing log level");
  }
  console.log("✓ Log format contains timestamp and level");

  // 6. Verify log levels are correct
  const levelChecks = [
    { line: 0, level: "INFO", msg: "Hello world" },
    { line: 1, level: "DEBUG", msg: "Debug message" },
    { line: 2, level: "WARN", msg: "Warning message" },
    { line: 3, level: "ERROR", msg: "Error message" },
    { line: 4, level: "INFO", msg: "Second info message" },
  ];

  for (const check of levelChecks) {
    const line = lines[check.line];
    const hasCorrectLevel = line.includes(`[${check.level}]`);
    const hasCorrectMsg = line.includes(check.msg);

    if (!hasCorrectLevel) {
      throw new Error(
        `FAIL: Line ${check.line + 1} expected [${check.level}] but got: ${line}`,
      );
    }
    if (!hasCorrectMsg) {
      throw new Error(
        `FAIL: Line ${check.line + 1} missing message "${check.msg}"`,
      );
    }
  }
  console.log("✓ All log levels match expected values");

  console.log("\n🎉 All tests passed!");

  // Optional: Cleanup
  // fs.rmSync(logsDir, { recursive: true, force: true });
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
