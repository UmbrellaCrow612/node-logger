const pino = require("pino");
const fs = require("node:fs");
const path = require("node:path");

async function main() {
  const startTime = performance.now();
  
  // Ensure clean test directory
  const logDir = "./test-logs-pino";
  if (fs.existsSync(logDir)) {
    fs.rmSync(logDir, { recursive: true });
  }
  fs.mkdirSync(logDir, { recursive: true });

  const logFile = path.join(logDir, "app.log");
  
  // Create pino logger with synchronous file destination
  const transport = pino.transport({
    target: 'pino/file',
    options: { 
      destination: logFile,
      sync: false // Async mode (default), use true for sync
    }
  });
  
  const logger = pino({
    level: 'info',
    base: null, // Remove default pid/hostname for fair comparison
    timestamp: pino.stdTimeFunctions.isoTime
  }, transport);

  // Wait for transport to be ready
  await new Promise((resolve, reject) => {
    transport.on('ready', resolve);
    transport.on('error', reject);
    // Fallback timeout
    setTimeout(resolve, 100);
  });

  console.log("Starting to write 10,000 log lines with Pino...");
  const writeStartTime = performance.now();

  for (let i = 0; i < 10000; i++) {
    logger.info("Request %d", i);
  }

  const writeEndTime = performance.now();
  const writeDuration = writeEndTime - writeStartTime;
  
  console.log(`Fire-and-forget writes completed in ${writeDuration.toFixed(2)}ms`);
  console.log(`Average write time: ${(writeDuration / 10000).toFixed(4)}ms per log`);
  console.log(`Throughput: ${(10000 / (writeDuration / 1000)).toFixed(0)} logs/second`);

  console.log("\nFlushing and closing...");
  const flushStartTime = performance.now();
  
  // Proper flush: use pino's built-in flush and wait for transport
  await new Promise((resolve, reject) => {
    // Flush the logger itself
    logger.flush();
    
    // Then flush and end the transport
    transport.flush((err) => {
      if (err) {
        reject(err);
        return;
      }
      
      // Give time for final writes, then end
      setImmediate(() => {
        transport.end(() => {
          resolve();
        });
      });
    });
  });
  
  const flushEndTime = performance.now();
  const flushDuration = flushEndTime - flushStartTime;
  const totalDuration = flushEndTime - startTime;

  console.log(`Flush completed in ${flushDuration.toFixed(2)}ms`);
  console.log(`\n=== TOTAL TIME: ${totalDuration.toFixed(2)}ms ===`);

  // Verification
  console.log("\n--- Verification ---");
  
  // Wait for filesystem sync
  await new Promise(r => setTimeout(r, 100));
  
  const files = fs.readdirSync(logDir).filter(f => f.endsWith('.log'));
  console.log(`Log files found: ${files.length}`);
  
  let totalLines = 0;
  let totalBytes = 0;
  const fileStats = [];

  for (const file of files) {
    const filePath = path.join(logDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim().length > 0);
    const stats = fs.statSync(filePath);
    
    totalLines += lines.length;
    totalBytes += stats.size;
    
    fileStats.push({
      name: file,
      lines: lines.length,
      sizeBytes: stats.size,
      sizeKB: (stats.size / 1024).toFixed(2)
    });
  }

  fileStats.forEach(f => {
    console.log(`  ${f.name}: ${f.lines} lines, ${f.sizeKB} KB`);
  });

  console.log("\n=== STATISTICS ===");
  console.log(`Total lines written: ${totalLines}`);
  console.log(`Total bytes written: ${totalBytes} (${(totalBytes / 1024).toFixed(2)} KB)`);
  console.log(`Average bytes per log: ${(totalBytes / totalLines).toFixed(2)}`);
  
  const success = totalLines === 10000;
  console.log(`\n${success ? '✅ PASS' : '❌ FAIL'}: Expected 10,000 lines, found ${totalLines}`);

  console.log("\n=== PERFORMANCE SUMMARY ===");
  console.log(`Total throughput: ${(10000 / (totalDuration / 1000)).toFixed(0)} logs/second (end-to-end)`);
  console.log(`Write throughput: ${(10000 / (writeDuration / 1000)).toFixed(0)} logs/second (fire-and-forget)`);
  console.log(`Flush overhead: ${flushDuration.toFixed(2)}ms`);

  // Cleanup
  if (fs.existsSync(logDir)) {
    fs.rmSync(logDir, { recursive: true });
  }
}

main().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});