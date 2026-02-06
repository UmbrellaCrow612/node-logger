const fs = require("fs");
const path = require("path");
const { Logger } = require("../dist/logger");

async function main() {
  const basePath = "./logs";
  const logger = new Logger({ 
    showCallSite: true, 
    basePath: basePath,
    saveToLogFiles: true 
  });

  console.log("Starting to write 10,000 log lines...");
  const startTime = Date.now();

  // Write 10,000 log lines
  for (let i = 0; i < 10000; i++) {
    logger.info("log ", i);
  }

  await logger.flush();
  await logger.shutdown();

  const writeTime = Date.now() - startTime;
  console.log(`Finished writing in ${writeTime}ms`);

  // Verification
  console.log("\nVerifying log file...");
  
  // Get today's date for filename
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const logFileName = `${today}.log`;
  const logFilePath = path.join(basePath, logFileName);

  console.log(`Looking for log file: ${logFilePath}`);

  // Check if file exists
  if (!fs.existsSync(logFilePath)) {
    console.error(`ERROR: Log file not found at ${logFilePath}`);
    
    // List files in basePath to help debug
    if (fs.existsSync(basePath)) {
      const files = fs.readdirSync(basePath);
      console.log(`Files in ${basePath}:`, files);
    } else {
      console.error(`Base path ${basePath} does not exist`);
    }
    process.exit(1);
  }

  // Read and verify file
  const fileContent = fs.readFileSync(logFilePath, "utf8");
  const lines = fileContent.trim().split("\n").filter(line => line.length > 0);
  
  console.log(`Total lines in file: ${lines.length}`);

  // Verify each line format and count
  let validLines = 0;
  let errors = [];
  const seenNumbers = new Set();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check format: [file:line:col] [timestamp] [LEVEL]: message
    const formatRegex = /^\[[^\]]+:\d+:\d+\] \[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[(INFO|DEBUG|WARN|ERROR)\]: .+/;
    
    if (!formatRegex.test(line)) {
      errors.push(`Line ${i + 1}: Invalid format - ${line.substring(0, 100)}`);
      continue;
    }

    // Extract the log number (should be 0-9999)
    const match = line.match(/log\s+(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      seenNumbers.add(num);
      
      if (num < 0 || num >= 10000) {
        errors.push(`Line ${i + 1}: Number out of range - ${num}`);
      }
    } else {
      errors.push(`Line ${i + 1}: Could not extract log number`);
    }

    validLines++;
  }

  // Check for missing numbers
  const missingNumbers = [];
  for (let i = 0; i < 10000; i++) {
    if (!seenNumbers.has(i)) {
      missingNumbers.push(i);
    }
  }

  // Report results
  console.log("\n=== VERIFICATION RESULTS ===");
  console.log(`Expected lines: 10000`);
  console.log(`Actual lines: ${lines.length}`);
  console.log(`Valid format lines: ${validLines}`);
  console.log(`Unique log numbers found: ${seenNumbers.size}`);
  
  if (missingNumbers.length === 0) {
    console.log("✓ All numbers 0-9999 present");
  } else {
    console.log(`✗ Missing ${missingNumbers.length} numbers: ${missingNumbers.slice(0, 10).join(", ")}${missingNumbers.length > 10 ? "..." : ""}`);
  }

  if (errors.length === 0) {
    console.log("✓ No format errors found");
  } else {
    console.log(`✗ Found ${errors.length} errors:`);
    errors.slice(0, 5).forEach(err => console.log(`  - ${err}`));
    if (errors.length > 5) console.log(`  ... and ${errors.length - 5} more`);
  }

  // Final verdict
  if (lines.length === 10000 && missingNumbers.length === 0 && errors.length === 0) {
    console.log("\n✓✓✓ VERIFICATION PASSED ✓✓✓");
    console.log(`Log file: ${path.resolve(logFilePath)}`);
    console.log(`File size: ${(fs.statSync(logFilePath).size / 1024).toFixed(2)} KB`);
  } else {
    console.log("\n✗✗✗ VERIFICATION FAILED ✗✗✗");
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});