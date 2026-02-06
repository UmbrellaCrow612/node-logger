const { RequestEncoder, METHOD, LOG_LEVEL } = require("../dist/protocol");

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

function assertDeepEqual(actual, expected, msg) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(`${msg}: expected ${expectedStr}, got ${actualStr}`);
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

// ==================== ENCODE TESTS ====================

// Test 1: Basic encoding
test("encodes a basic LOG request", () => {
  const request = {
    id: 1,
    method: METHOD.LOG, // FIXED: was METHOD: METHOD.LOG
    level: LOG_LEVEL.INFO,
    payload: "Hello World",
  };

  const buffer = encoder.encode(request);

  assertEqual(buffer.length, 19, "Buffer length"); // 8 + 11
  assertEqual(buffer.readUInt32BE(0), 1, "ID field");
  assertEqual(buffer[4], 0x01, "Method field");
  assertEqual(buffer[5], 0x01, "Level field");
  assertEqual(buffer.readUInt16BE(6), 11, "Payload length field");
  assertEqual(
    buffer.subarray(8).toString("utf-8"),
    "Hello World",
    "Payload content",
  );
});

// Test 2: Maximum ID
test("encodes with maximum valid ID", () => {
  const request = {
    id: 0xffffffff,
    method: METHOD.LOG, // FIXED: was METHOD: METHOD.LOG
    level: LOG_LEVEL.DEBUG,
    payload: "test",
  };

  const buffer = encoder.encode(request);
  assertEqual(buffer.readUInt32BE(0), 0xffffffff, "Max ID");
});

// Test 3: Different methods and levels
test("encodes FLUSH and RELOAD methods", () => {
  const flushReq = {
    id: 100,
    method: METHOD.FLUSH, // FIXED: was METHOD: METHOD.FLUSH
    level: LOG_LEVEL.WARN,
    payload: "flush please",
  };

  const reloadReq = {
    id: 101,
    method: METHOD.RELOAD, // FIXED: was METHOD: METHOD.RELOAD
    level: LOG_LEVEL.FATAL,
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
    method: METHOD.LOG, // FIXED: was METHOD: METHOD.LOG
    level: LOG_LEVEL.ERROR,
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
    method: METHOD.LOG, // FIXED: was METHOD: METHOD.LOG
    level: LOG_LEVEL.INFO,
    payload: "Hello 🌍 World",
  };

  const buffer = encoder.encode(request);
  const payloadStr = buffer.subarray(8).toString("utf-8");

  assertEqual(payloadStr, "Hello 🌍 World", "Unicode roundtrip");
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
    method: METHOD.LOG, // FIXED: was METHOD: METHOD.LOG
    level: LOG_LEVEL.INFO,
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
      method: METHOD.LOG, // FIXED: was METHOD: METHOD.LOG
      level: LOG_LEVEL.INFO,
      payload: "test",
    });
  }, "Invalid ID");
});

// Test 8: Invalid ID (too large)
test("throws on ID exceeding max", () => {
  assertThrows(() => {
    encoder.encode({
      id: 0x100000000,
      method: METHOD.LOG, // FIXED: was METHOD: METHOD.LOG
      level: LOG_LEVEL.INFO,
      payload: "test",
    });
  }, "Invalid ID");
});

// Test 9: Invalid method
test("throws on invalid method", () => {
  // FIXED: test name consistency
  assertThrows(() => {
    encoder.encode({
      id: 1,
      method: 0x99, // FIXED: was METHOD: 0x99
      level: LOG_LEVEL.INFO,
      payload: "test",
    });
  }, "Invalid method"); // FIXED: match case with implementation
});

// Test 10: Invalid level
test("throws on invalid level", () => {
  assertThrows(() => {
    encoder.encode({
      id: 1,
      method: METHOD.LOG, // FIXED: was METHOD: METHOD.LOG
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
      method: METHOD.LOG, // FIXED: was METHOD: METHOD.LOG
      level: LOG_LEVEL.INFO,
      payload: "x".repeat(65536),
    });
  }, "Payload too large");
});

// Test 12: Non-integer ID
test("throws on non-integer ID", () => {
  assertThrows(() => {
    encoder.encode({
      id: 1.5,
      method: METHOD.LOG, // FIXED: was METHOD: METHOD.LOG
      level: LOG_LEVEL.INFO,
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
    method: 0x10, // FIXED: was METHOD: 0x10
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
      method: METHOD.LOG, // FIXED: was METHOD: METHOD.LOG
      level: 0x30,
      payload: "test",
    });
  }, "Invalid method"); // FIXED: match case with implementation
});

// Test 14: Static header size
test("static header size method", () => {
  // FIXED: test name
  assertEqual(RequestEncoder.getHeaderSize(), 8, "Header size");
});

// ==================== DECODE TESTS ====================

// Test 15: Basic decode
test("decodes a basic LOG request", () => {
  const original = {
    id: 1,
    method: METHOD.LOG, // FIXED: was METHOD: METHOD.LOG
    level: LOG_LEVEL.INFO,
    payload: "Hello World",
  };

  const buffer = encoder.encode(original);
  const decoded = encoder.decode(buffer);

  assertDeepEqual(decoded, original, "Decoded matches original");
});

// Test 16: Decode roundtrip with all method/level combinations
test("decode roundtrip with all combinations", () => {
  const methods = [METHOD.LOG, METHOD.FLUSH, METHOD.RELOAD];
  const levels = [
    LOG_LEVEL.INFO,
    LOG_LEVEL.WARN,
    LOG_LEVEL.ERROR,
    LOG_LEVEL.DEBUG,
    LOG_LEVEL.FATAL,
  ];

  for (const m of methods) {
    for (const l of levels) {
      const original = {
        id: Math.floor(Math.random() * 1000000),
        method: m, // FIXED: was METHOD: m
        level: l,
        payload: `Method ${m} Level ${l}`,
      };

      const buffer = encoder.encode(original);
      const decoded = encoder.decode(buffer);

      assertDeepEqual(
        decoded,
        original,
        `Roundtrip for method=${m}, level=${l}`,
      );
    }
  }
});

// Test 17: Decode maximum ID
test("decodes maximum valid ID", () => {
  const original = {
    id: 0xffffffff,
    method: METHOD.LOG, // FIXED: was METHOD: METHOD.LOG
    level: LOG_LEVEL.DEBUG,
    payload: "max id test",
  };

  const buffer = encoder.encode(original);
  const decoded = encoder.decode(buffer);

  assertEqual(decoded.id, 0xffffffff, "Decoded max ID");
});

// Test 18: Decode empty payload
test("decodes empty payload", () => {
  const original = {
    id: 42,
    method: METHOD.LOG, // FIXED: was METHOD: METHOD.LOG
    level: LOG_LEVEL.ERROR,
    payload: "",
  };

  const buffer = encoder.encode(original);
  const decoded = encoder.decode(buffer);

  assertEqual(decoded.payload, "", "Decoded empty payload");
  assertDeepEqual(decoded, original, "Full empty payload roundtrip");
});

// Test 19: Decode unicode payload
test("decodes unicode payload correctly", () => {
  const original = {
    id: 7,
    method: METHOD.LOG, // FIXED: was METHOD: METHOD.LOG
    level: LOG_LEVEL.INFO,
    payload: "Hello 🌍 World 你好",
  };

  const buffer = encoder.encode(original);
  const decoded = encoder.decode(buffer);

  assertEqual(decoded.payload, "Hello 🌍 World 你好", "Unicode roundtrip");
  assertDeepEqual(decoded, original, "Full unicode roundtrip");
});

// Test 20: Decode maximum payload size
test("decodes maximum payload size", () => {
  const payload = "x".repeat(65535);
  const original = {
    id: 1,
    method: METHOD.LOG, // FIXED: was METHOD: METHOD.LOG
    level: LOG_LEVEL.INFO,
    payload,
  };

  const buffer = encoder.encode(original);
  const decoded = encoder.decode(buffer);

  assertEqual(decoded.payload.length, 65535, "Decoded max payload length");
  assertEqual(decoded.payload, payload, "Max payload content matches");
});

// Test 21: Decode throws on buffer too small
test("decode throws on buffer too small", () => {
  assertThrows(() => {
    encoder.decode(Buffer.from([0, 0, 0, 0, 0, 0, 0])); // 7 bytes
  }, "Buffer too small");
});

// Test 22: Decode throws on buffer size mismatch (too large)
test("decode throws on buffer larger than expected", () => {
  const buffer = encoder.encode({
    id: 1,
    method: METHOD.LOG, // FIXED: was METHOD: METHOD.LOG
    level: LOG_LEVEL.INFO,
    payload: "test",
  });

  // Append extra byte
  const oversized = Buffer.concat([buffer, Buffer.from([0x00])]);

  assertThrows(() => {
    encoder.decode(oversized);
  }, "Buffer size mismatch");
});

// Test 23: Decode throws on buffer size mismatch (too small)
test("decode throws on buffer smaller than expected", () => {
  const buffer = encoder.encode({
    id: 1,
    method: METHOD.LOG, // FIXED: was METHOD: METHOD.LOG
    level: LOG_LEVEL.INFO,
    payload: "test",
  });

  // Remove last byte
  const undersized = buffer.subarray(0, buffer.length - 1);

  assertThrows(() => {
    encoder.decode(undersized);
  }, "Buffer size mismatch");
});

// Test 24: Decode throws on invalid method
test("decode throws on invalid method", () => {
  // FIXED: test name consistency
  // Manually craft a buffer with invalid method
  const buffer = Buffer.alloc(12);
  buffer.writeUInt32BE(1, 0);
  buffer[4] = 0x99; // Invalid method
  buffer[5] = LOG_LEVEL.INFO;
  buffer.writeUInt16BE(4, 6);
  buffer.write("test", 8, "utf-8");

  assertThrows(() => {
    encoder.decode(buffer);
  }, "Invalid method"); // FIXED: match case with implementation
});

// Test 25: Decode throws on invalid level
test("decode throws on invalid level", () => {
  // Manually craft a buffer with invalid level
  const buffer = Buffer.alloc(12);
  buffer.writeUInt32BE(1, 0);
  buffer[4] = METHOD.LOG;
  buffer[5] = 0x99; // Invalid level
  buffer.writeUInt16BE(4, 6);
  buffer.write("test", 8, "utf-8");

  assertThrows(() => {
    encoder.decode(buffer);
  }, "Invalid level");
});

// Test 26: Decode respects custom valid methods/levels
test("decode respects custom valid methods/levels", () => {
  const customEncoder = new RequestEncoder(
    new Set([0x10, 0x20]),
    new Set([0x30]),
  );

  const original = {
    id: 1,
    method: 0x10, // FIXED: was METHOD: 0x10
    level: 0x30,
    payload: "custom",
  };

  const buffer = customEncoder.encode(original);
  const decoded = customEncoder.decode(buffer);

  assertDeepEqual(decoded, original, "Custom roundtrip");

  // Craft buffer with default method (invalid for custom encoder)
  const invalidBuffer = encoder.encode({
    id: 1,
    method: METHOD.LOG, // FIXED: was METHOD: METHOD.LOG
    level: LOG_LEVEL.INFO,
    payload: "test",
  });

  assertThrows(() => {
    customEncoder.decode(invalidBuffer);
  }, "Invalid method"); // FIXED: match case with implementation
});

// Test 27: Encode-decode symmetry stress test
test("encode-decode symmetry stress test", () => {
  for (let i = 0; i < 100; i++) {
    const original = {
      id: Math.floor(Math.random() * 0xffffffff),
      method: [METHOD.LOG, METHOD.FLUSH, METHOD.RELOAD][
        Math.floor(Math.random() * 3)
      ],
      level: [
        LOG_LEVEL.INFO,
        LOG_LEVEL.WARN,
        LOG_LEVEL.ERROR,
        LOG_LEVEL.DEBUG,
        LOG_LEVEL.FATAL,
      ][Math.floor(Math.random() * 5)],
      payload: `Test payload ${i} with some randomness ${Math.random()}`,
    };

    const buffer = encoder.encode(original);
    const decoded = encoder.decode(buffer);

    assertDeepEqual(decoded, original, `Iteration ${i} roundtrip`);
  }
});

console.log(
  "\n" + (process.exitCode ? "Some tests failed!" : "All tests passed!"),
);
