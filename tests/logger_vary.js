const { Logger } = require("../dist/index.js");
const fs = require("fs");
const path = require("path");

async function runPerformanceTest() {
  const logger = new Logger({ 
    basePath: "./logs",
    saveToLogFiles: true,
    outputToConsole: false
  });

  // Warm up - let the logger initialize
  await new Promise(resolve => setTimeout(resolve, 100));
  
  console.log("=== High-Performance Logger Benchmark ===\n");

  const TEST_SIZES = [1000, 10000, 50000];
  
  for (const totalLogs of TEST_SIZES) {
    console.log(`\n--- Testing ${totalLogs.toLocaleString()} logs ---`);
    
    // Clear previous logs for clean test
    const today = new Date().toISOString().split("T")[0];
    const logFile = path.join("./logs", `${today}.log`);
    if (fs.existsSync(logFile)) {
      fs.unlinkSync(logFile);
    }

    // Test 1: Sequential (backpressure-friendly)
    console.log("Mode: Sequential (await each write)");
    const seqStart = performance.now();
    const seqMemStart = process.memoryUsage();
    
    for (let i = 0; i < totalLogs; i++) {
      await logger.info(`Sequential log entry ${i}`);
    }
    
    await logger.flush();
    const seqTime = performance.now() - seqStart;
    const seqMemUsed = (process.memoryUsage().heapUsed - seqMemStart.heapUsed) / 1024 / 1024;
    
    console.log(`  Time: ${seqTime.toFixed(2)}ms`);
    console.log(`  Throughput: ${(totalLogs / seqTime * 1000).toFixed(0)} logs/sec`);
    console.log(`  Memory: ${seqMemUsed.toFixed(2)} MB`);

    // Clear for next test
    if (fs.existsSync(logFile)) fs.unlinkSync(logFile);
    await new Promise(resolve => setTimeout(resolve, 50));

    // Test 2: Fire-and-forget (max throughput, risk of memory buildup)
    console.log("\nMode: Fire-and-forget (no await)");
    const fireStart = performance.now();
    const fireMemStart = process.memoryUsage();
    
    const promises = [];
    for (let i = 0; i < totalLogs; i++) {
      promises.push(logger.info(`Fire-forget log entry ${i}`));
    }
    
    // Now await all completions
    await Promise.all(promises);
    await logger.flush();
    
    const fireTime = performance.now() - fireStart;
    const fireMemUsed = (process.memoryUsage().heapUsed - fireMemStart.heapUsed) / 1024 / 1024;
    
    console.log(`  Time: ${fireTime.toFixed(2)}ms`);
    console.log(`  Throughput: ${(totalLogs / fireTime * 1000).toFixed(0)} logs/sec`);
    console.log(`  Memory: ${fireMemUsed.toFixed(2)} MB`);

    // Test 3: Batched (optimal for high throughput)
    if (totalLogs <= 10000) {
      if (fs.existsSync(logFile)) fs.unlinkSync(logFile);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      console.log("\nMode: Batched (100 per batch)");
      const batchSize = 100;
      const batchStart = performance.now();
      const batchMemStart = process.memoryUsage();
      
      for (let batch = 0; batch < totalLogs / batchSize; batch++) {
        const batchPromises = [];
        for (let i = 0; i < batchSize; i++) {
          const idx = batch * batchSize + i;
          if (idx < totalLogs) {
            batchPromises.push(logger.info(`Batched log entry ${idx}`));
          }
        }
        await Promise.all(batchPromises);
      }
      
      await logger.flush();
      const batchTime = performance.now() - batchStart;
      const batchMemUsed = (process.memoryUsage().heapUsed - batchMemStart.heapUsed) / 1024 / 1024;
      
      console.log(`  Time: ${batchTime.toFixed(2)}ms`);
      console.log(`  Throughput: ${(totalLogs / batchTime * 1000).toFixed(0)} logs/sec`);
      console.log(`  Memory: ${batchMemUsed.toFixed(2)} MB`);
    }
  }

  // Final summary
  console.log("\n\n=== Final Summary ===");
  console.log("Checking final log file...");
  
  const today = new Date().toISOString().split("T")[0];
  const logFile = path.join("./logs", `${today}.log`);
  if (fs.existsSync(logFile)) {
    const stats = fs.statSync(logFile);
    const lineCount = fs.readFileSync(logFile, 'utf8').split('\n').length - 1;
    console.log(`File size: ${(stats.size / 1024).toFixed(2)} KB`);
    console.log(`Lines written: ${lineCount.toLocaleString()}`);
  }

  await logger.shutdown();
  console.log("\n=== Benchmark Complete ===");
}

// Run with GC exposure if available for cleaner memory readings
if (global.gc) {
  console.log("Running with --expose-gc for accurate memory measurements\n");
  global.gc();
}

runPerformanceTest().catch(console.error);