const { Logger } = require("../dist/index.js");

async function runPerformanceTest() {
  const logger = new Logger({ 
    basePath: "./logs",
    saveToLogFiles: true,
    outputToConsole: false
  });

  console.log("=== Performance Test: 10,000 Log Lines ===\n");

  // Test 1: Synchronous-style logging (fire and forget)
  console.time("Total time (fire-and-forget)");
  const startMemory = process.memoryUsage();
  const startTime = performance.now();

  for (let i = 0; i < 10000; i++) {
    logger.info("Performance test log entry number", i);
  }

  const fireForgetTime = performance.now() - startTime;
  console.timeEnd("Total time (fire-and-forget)");
  
  // Test 2: Time to flush (ensure all writes complete)
  console.time("Flush time");
  const flushStart = performance.now();
  await logger.flush();
  const flushTime = performance.now() - flushStart;
  console.timeEnd("Flush time");

  // Test 3: Total end-to-end time
  const totalTime = performance.now() - startTime;
  
  // Memory usage
  const endMemory = process.memoryUsage();
  const memoryUsed = (endMemory.heapUsed - startMemory.heapUsed) / 1024 / 1024;

  // Throughput calculations
  const logsPerSecond = (10000 / totalTime * 1000).toFixed(0);
  const avgTimePerLog = (totalTime / 10000).toFixed(3);

  console.log("\n=== Results ===");
  console.log(`Fire-and-forget loop time: ${fireForgetTime.toFixed(2)}ms`);
  console.log(`Flush time:                ${flushTime.toFixed(2)}ms`);
  console.log(`Total end-to-end time:     ${totalTime.toFixed(2)}ms`);
  console.log(`Average time per log:      ${avgTimePerLog}ms`);
  console.log(`Throughput:                ${logsPerSecond} logs/second`);
  console.log(`Memory used:               ${memoryUsed.toFixed(2)} MB`);

  await logger.shutdown();

  // Optional: Quick validation that logs were written
  const fs = require("fs");
  const path = require("path");
  const today = new Date().toISOString().split("T")[0];
  const logFile = path.join("./logs", `${today}.log`);
  
  if (fs.existsSync(logFile)) {
    const stats = fs.statSync(logFile);
    console.log(`Log file size:             ${(stats.size / 1024).toFixed(2)} KB`);
  }

  console.log("\n=== Test Complete ===");
}

runPerformanceTest().catch(console.error);