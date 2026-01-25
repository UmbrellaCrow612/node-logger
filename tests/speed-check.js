const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { performance } = require("perf_hooks"); // Built-in for high-res timing
const { NodeLogger } = require("../dist/index");

async function runPerformanceTest() {
  const logDir = path.resolve(__dirname, "logs");
  const logger = new NodeLogger({
    logFilesBasePath: logDir,
    saveToLogFile: true
  });

  const MESSAGE_COUNT = 10000;
  const msg = "Performance test message";

  console.log(`--- Starting Performance Test: ${MESSAGE_COUNT} messages ---`);

  // Start timer
  const startTime = performance.now();

  for (let i = 0; i < MESSAGE_COUNT; i++) {
    logger.info(`${msg} #${i}`);
  }

  // End timer for the "production" phase
  const endProductionTime = performance.now();

  try {
    console.log("Waiting for flush and child process exit...");
    await logger.flush();
    
    const endTotalTime = performance.now();

    // 1. Calculate Statistics
    const productionDuration = endProductionTime - startTime;
    const totalDuration = endTotalTime - startTime;

    console.log("----------------------------------");
    console.log(`Log production took: ${productionDuration.toFixed(2)}ms`);
    console.log(`Total time (including flush): ${totalDuration.toFixed(2)}ms`);
    console.log(`Avg time per log call: ${(productionDuration / MESSAGE_COUNT).toFixed(4)}ms`);
    console.log("----------------------------------");

    // 2. Verification
    const today = new Date().toISOString().split("T")[0];
    const logFilePath = path.join(logDir, `${today}.log`);
    
    if (fs.existsSync(logFilePath)) {
      const rawContent = fs.readFileSync(logFilePath, "utf8");
      const lines = rawContent.split("\n").filter(Boolean);
      console.log(`✅ Verified: ${lines.length} lines written to disk.`);
      
      assert.strictEqual(lines.length, MESSAGE_COUNT, `Expected ${MESSAGE_COUNT} logs, but found ${lines.length}`);
    }

  } catch (err) {
    console.error("❌ Test failed:", err.message);
    process.exit(1);
  }
}

runPerformanceTest();