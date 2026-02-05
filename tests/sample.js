const { Logger } = require("../dist/logger");
const { LogLevel } = require("../dist/protocol");

console.log("=== 1. NO FILTER (default) ===");
const logger1 = new Logger({
 
});
logger1.debug("Debug message");
logger1.info("Info message");
logger1.warn("Warn message");
logger1.error("Error message");
logger1.fatal("Fatal message");

console.log("\n=== 2. minLevel: WARN (warnings and above) ===");
const logger2 = new Logger({
  timestampType: "short",
  minLevel: LogLevel.WARN,
});
logger2.debug("Debug message"); // FILTERED OUT
logger2.info("Info message"); // FILTERED OUT
logger2.warn("Warn message"); // SHOWN
logger2.error("Error message"); // SHOWN
logger2.fatal("Fatal message"); // SHOWN

console.log("\n=== 3. maxLevel: INFO (info and below) ===");
const logger3 = new Logger({
  timestampType: "short",
  maxLevel: LogLevel.INFO,
});
logger3.debug("Debug message"); // SHOWN
logger3.info("Info message"); // SHOWN
logger3.warn("Warn message"); // FILTERED OUT
logger3.error("Error message"); // FILTERED OUT
logger3.fatal("Fatal message"); // FILTERED OUT

console.log("\n=== 4. includeLevels: [ERROR, FATAL] (whitelist) ===");
const logger4 = new Logger({
  timestampType: "short",
  includeLevels: [LogLevel.ERROR, LogLevel.FATAL],
});
logger4.debug("Debug message"); // FILTERED OUT
logger4.info("Info message"); // FILTERED OUT
logger4.warn("Warn message"); // FILTERED OUT
logger4.error("Error message"); // SHOWN
logger4.fatal("Fatal message"); // SHOWN

console.log("\n=== 5. excludeLevels: [DEBUG, INFO] (blacklist) ===");
const logger5 = new Logger({
  timestampType: "short",
  excludeLevels: [LogLevel.DEBUG, LogLevel.INFO],
});
logger5.debug("Debug message"); // FILTERED OUT
logger5.info("Info message"); // FILTERED OUT
logger5.warn("Warn message"); // SHOWN
logger5.error("Error message"); // SHOWN
logger5.fatal("Fatal message"); // SHOWN

console.log("\n=== 6. Combined: minLevel INFO + maxLevel ERROR ===");
const logger6 = new Logger({
  timestampType: "short",
  minLevel: LogLevel.INFO,
  maxLevel: LogLevel.ERROR,
});
logger6.debug("Debug message"); // FILTERED OUT (below INFO)
logger6.info("Info message"); // SHOWN
logger6.warn("Warn message"); // SHOWN
logger6.error("Error message"); // SHOWN
logger6.fatal("Fatal message"); // FILTERED OUT (above ERROR)

console.log("\n=== 7. Custom filter: only errors with 'critical' ===");
const logger7 = new Logger({
  timestampType: "short",
  filter: (level, message) => {
    // Only allow ERROR or FATAL if message contains "critical"
    if (level === LogLevel.ERROR || level === LogLevel.FATAL) {
      return message.includes("critical");
    }
    // Allow all other levels
    return true;
  },
});
logger7.info("Info message"); // SHOWN
logger7.error("Regular error"); // FILTERED OUT (no "critical")
logger7.error("Critical system failure", new Error("critical")); // SHOWN
logger7.fatal("Fatal crash"); // FILTERED OUT (no "critical")
logger7.fatal("Critical fatal error"); // SHOWN

console.log("\n=== 8. Complex filter: errors only on weekends ===");
const logger8 = new Logger({
  timestampType: "short",
  filter: (level, message) => {
    const today = new Date();
    const isWeekend = today.getDay() === 0 || today.getDay() === 6;

    // On weekends, log everything
    if (isWeekend) return true;

    // On weekdays, only log warnings and above
    return (
      level === LogLevel.WARN ||
      level === LogLevel.ERROR ||
      level === LogLevel.FATAL
    );
  },
});
logger8.debug("Weekday debug - only shows on weekends");
logger8.warn("Weekday warn - always shows");

console.log("\n=== 9. Filter with metadata check ===");
const logger9 = new Logger({
  timestampType: "short",
  filter: (level, message) => {
    // Block logs containing sensitive keywords
    const sensitive = ["password", "secret", "token", "key"];
    const hasSensitive = sensitive.some((word) =>
      message.toLowerCase().includes(word),
    );
    if (hasSensitive) {
      console.log("[FILTER BLOCKED: sensitive content]");
      return false;
    }
    return true;
  },
});
logger9.info("User login successful"); // SHOWN
logger9.info("User password: secret123"); // FILTERED OUT
logger9.error("API token: abc123"); // FILTERED OUT
logger9.error("Connection failed"); // SHOWN

console.log("\n=== 10. Production config example ===");
const prodLogger = new Logger({
  timestampType: "iso",
  minLevel: LogLevel.INFO,
  excludeLevels: [LogLevel.DEBUG],
  filter: (level, message) => {
    // In production, filter out noisy health checks
    if (message.includes("/health") || message.includes("/ping")) {
      return false;
    }
    return true;
  },
});
prodLogger.debug("Debug - filtered by minLevel"); // FILTERED OUT
prodLogger.info("Server started on port 3000"); // SHOWN
prodLogger.info("GET /health 200 OK"); // FILTERED OUT by custom filter
prodLogger.error("Database connection failed"); // SHOWN
