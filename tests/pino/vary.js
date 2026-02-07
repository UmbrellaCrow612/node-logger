const pino = require("pino");
const fs = require("fs");
const path = require("path");
const { createWriteStream } = require("fs");

async function runPinoPerformanceTest() {
  const logDir = "./logs-pino";
  
  // Ensure clean directory
  if (fs.existsSync(logDir)) {
    fs.rmSync(logDir, { recursive: true });
  }
  fs.mkdirSync(logDir, { recursive: true });

  const logFile = path.join(logDir, "test.log");
  const destination = createWriteStream(logFile);
  
  const logger = pino(
    { level: "info" },
    destination
  );

  // Wait for stream to be ready
  await new Promise((resolve) => destination.on("open", resolve));
  
  console.log("=== Pino Logger Performance Benchmark ===\n");

  const TEST_SIZES = [10000, 100000, 500000];
  
  for (const totalLogs of TEST_SIZES) {
    console.log(`\n--- Testing ${totalLogs.toLocaleString()} logs ---`);
    
    // Clear file between tests
    if (fs.existsSync(logFile)) {
      fs.truncateSync(logFile);
    }

    // Test 1: Synchronous-style (fire and forget - Pino's specialty)
    console.log("Mode: Fire-and-forget (Pino's sync mode)");
    const fireStart = performance.now();
    const fireMemStart = process.memoryUsage();
    
    for (let i = 0; i < totalLogs; i++) {
      logger.info({ index: i }, "Performance test log entry");
    }
    
    // Pino is sync by default, but flush to be sure
    logger.flush();
    destination.flushSync?.();
    
    const fireTime = performance.now() - fireStart;
    const fireMemUsed = (process.memoryUsage().heapUsed - fireMemStart.heapUsed) / 1024 / 1024;
    
    console.log(`  Time: ${fireTime.toFixed(2)}ms`);
    console.log(`  Throughput: ${(totalLogs / fireTime * 1000).toLocaleString(undefined, {maximumFractionDigits: 0})} logs/sec`);
    console.log(`  Avg: ${(fireTime / totalLogs * 1000).toFixed(3)}μs per log`);
    console.log(`  Memory: ${fireMemUsed.toFixed(2)} MB`);

    // Test 2: Async/await style (if using async transport)
    if (totalLogs <= 100000) {
      fs.truncateSync(logFile);
      
      console.log("\nMode: Async with completion tracking");
      const asyncStart = performance.now();
      const asyncMemStart = process.memoryUsage();
      
      const promises = [];
      for (let i = 0; i < totalLogs; i++) {
        // Pino doesn't return promises, so we use setImmediate to yield
        if (i % 1000 === 0) {
          await new Promise(resolve => setImmediate(resolve));
        }
        logger.info({ index: i }, "Async test log entry");
      }
      
      // Ensure writes complete
      logger.flush();
      destination.flushSync?.();
      
      const asyncTime = performance.now() - asyncStart;
      const asyncMemUsed = (process.memoryUsage().heapUsed - asyncMemStart.heapUsed) / 1024 / 1024;
      
      console.log(`  Time: ${asyncTime.toFixed(2)}ms`);
      console.log(`  Throughput: ${(totalLogs / asyncTime * 1000).toLocaleString(undefined, {maximumFractionDigits: 0})} logs/sec`);
      console.log(`  Memory: ${asyncMemUsed.toFixed(2)} MB`);
    }

    // Test 3: Child logger (common pattern)
    if (totalLogs <= 100000) {
      fs.truncateSync(logFile);
      
      console.log("\nMode: Child logger (with bindings)");
      const child = logger.child({ component: "performance-test", requestId: "abc-123" });
      const childStart = performance.now();
      const childMemStart = process.memoryUsage();
      
      for (let i = 0; i < totalLogs; i++) {
        child.info({ index: i, userId: 12345 }, "Child logger test entry");
      }
      
      logger.flush();
      destination.flushSync?.();
      
      const childTime = performance.now() - childStart;
      const childMemUsed = (process.memoryUsage().heapUsed - childMemStart.heapUsed) / 1024 / 1024;
      
      console.log(`  Time: ${childTime.toFixed(2)}ms`);
      console.log(`  Throughput: ${(totalLogs / childTime * 1000).toLocaleString(undefined, {maximumFractionDigits: 0})} logs/sec`);
      console.log(`  Memory: ${childMemUsed.toFixed(2)} MB`);
    }
  }

  // Cleanup and validation
  console.log("\n\n=== Final Validation ===");
  
  destination.end();
  await new Promise(resolve => destination.on("finish", resolve));
  
  if (fs.existsSync(logFile)) {
    const stats = fs.statSync(logFile);
    const content = fs.readFileSync(logFile, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());
    const lastLine = lines[lines.length - 1];
    
    console.log(`Final file size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Total lines: ${lines.length.toLocaleString()}`);
    console.log(`Sample last line: ${lastLine?.substring(0, 100)}...`);
  }

  // Cleanup
  fs.rmSync(logDir, { recursive: true, force: true });
  console.log("\n=== Pino Benchmark Complete ===");
}

// Run with GC if available
if (global.gc) {
  console.log("Running with --expose-gc\n");
  global.gc();
}

runPinoPerformanceTest().catch(console.error);