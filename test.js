const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { NodeLogger } = require("./dist/index");

// --- setup ---
const logger = new NodeLogger();

const INFO_COUNT = 10;
const infoMsg = "ded";
const warnMsg = "warn message";
const errorMsg = "error message";

// --- produce logs ---
for (let i = 0; i < INFO_COUNT; i++) {
  logger.info(infoMsg);
}

logger.warn(warnMsg);
logger.error(errorMsg);

// --- flush & verify ---
setTimeout(() => {
  logger.flush();

  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const logFilePath = path.join(__dirname, "logs", `${today}.log`);

  assert.ok(fs.existsSync(logFilePath), "Log file does not exist");

  const lines = fs
    .readFileSync(logFilePath, "utf8")
    .split("\n")
    .filter(Boolean);

  // --- count logs ---
  const infoLogs = lines.filter(
    l => l.includes("INFO") && l.endsWith(infoMsg)
  );

  const warnLogs = lines.filter(
    l => l.includes("WARN") && l.endsWith(warnMsg)
  );

  const errorLogs = lines.filter(
    l => l.includes("ERROR") && l.endsWith(errorMsg)
  );

  // --- assertions ---
  assert.strictEqual(
    infoLogs.length,
    INFO_COUNT,
    `Expected ${INFO_COUNT} INFO logs, found ${infoLogs.length}`
  );

  assert.strictEqual(
    warnLogs.length,
    1,
    `Expected 1 WARN log, found ${warnLogs.length}`
  );

  assert.strictEqual(
    errorLogs.length,
    1,
    `Expected 1 ERROR log, found ${errorLogs.length}`
  );

  console.log("✅ Logger test passed — correct log counts verified");

}, 5000);
