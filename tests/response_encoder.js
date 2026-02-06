const { ResponseEncoder, METHOD, LOG_LEVEL } = require("../dist/protocol");

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

console.log("Running ResponseEncoder tests...\n");

const encoder = new ResponseEncoder();

// ==================== ENCODE TESTS ====================

// Test 1: Basic encoding
test("encodes a basic LOG success response", () => {
  const response = {
    id: 1,
    method: METHOD.LOG,
    level: LOG_LEVEL.INFO,
    success: true,
  };

  const buffer = encoder.encode(response);

  assertEqual(buffer.length, 8, "Buffer length must be exactly 8 bytes");
  assertEqual(buffer.readUInt32BE(0), 1, "ID field");
  assertEqual(buffer[4], 0x01, "Method field");
  assertEqual(buffer[5], 0x01, "Level field");
  assertEqual(buffer[6], 1, "Success field (true = 1)");
  assertEqual(buffer[7], 0x00, "Reserved field (must be 0x00)");
});

// Test 2: Encode failure response
test("encodes a failure response", () => {
  const response = {
    id: 999,
    method: METHOD.FLUSH,
    level: LOG_LEVEL.ERROR,
    success: false,
  };

  const buffer = encoder.encode(response);

  assertEqual(buffer.length, 8, "Buffer length");
  assertEqual(buffer.readUInt32BE(0), 999, "ID field");
  assertEqual(buffer[4], 0x02, "Method field");
  assertEqual(buffer[5], 0x03, "Level field");
  assertEqual(buffer[6], 0, "Success field (false = 0)");
  assertEqual(buffer[7], 0x00, "Reserved field");
});

// Test 3: Maximum ID
test("encodes with maximum valid ID", () => {
  const response = {
    id: 0xffffffff,
    method: METHOD.RELOAD,
    level: LOG_LEVEL.FATAL,
    success: true,
  };

  const buffer = encoder.encode(response);
  assertEqual(buffer.readUInt32BE(0), 0xffffffff, "Max ID");
  assertEqual(buffer.length, 8, "Fixed size maintained");
});

// Test 4: ID zero
test("encodes with ID zero", () => {
  const response = {
    id: 0,
    method: METHOD.LOG,
    level: LOG_LEVEL.DEBUG,
    success: false,
  };

  const buffer = encoder.encode(response);
  assertEqual(buffer.readUInt32BE(0), 0, "Zero ID");
  assertEqual(buffer.length, 8, "Fixed size");
});

// Test 5: All method and level combinations
test("encodes all method/level combinations", () => {
  const methods = [METHOD.LOG, METHOD.FLUSH, METHOD.RELOAD];
  const levels = [
    LOG_LEVEL.INFO,
    LOG_LEVEL.WARN,
    LOG_LEVEL.ERROR,
    LOG_LEVEL.DEBUG,
    LOG_LEVEL.FATAL,
  ];

  for (const method of methods) {
    for (const level of levels) {
      const response = {
        id: 12345,
        method,
        level,
        success: true,
      };

      const buffer = encoder.encode(response);

      assertEqual(
        buffer.length,
        8,
        `Length for method=${method}, level=${level}`,
      );
      assertEqual(buffer[4], method, `Method byte for method=${method}`);
      assertEqual(buffer[5], level, `Level byte for level=${level}`);
      assertEqual(buffer[6], 1, `Success byte`);
      assertEqual(buffer[7], 0x00, `Reserved byte`);
    }
  }
});

// Test 6: Invalid ID (negative)
test("throws on negative ID", () => {
  assertThrows(() => {
    encoder.encode({
      id: -1,
      method: METHOD.LOG,
      level: LOG_LEVEL.INFO,
      success: true,
    });
  }, "Invalid ID");
});

// Test 7: Invalid ID (too large)
test("throws on ID exceeding max", () => {
  assertThrows(() => {
    encoder.encode({
      id: 0x100000000,
      method: METHOD.LOG,
      level: LOG_LEVEL.INFO,
      success: true,
    });
  }, "Invalid ID");
});

// Test 8: Non-integer ID
test("throws on non-integer ID", () => {
  assertThrows(() => {
    encoder.encode({
      id: 1.5,
      method: METHOD.LOG,
      level: LOG_LEVEL.INFO,
      success: true,
    });
  }, "Invalid ID");
});

// Test 9: Invalid method
test("throws on invalid method", () => {
  assertThrows(() => {
    encoder.encode({
      id: 1,
      method: 0x99,
      level: LOG_LEVEL.INFO,
      success: true,
    });
  }, "Invalid method");
});

// Test 10: Invalid level
test("throws on invalid level", () => {
  assertThrows(() => {
    encoder.encode({
      id: 1,
      method: METHOD.LOG,
      level: 0x99,
      success: true,
    });
  }, "Invalid level");
});

// Test 11: Custom valid methods/levels
test("accepts custom valid methods and levels", () => {
  const customEncoder = new ResponseEncoder(
    new Set([0x10, 0x20]),
    new Set([0x30, 0x40]),
  );

  const response = {
    id: 1,
    method: 0x10,
    level: 0x30,
    success: false,
  };

  const buffer = customEncoder.encode(response);
  assertEqual(buffer[4], 0x10, "Custom method");
  assertEqual(buffer[5], 0x30, "Custom level");
  assertEqual(buffer[6], 0, "Success false");

  // Should reject defaults
  assertThrows(() => {
    customEncoder.encode({
      id: 1,
      method: METHOD.LOG,
      level: 0x30,
      success: true,
    });
  }, "Invalid method");
});

// Test 12: Static header size
test("static header size method returns 8", () => {
  assertEqual(ResponseEncoder.getHeaderSize(), 8, "Header size");
});

// ==================== DECODE TESTS ====================

// Test 13: Basic decode
test("decodes a basic success response", () => {
  const original = {
    id: 1,
    method: METHOD.LOG,
    level: LOG_LEVEL.INFO,
    success: true,
  };

  const buffer = encoder.encode(original);
  const decoded = encoder.decode(buffer);

  assertDeepEqual(decoded, original, "Decoded matches original");
});

// Test 14: Decode failure response
test("decodes a failure response", () => {
  const original = {
    id: 999,
    method: METHOD.FLUSH,
    level: LOG_LEVEL.ERROR,
    success: false,
  };

  const buffer = encoder.encode(original);
  const decoded = encoder.decode(buffer);

  assertDeepEqual(decoded, original, "Decoded failure response matches");
  assertEqual(decoded.success, false, "Success is false");
});

// Test 15: Decode roundtrip with all combinations
test("decode roundtrip with all method/level combinations", () => {
  const methods = [METHOD.LOG, METHOD.FLUSH, METHOD.RELOAD];
  const levels = [
    LOG_LEVEL.INFO,
    LOG_LEVEL.WARN,
    LOG_LEVEL.ERROR,
    LOG_LEVEL.DEBUG,
    LOG_LEVEL.FATAL,
  ];

  for (const method of methods) {
    for (const level of levels) {
      for (const success of [true, false]) {
        const original = {
          id: Math.floor(Math.random() * 1000000),
          method,
          level,
          success,
        };

        const buffer = encoder.encode(original);
        const decoded = encoder.decode(buffer);

        assertDeepEqual(
          decoded,
          original,
          `Roundtrip for method=${method}, level=${level}, success=${success}`,
        );
      }
    }
  }
});

// Test 16: Decode maximum ID
test("decodes maximum valid ID", () => {
  const original = {
    id: 0xffffffff,
    method: METHOD.RELOAD,
    level: LOG_LEVEL.FATAL,
    success: true,
  };

  const buffer = encoder.encode(original);
  const decoded = encoder.decode(buffer);

  assertEqual(decoded.id, 0xffffffff, "Decoded max ID");
});

// Test 17: Decode zero ID
test("decodes zero ID", () => {
  const original = {
    id: 0,
    method: METHOD.LOG,
    level: LOG_LEVEL.DEBUG,
    success: false,
  };

  const buffer = encoder.encode(original);
  const decoded = encoder.decode(buffer);

  assertEqual(decoded.id, 0, "Decoded zero ID");
});

// Test 18: Decode throws on buffer too small
test("decode throws on buffer too small", () => {
  assertThrows(() => {
    encoder.decode(Buffer.from([0, 0, 0, 0, 0, 0, 0])); // 7 bytes
  }, "Invalid buffer size");
});

// Test 19: Decode throws on buffer too large
test("decode throws on buffer too large", () => {
  const buffer = encoder.encode({
    id: 1,
    method: METHOD.LOG,
    level: LOG_LEVEL.INFO,
    success: true,
  });

  // Append extra byte
  const oversized = Buffer.concat([buffer, Buffer.from([0x00])]);

  assertThrows(() => {
    encoder.decode(oversized);
  }, "Invalid buffer size");
});

// Test 20: Decode throws on invalid method
test("decode throws on invalid method", () => {
  // Manually craft a buffer with invalid method
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(1, 0);
  buffer[4] = 0x99; // Invalid method
  buffer[5] = LOG_LEVEL.INFO;
  buffer[6] = 1; // success = true
  buffer[7] = 0x00; // reserved

  assertThrows(() => {
    encoder.decode(buffer);
  }, "Invalid method");
});

// Test 21: Decode throws on invalid level
test("decode throws on invalid level", () => {
  // Manually craft a buffer with invalid level
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(1, 0);
  buffer[4] = METHOD.LOG;
  buffer[5] = 0x99; // Invalid level
  buffer[6] = 0; // success = false
  buffer[7] = 0x00; // reserved

  assertThrows(() => {
    encoder.decode(buffer);
  }, "Invalid level");
});

// Test 22: Decode respects custom valid methods/levels
test("decode respects custom valid methods/levels", () => {
  const customEncoder = new ResponseEncoder(
    new Set([0x10, 0x20]),
    new Set([0x30]),
  );

  const original = {
    id: 1,
    method: 0x10,
    level: 0x30,
    success: true,
  };

  const buffer = customEncoder.encode(original);
  const decoded = customEncoder.decode(buffer);

  assertDeepEqual(decoded, original, "Custom roundtrip");

  // Craft buffer with default method (invalid for custom encoder)
  const invalidBuffer = encoder.encode({
    id: 1,
    method: METHOD.LOG,
    level: LOG_LEVEL.INFO,
    success: true,
  });

  assertThrows(() => {
    customEncoder.decode(invalidBuffer);
  }, "Invalid method");
});

// Test 23: Encode-decode symmetry stress test
test("encode-decode symmetry stress test", () => {
  const methods = [METHOD.LOG, METHOD.FLUSH, METHOD.RELOAD];
  const levels = [
    LOG_LEVEL.INFO,
    LOG_LEVEL.WARN,
    LOG_LEVEL.ERROR,
    LOG_LEVEL.DEBUG,
    LOG_LEVEL.FATAL,
  ];

  for (let i = 0; i < 100; i++) {
    const original = {
      id: Math.floor(Math.random() * 0xffffffff),
      method: methods[Math.floor(Math.random() * methods.length)],
      level: levels[Math.floor(Math.random() * levels.length)],
      success: Math.random() > 0.5,
    };

    const buffer = encoder.encode(original);
    const decoded = encoder.decode(buffer);

    assertDeepEqual(decoded, original, `Iteration ${i} roundtrip`);
  }
});

// Test 24: Success field edge cases (non-boolean truthy/falsy)
test("handles success field type coercion", () => {
  // Test that truthy values encode to 1
  const truthyResponse = {
    id: 1,
    method: METHOD.LOG,
    level: LOG_LEVEL.INFO,
    success: "yes", // truthy
  };

  const buffer1 = encoder.encode(truthyResponse);
  assertEqual(buffer1[6], 1, "Truthy success encodes to 1");

  // Test that falsy values encode to 0
  const falsyResponse = {
    id: 2,
    method: METHOD.LOG,
    level: LOG_LEVEL.INFO,
    success: "", // falsy
  };

  const buffer2 = encoder.encode(falsyResponse);
  assertEqual(buffer2[6], 0, "Falsy success encodes to 0");
});

// Test 25: Buffer is exactly 8 bytes (no extra allocation)
test("encoded buffer is exactly 8 bytes", () => {
  const response = {
    id: 0xdeadbeef,
    method: METHOD.RELOAD,
    level: LOG_LEVEL.FATAL,
    success: true,
  };

  const buffer = encoder.encode(response);

  assertEqual(buffer.length, 8, "Buffer length");
  assertEqual(buffer.byteLength, 8, "Buffer byte length");

  // Verify all bytes are written correctly
  assertEqual(buffer[0], 0xde, "Byte 0");
  assertEqual(buffer[1], 0xad, "Byte 1");
  assertEqual(buffer[2], 0xbe, "Byte 2");
  assertEqual(buffer[3], 0xef, "Byte 3");
  assertEqual(buffer[4], 0x03, "Byte 4 (RELOAD)");
  assertEqual(buffer[5], 0x05, "Byte 5 (FATAL)");
  assertEqual(buffer[6], 0x01, "Byte 6 (success)");
  assertEqual(buffer[7], 0x00, "Byte 7 (reserved)");
});

console.log(
  "\n" + (process.exitCode ? "Some tests failed!" : "All tests passed!"),
);
