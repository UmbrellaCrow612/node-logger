const { RequestEncoder, method, LogLevel } = require("../dist/protocol");

// Simple test runner
function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
  } catch (err) {
    console.error(`❌ ${name}`);
    console.error(`   ${err.message}`);
    process.exitCode = 1;
  }
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg}: expected ${expected}, got ${actual}`);
  }
}

function assertThrows(fn, expectedMsg) {
  try {
    fn();
    throw new Error(`Expected to throw but didn't`);
  } catch (err) {
    if (!err.message.includes(expectedMsg)) {
      throw new Error(
        `Expected error containing "${expectedMsg}", got "${err.message}"`,
      );
    }
  }
}

console.log("Running RequestEncoder tests...\n");

const encoder = new RequestEncoder();

// Test 1: Basic encoding
test("encodes a basic LOG request", () => {
  const request = {
    id: 1,
    method: method.LOG,
    level: LogLevel.INFO,
    payload: "Hello World",
  };

  const buffer = encoder.encode(request);

  assertEqual(buffer.length, 19, "Buffer length"); // 8 + 11
  assertEqual(buffer.readUInt32BE(0), 1, "ID field");
  assertEqual(buffer[4], 0x01, "Method field");
  assertEqual(buffer[5], 0x01, "Level field");
  assertEqual(buffer.readUInt16BE(6), 11, "Payload length field");
  assertEqual(
    buffer.slice(8).toString("utf-8"),
    "Hello World",
    "Payload content",
  );
});

// Test 2: Maximum ID
test("encodes with maximum valid ID", () => {
  const request = {
    id: 0xffffffff,
    method: method.LOG,
    level: LogLevel.DEBUG,
    payload: "test",
  };

  const buffer = encoder.encode(request);
  assertEqual(buffer.readUInt32BE(0), 0xffffffff, "Max ID");
});

// Test 3: Different methods and levels
test("encodes FLUSH and RELOAD methods", () => {
  const flushReq = {
    id: 100,
    method: method.FLUSH,
    level: LogLevel.WARN,
    payload: "flush please",
  };

  const reloadReq = {
    id: 101,
    method: method.RELOAD,
    level: LogLevel.FATAL,
    payload: "reload please",
  };

  const flushBuf = encoder.encode(flushReq);
  const reloadBuf = encoder.encode(reloadReq);

  assertEqual(flushBuf[4], 0x02, "FLUSH method byte");
  assertEqual(flushBuf[5], 0x02, "WARN level byte");
  assertEqual(reloadBuf[4], 0x03, "RELOAD method byte");
  assertEqual(reloadBuf[5], 0x05, "FATAL level byte");
});

// Test 4: Empty payload
test("encodes empty payload", () => {
  const request = {
    id: 42,
    method: method.LOG,
    level: LogLevel.ERROR,
    payload: "",
  };

  const buffer = encoder.encode(request);
  assertEqual(buffer.length, 8, "Header only length");
  assertEqual(buffer.readUInt16BE(6), 0, "Zero payload length");
});

// Test 5: Unicode/emoji payload (multi-byte UTF-8)
test("encodes unicode payload correctly", () => {
  const request = {
    id: 7,
    method: method.LOG,
    level: LogLevel.INFO,
    payload: "Hello 🌍 World",
  };

  const buffer = encoder.encode(request);
  const payloadStr = buffer.slice(8).toString("utf-8");

  assertEqual(payloadStr, "Hello 🌍 World", "Unicode roundtrip");
  // 🌍 is 4 bytes in UTF-8, so total payload is 13 + 4 - 1 = 16?
  // Actually: 'Hello ' (6) + 🌍 (4) + ' World' (6) = 16
  assertEqual(
    buffer.readUInt16BE(6),
    16,
    "Payload length accounts for multi-byte chars",
  );
});

// Test 6: Maximum payload size
test("encodes maximum payload size (65535 bytes)", () => {
  const payload = "x".repeat(65535);
  const request = {
    id: 1,
    method: method.LOG,
    level: LogLevel.INFO,
    payload,
  };

  const buffer = encoder.encode(request);
  assertEqual(buffer.length, 65543, "Total size (8 + 65535)");
  assertEqual(buffer.readUInt16BE(6), 65535, "Max payload length field");
});

// Test 7: Invalid ID (negative)
test("throws on negative ID", () => {
  assertThrows(() => {
    encoder.encode({
      id: -1,
      method: method.LOG,
      level: LogLevel.INFO,
      payload: "test",
    });
  }, "Invalid ID");
});

// Test 8: Invalid ID (too large)
test("throws on ID exceeding max", () => {
  assertThrows(() => {
    encoder.encode({
      id: 0x100000000,
      method: method.LOG,
      level: LogLevel.INFO,
      payload: "test",
    });
  }, "Invalid ID");
});

// Test 9: Invalid method
test("throws on invalid method", () => {
  assertThrows(() => {
    encoder.encode({
      id: 1,
      method: 0x99,
      level: LogLevel.INFO,
      payload: "test",
    });
  }, "Invalid method");
});

// Test 10: Invalid level
test("throws on invalid level", () => {
  assertThrows(() => {
    encoder.encode({
      id: 1,
      method: method.LOG,
      level: 0x99,
      payload: "test",
    });
  }, "Invalid level");
});

// Test 11: Payload too large
test("throws on payload exceeding max size", () => {
  assertThrows(() => {
    encoder.encode({
      id: 1,
      method: method.LOG,
      level: LogLevel.INFO,
      payload: "x".repeat(65536),
    });
  }, "Payload too large");
});

// Test 12: Non-integer ID
test("throws on non-integer ID", () => {
  assertThrows(() => {
    encoder.encode({
      id: 1.5,
      method: method.LOG,
      level: LogLevel.INFO,
      payload: "test",
    });
  }, "Invalid ID");
});

// Test 13: Custom valid methods/levels
test("accepts custom valid methods and levels", () => {
  const customEncoder = new RequestEncoder(
    new Set([0x10, 0x20]),
    new Set([0x30]),
  );

  const request = {
    id: 1,
    method: 0x10,
    level: 0x30,
    payload: "custom",
  };

  const buffer = customEncoder.encode(request);
  assertEqual(buffer[4], 0x10, "Custom method");
  assertEqual(buffer[5], 0x30, "Custom level");

  // Should reject defaults
  assertThrows(() => {
    customEncoder.encode({
      id: 1,
      method: method.LOG, // 0x01 not in custom set
      level: 0x30,
      payload: "test",
    });
  }, "Invalid method");
});

// Test 14: Static header size
test("static header size method", () => {
  assertEqual(RequestEncoder.getHeaderSize(), 8, "Header size");
});

console.log(
  "\n" + (process.exitCode ? "Some tests failed!" : "All tests passed!"),
);
