const path = require("node:path");
const fs = require("node:fs");
const { RequestEncoder, ResponseEncoder, METHOD, LOG_LEVEL } = require("../dist/protocol");
const { spawn } = require("node:child_process");
const assert = require("node:assert");

const serverPath = path.resolve(__dirname, "../", "dist", "server.js");
const testLogDir = path.resolve(__dirname, "../", "test-logs");

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
  }
});

child.stderr.on("data", (data) => {
  console.error("Server stderr:", data.toString());
});

// Helper to send request and wait for response
function sendRequest(method, level, payload = "") {
  return new Promise((resolve, reject) => {
    const id = requestId++;
    const request = {
      id,
      method,
      level,
      payload,
    };
    
    pendingRequests.set(id, { resolve, reject });
    
    // Timeout after 5 seconds
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error(`Request ${id} timed out`));
      }
    }, 5000);
    
    child.stdin.write(requestEncoder.encode(request));
  });
}

// Helper to read log file content
function getLogContent() {
  const today = new Date().toISOString().split("T")[0];
  const logFile = path.join(testLogDir, `${today}.log`);
  if (!fs.existsSync(logFile)) return "";
  return fs.readFileSync(logFile, "utf-8");
}

async function runTests() {
  console.log("Starting tests...\n");
  
  // Wait for server to start
  await new Promise((r) => setTimeout(r, 100));
  
  try {
    // Test 1: Basic LOG
    console.log("Test 1: Basic LOG");
    const log1 = "Hello World\n";
    const resp1 = await sendRequest(METHOD.LOG, LOG_LEVEL.INFO, log1);
    assert.strictEqual(resp1.success, true);
    assert.strictEqual(resp1.method, METHOD.LOG);
    console.log("✓ LOG request succeeded\n");
    
    // Test 2: Multiple LOGs
    console.log("Test 2: Multiple LOGs");
    for (let i = 0; i < 5; i++) {
      const resp = await sendRequest(METHOD.LOG, LOG_LEVEL.INFO, `Line ${i}\n`);
      assert.strictEqual(resp.success, true);
    }
    console.log("✓ Multiple LOGs succeeded\n");
    
    // Test 3: FLUSH
    console.log("Test 3: FLUSH");
    const flushResp = await sendRequest(METHOD.FLUSH, LOG_LEVEL.INFO);
    assert.strictEqual(flushResp.success, true);
    assert.strictEqual(flushResp.method, METHOD.FLUSH);
    console.log("✓ FLUSH request succeeded\n");
    
    // Wait for flush and check file
    await new Promise((r) => setTimeout(r, 200));
    const content = getLogContent();
    assert(content.includes("Hello World"));
    assert(content.includes("Line 0"));
    assert(content.includes("Line 4"));
    console.log("✓ Log file contains expected content\n");
    
    // Test 4: RELOAD (file rotation)
    console.log("Test 4: RELOAD");
    const reloadResp = await sendRequest(METHOD.RELOAD, LOG_LEVEL.INFO);
    assert.strictEqual(reloadResp.success, true);
    assert.strictEqual(reloadResp.method, METHOD.RELOAD);
    console.log("✓ RELOAD request succeeded\n");
    
    // Test 5: LOG after RELOAD
    console.log("Test 5: LOG after RELOAD");
    const afterReload = await sendRequest(METHOD.LOG, LOG_LEVEL.WARN, "After reload\n");
    assert.strictEqual(afterReload.success, true);
    
    // Flush and verify
    await sendRequest(METHOD.FLUSH, LOG_LEVEL.INFO);
    await new Promise((r) => setTimeout(r, 200));
    
    const contentAfter = getLogContent();
    assert(contentAfter.includes("After reload"));
    console.log("✓ LOG after RELOAD works\n");
    
    // Test 6: Large payload
    console.log("Test 6: Large payload");
    const largePayload = "X".repeat(1000) + "\n";
    const largeResp = await sendRequest(METHOD.LOG, LOG_LEVEL.ERROR, largePayload);
    assert.strictEqual(largeResp.success, true);
    console.log("✓ Large payload handled\n");
    
    // Test 7: SHUTDOWN
    console.log("Test 7: SHUTDOWN");
    const shutdownResp = await sendRequest(METHOD.SHUTDOWN, LOG_LEVEL.INFO);
    assert.strictEqual(shutdownResp.success, true);
    assert.strictEqual(shutdownResp.method, METHOD.SHUTDOWN);
    console.log("✓ SHUTDOWN request succeeded\n");
    
    // Wait for process to exit
    await new Promise((resolve) => {
      child.on("exit", (code) => {
        assert.strictEqual(code, 0);
        console.log("✓ Server exited cleanly with code 0\n");
        resolve();
      });
    });
    
    // Final verification
    const finalContent = getLogContent();
    assert(finalContent.includes("After reload"));
    assert(finalContent.includes("XXXX")); // Large payload
    console.log("✓ All data persisted to disk\n");
    
    console.log("All tests passed! ✅");
    
  } catch (error) {
    console.error("Test failed:", error);
    child.kill();
    process.exit(1);
  } finally {
    cleanup();
  }
}

// Handle cleanup on interrupt
process.on("SIGINT", () => {
  child.kill();
  cleanup();
  process.exit(1);
});

runTests();