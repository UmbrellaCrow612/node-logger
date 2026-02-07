const pino = require("pino");
const fs = require("fs");
const path = require("path");

async function runPerformanceTest() {
  // Ensure logs directory exists
  if (!fs.existsSync("./logs")) {
    fs.mkdirSync("./logs", { recursive: true });
  }

  const today = new Date().toISOString().split("T")[0];
  const logFile = path.join("./logs", `${today}.log`);

  // Create Pino logger with file destination (similar to your config)
  const logger = pino(
    {
      level: "info",
      // Minimal formatting for fair comparison
      timestamp: pino.stdTimeFunctions.isoTime,
      // Disable pretty print for performance (production config)
      formatters: {
        level: (label) => ({ level: label }),
      },
      base: undefined, // Remove pid/hostname for cleaner output
    },
    pino.destination({
      dest: logFile,
      // Pino handles buffering internally, flush every 10ms or 1000 lines
      minLength: 0, // Write immediately for fair comparison, or use 4096 for buffering
      sync: false, // Async logging for performance
    })
  );

  console.log("=== Performance Test: 10,000 Log Lines (Pino) ===\n");

  // Test 1: Synchronous-style logging (fire and forget)
  console.time("Total time (fire-and-forget)");
  const startMemory = process.memoryUsage();
  const startTime = performance.now();

  for (let i = 0; i < 10000; i++) {
    logger.info("Performance test log entry number %d", i);
  }

  const fireForgetTime = performance.now() - startTime;
  console.timeEnd("Total time (fire-and-forget)");

  // Test 2: Time to flush (ensure all writes complete)
  console.time("Flush time");
  const flushStart = performance.now();
  
  // Pino uses pino.final or logger.flush() for async destinations
  await new Promise((resolve) => {
    logger.flush(resolve);
  });
  
  const flushTime = performance.now() - flushStart;
  console.timeEnd("Flush time");

  // Test 3: Total end-to-end time
  const totalTime = performance.now() - startTime;

  // Memory usage
  const endMemory = process.memoryUsage();
  const memoryUsed = (endMemory.heapUsed - startMemory.heapUsed) / 1024 / 1024;

  // Throughput calculations
  const logsPerSecond = ((10000 / totalTime) * 1000).toFixed(0);
  const avgTimePerLog = (totalTime / 10000).toFixed(3);

  console.log("\n=== Results ===");
  console.log(`Fire-and-forget loop time: ${fireForgetTime.toFixed(2)}ms`);
  console.log(`Flush time:                ${flushTime.toFixed(2)}ms`);
  console.log(`Total end-to-end time:     ${totalTime.toFixed(2)}ms`);
  console.log(`Average time per log:      ${avgTimePerLog}ms`);
  console.log(`Throughput:                ${logsPerSecond} logs/second`);
  console.log(`Memory used:               ${memoryUsed.toFixed(2)} MB`);

  // Cleanup
  logger.flush(() => {
    // Pino handles stream closure
  });

  // Validation
  if (fs.existsSync(logFile)) {
    const stats = fs.statSync(logFile);
    console.log(`Log file size:             ${(stats.size / 1024).toFixed(2)} KB`);
    
    // Optional: Count lines to verify
    const content = fs.readFileSync(logFile, "utf8");
    const lineCount = content.split("\n").filter((line) => line.trim()).length;
    console.log(`Lines written:             ${lineCount}`);
  }

  console.log("\n=== Test Complete ===");
}

runPerformanceTest().catch(console.error);