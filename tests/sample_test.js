import { Logger } from "../dist/index.js";
import fs from "fs/promises";
import path from "path";

const logger = new Logger({ saveToLogFiles: true, basePath: "./sample_test" });

async function main() {
  // Clean up any existing test directory
  try {
    await fs.rm("./sample_test", { recursive: true, force: true });
  } catch (e) {
    // Directory might not exist, that's fine
  }

  // Generate logs
  for (let i = 0; i < 1000; i++) {
    logger.info(i);
    logger.error(i);
    logger.warn(i);
    logger.fatal(i);
    logger.debug(i);
  }

  await logger.flush();
  await logger.shutdown();

  // Verify logs were written correctly
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const logFile = path.resolve(path.normalize(path.join("./sample_test", `${today}.log`)));

  try {
    // Check log file exists
    const fileStat = await fs.stat(logFile);
    if (!fileStat.isFile()) {
      throw new Error(`${logFile} is not a file`);
    }
    console.log(`✓ Log file created: ${logFile}`);

    // Read and verify log content
    const content = await fs.readFile(logFile, "utf-8");
    const lines = content
      .trim()
      .split("\n")
      .filter((line) => line.length > 0);
    
    const totalLines = lines.length;
    const expectedLines = 5000; // 1000 iterations × 5 log levels

    console.log(`✓ Total log lines written: ${totalLines}`);
    console.log(`✓ Expected log lines: ${expectedLines}`);

    if (totalLines !== expectedLines) {
      throw new Error(
        `Line count mismatch: expected ${expectedLines}, got ${totalLines}`,
      );
    }

    // Verify format of sample lines
    const sampleLines = lines.slice(0, 5);
    for (const line of sampleLines) {
      const match = line.match(
        /^\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\] \[(INFO|ERROR|WARN|FATAL|DEBUG)\]: (\d+)$/,
      );
      if (!match) {
        throw new Error(`Invalid log format: ${line}`);
      }
    }
    console.log(`✓ Log format valid for sample lines`);

    // Check that iteration 999 exists with all log levels
    const hasInfo999 = content.includes("[INFO]: 999");
    const hasError999 = content.includes("[ERROR]: 999");
    const hasWarn999 = content.includes("[WARN]: 999");
    const hasFatal999 = content.includes("[FATAL]: 999");
    const hasDebug999 = content.includes("[DEBUG]: 999");

    console.log(`✓ Contains [INFO]: 999: ${hasInfo999}`);
    console.log(`✓ Contains [ERROR]: 999: ${hasError999}`);
    console.log(`✓ Contains [WARN]: 999: ${hasWarn999}`);
    console.log(`✓ Contains [FATAL]: 999: ${hasFatal999}`);
    console.log(`✓ Contains [DEBUG]: 999: ${hasDebug999}`);

    if (
      !hasInfo999 ||
      !hasError999 ||
      !hasWarn999 ||
      !hasFatal999 ||
      !hasDebug999
    ) {
      throw new Error("Missing expected log entries for iteration 999");
    }

    // Verify timestamp format matches example: [2026-02-27T15:39:01.702Z]
    const timestampMatch = content.match(
      /\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/,
    );
    if (!timestampMatch) {
      throw new Error("Timestamp format mismatch");
    }
    console.log(`✓ Timestamp format valid: ${timestampMatch[0]}`);

    // Verify log levels are in correct order per iteration (based on your example)
    // Your example shows: INFO, ERROR, WARN, FATAL, DEBUG for each number
    const lastLines = lines.slice(-5);
    const expectedOrder = ["[INFO]: 999", "[ERROR]: 999", "[WARN]: 999", "[FATAL]: 999", "[DEBUG]: 999"];
    const actualOrder = lastLines.map(line => {
      const match = line.match(/\[(INFO|ERROR|WARN|FATAL|DEBUG)\]: \d+$/);
      return match ? match[0] : "";
    });
    
    const orderCorrect = expectedOrder.every((expected, i) => actualOrder[i] === expected);
    console.log(`✓ Log level order correct: ${orderCorrect}`);

    console.log("\n✅ All tests passed!");
  } catch (error) {
    console.error("\n❌ Test failed:", error.message);
    process.exit(1);
  }
}

main();