const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { performance } = require("perf_hooks");
const { NodeLogger } = require("../dist/index");

async function runPerformanceTest() {
  const logDir = path.resolve(__dirname, "logs");
  const logger = new NodeLogger({
    logFilesBasePath: logDir,
    saveToLogFile: true,
    showConsoleOutput: false, // Disable for maximum speed
  });

  const MESSAGE_COUNT = 10000;
  const msg = "Performance test message";

  console.log(`--- Starting Performance Test: ${MESSAGE_COUNT} messages (Maximum Speed) ---`);

  // Start timing right before the logging loop
  const startTime = performance.now();

  // Write all messages as fast as possible with NO delays
  for (let i = 0; i < MESSAGE_COUNT; i++) {
    logger.info(`${msg} #${i}`);
  }

  // Measure time immediately after last write
  const endProductionTime = performance.now();

  try {
    console.log("Waiting for flush and child process exit...");
    
    // Start timing the flush operation
    const flushStartTime = performance.now();
    await logger.flush();
    const flushEndTime = performance.now();

    const productionDuration = endProductionTime - startTime;
    const flushDuration = flushEndTime - flushStartTime;
    const totalDuration = flushEndTime - startTime;

    console.log("----------------------------------");
    console.log(`Message production: ${productionDuration.toFixed(2)}ms`);
    console.log(`Flush/write duration: ${flushDuration.toFixed(2)}ms`);
    console.log(`Total time: ${totalDuration.toFixed(2)}ms`);
    console.log(`Avg per message (production): ${(productionDuration / MESSAGE_COUNT).toFixed(4)}ms`);
    console.log(`Messages per second: ${(MESSAGE_COUNT / (totalDuration / 1000)).toFixed(0)}`);
    console.log("----------------------------------");

    const today = new Date().toISOString().split("T")[0];
    const logFilePath = path.join(logDir, `${today}.log`);

    if (fs.existsSync(logFilePath)) {
      const rawContent = fs.readFileSync(logFilePath, "utf8");
      const lines = rawContent.split("\n").filter(Boolean);
      console.log(`✅ Verified: ${lines.length} lines written to disk.`);

      assert.strictEqual(lines.length, MESSAGE_COUNT, `Expected ${MESSAGE_COUNT}, found ${lines.length}`);
    } else {
      throw new Error(`Log file not found: ${logFilePath}`);
    }
  } catch (err) {
    console.error("❌ Test failed:", err.message);
    process.exit(1);
  }
}

runPerformanceTest();