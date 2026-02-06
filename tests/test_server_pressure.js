const path = require("node:path");
const fs = require("node:fs");
const {
  RequestEncoder,
  ResponseEncoder,
  METHOD,
  LOG_LEVEL,
} = require("../dist/protocol");
const { spawn } = require("node:child_process");
const assert = require("node:assert");

const serverPath = path.resolve(__dirname, "../", "dist", "server.js");
const testLogDir = path.resolve(__dirname, "../", "test-logs-stress");
const NUM_LINES = 10000;

// Clean up test logs before/after
const cleanup = () => {
  if (fs.existsSync(testLogDir)) {
    fs.rmSync(testLogDir, { recursive: true, force: true });
  }
};

cleanup();

const requestEncoder = new RequestEncoder();
const responseEncoder = new ResponseEncoder();

// Spawn server with test log directory
const child = spawn("node", [serverPath], {
  env: { ...process.env, BASE_PATH: testLogDir },
  stdio: ["pipe", "pipe", "pipe"],
});

let responseBuffer = Buffer.alloc(0);
const pendingRequests = new Map();
let requestId = 1;
let responsesReceived = 0;
let linesWritten = 0;

// Collect responses
child.stdout.on("data", (chunk) => {
  responseBuffer = Buffer.concat([responseBuffer, chunk]);

  while (responseBuffer.length >= 8) {
    const response = responseEncoder.decode(responseBuffer.subarray(0, 8));
    responseBuffer = responseBuffer.subarray(8);

    const pending = pendingRequests.get(response.id);
    if (pending) {
      pendingRequests.delete(response.id);
      pending.resolve(response);
    }
    responsesReceived++;
  }
});

child.stderr.on("data", (data) => {
  console.error("Server stderr:", data.toString());
});

// Fire-and-forget request (no waiting for response)
function sendRequestFast(method, level, payload = "") {
  const id = requestId++;
  const request = {
    id,
    method,
    level,
    payload,
  };

  const promise = new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });

    // Timeout after 30 seconds for stress test
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error(`Request ${id} timed out`));
      }
    }, 30000);
  });

  child.stdin.write(requestEncoder.encode(request));
  return promise;
}

// Helper to read log file content
function getLogContent() {
  const today = new Date().toISOString().split("T")[0];
  const logFile = path.join(testLogDir, `${today}.log`);
  if (!fs.existsSync(logFile)) return "";
  return fs.readFileSync(logFile, "utf-8");
}

function countLines(content) {
  return content.split("\n").filter((line) => line.length > 0).length;
}

async function runStressTest() {
  console.log(`Starting stress test: ${NUM_LINES} lines...\n`);

  // Wait for server to start
  await new Promise((r) => setTimeout(r, 100));

  const startTime = Date.now();

  try {
    // Send all 10k lines as fast as possible (fire-and-forget style)
    console.log("Sending 10,000 LOG requests as fast as possible...");

    const promises = [];
    for (let i = 0; i < NUM_LINES; i++) {
      const line = `STRESS_TEST_LINE_${i}_${"X".repeat(50)}\n`;
      promises.push(sendRequestFast(METHOD.LOG, LOG_LEVEL.INFO, line));
      linesWritten++;

      // Every 1000 lines, log progress
      if (i % 1000 === 0 && i > 0) {
        console.log(`  Sent ${i} lines...`);
      }
    }

    console.log(`All ${NUM_LINES} lines sent in ${Date.now() - startTime}ms`);
    console.log("Waiting for responses...");

    // Wait for all responses to come back
    await Promise.all(promises);

    const sendTime = Date.now() - startTime;
    console.log(`All responses received in ${sendTime}ms`);
    console.log(
      `Throughput: ${Math.round(NUM_LINES / (sendTime / 1000))} lines/sec\n`,
    );

    // Flush to ensure everything is written
    console.log("Sending FLUSH...");
    await sendRequestFast(METHOD.FLUSH, LOG_LEVEL.INFO);

    // Wait for flush to complete
    await new Promise((r) => setTimeout(r, 500));

    // Verify log file
    console.log("Verifying log file...");
    const content = getLogContent();
    const lineCount = countLines(content);

    console.log(`Lines in file: ${lineCount}`);
    console.log(`Expected: ${NUM_LINES}`);
    console.log(`Responses received: ${responsesReceived}`);

    // Check that all lines are present
    assert.strictEqual(
      lineCount,
      NUM_LINES,
      `Expected ${NUM_LINES} lines, got ${lineCount}`,
    );

    // Verify content integrity - check first, middle, and last lines
    assert(content.includes("STRESS_TEST_LINE_0_"), "First line missing");
    assert(
      content.includes(`STRESS_TEST_LINE_${Math.floor(NUM_LINES / 2)}_`),
      "Middle line missing",
    );
    assert(
      content.includes(`STRESS_TEST_LINE_${NUM_LINES - 1}_`),
      "Last line missing",
    );

    console.log("✓ All lines present and accounted for\n");

    // Check for ordering - lines should be in order (approximately)
    const lines = content.split("\n").filter((l) => l.length > 0);
    let inOrder = true;
    let lastNum = -1;

    for (const line of lines) {
      const match = line.match(/STRESS_TEST_LINE_(\d+)_/);
      if (match) {
        const num = parseInt(match[1]);
        if (num < lastNum) {
          inOrder = false;
          break;
        }
        lastNum = num;
      }
    }

    console.log(
      `Ordering preserved: ${inOrder ? "YES ✓" : "NO (acceptable due to async nature)"}`,
    );

    // Shutdown gracefully
    console.log("\nSending SHUTDOWN...");
    await sendRequestFast(METHOD.SHUTDOWN, LOG_LEVEL.INFO);

    await new Promise((resolve) => {
      child.on("exit", (code) => {
        assert.strictEqual(code, 0);
        console.log("✓ Server exited cleanly\n");
        resolve();
      });
    });

    // Final verification after shutdown
    const finalContent = getLogContent();
    const finalLineCount = countLines(finalContent);
    assert.strictEqual(finalLineCount, NUM_LINES);

    console.log("Stress test PASSED! ✅");
    console.log(`Total time: ${Date.now() - startTime}ms`);
    console.log(
      `Average: ${Math.round(NUM_LINES / ((Date.now() - startTime) / 1000))} lines/sec`,
    );
  } catch (error) {
    console.error("Stress test failed:", error);
    child.kill();
    process.exit(1);
  } finally {
    cleanup();
  }
}

// Handle cleanup on interrupt
process.on("SIGINT", () => {
  console.log("\nCaught interrupt, cleaning up...");
  child.kill();
  cleanup();
  process.exit(1);
});

runStressTest();
