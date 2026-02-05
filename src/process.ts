/**
 * Separate process spawned to handle log writing, batching and file rotation
 */

import fs from "node:fs";
import path from "node:path";
import {
  method,
  Request,
  RequestEncoder,
  Response,
  ResponseEncoder,
  ProtocolError,
} from "./protocol";

// Configuration
const BATCH_SIZE = 100; // Max lines before flush
const FLUSH_INTERVAL_MS = 1000; // Max time before flush
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB rotation

// State
let currentLogPath: string | null = null;
let writeStream: fs.WriteStream | null = null;
let batchBuffer: string[] = [];
let batchTimeout: NodeJS.Timeout | null = null;
let currentFileSize = 0;
let isClosing = false;

// Encoders
const requestEncoder = new RequestEncoder();
const responseEncoder = new ResponseEncoder();

/**
 * Get current date string for log filename
 */
function getLogFileName(): string {
  const now = new Date();
  const date = now.toISOString().split("T")[0]; // YYYY-MM-DD
  return `app-${date}.log`;
}

/**
 * Ensure log directory exists
 */
function ensureDirectory(basePath: string): void {
  fs.mkdirSync(basePath, { recursive: true });
}

/**
 * Open or rotate log file
 */
function openLogFile(basePath: string): void {
  // Close existing stream
  if (writeStream) {
    writeStream.end();
    writeStream = null;
  }

  ensureDirectory(basePath);
  const fileName = getLogFileName();
  currentLogPath = path.join(basePath, fileName);

  // Check if file exists and get size for rotation
  try {
    const stats = fs.statSync(currentLogPath);
    currentFileSize = stats.size;
  } catch {
    currentFileSize = 0;
  }

  // Open new stream in append mode
  writeStream = fs.createWriteStream(currentLogPath, { flags: "a" });
  writeStream.on("error", (err) => {
    process.stderr.write(`Log stream error: ${err.message}\n`);
  });
}

/**
 * Rotate file if it exceeds max size
 */
function rotateIfNeeded(basePath: string): void {
  if (currentFileSize >= MAX_FILE_SIZE_BYTES) {
    const timestamp = Date.now();
    const rotatedName = `${currentLogPath}.${timestamp}`;
    try {
      fs.renameSync(currentLogPath!, rotatedName);
    } catch (err) {
      process.stderr.write(`Failed to rotate log: ${(err as Error).message}\n`);
    }
    openLogFile(basePath);
  }
}

/**
 * Write batch buffer to file
 */
function flushBuffer(basePath: string): void {
  if (batchBuffer.length === 0 || !writeStream) return;

  const data = batchBuffer.join("\n") + "\n";
  const bytes = Buffer.byteLength(data, "utf-8");

  // Check rotation before writing
  rotateIfNeeded(basePath);

  writeStream.write(data, (err) => {
    if (err) {
      process.stderr.write(`Write error: ${err.message}\n`);
    } else {
      currentFileSize += bytes;
    }
  });

  batchBuffer = [];

  if (batchTimeout) {
    clearTimeout(batchTimeout);
    batchTimeout = null;
  }
}

/**
 * Schedule automatic flush
 */
function scheduleFlush(basePath: string): void {
  if (batchTimeout) return;

  batchTimeout = setTimeout(() => {
    flushBuffer(basePath);
  }, FLUSH_INTERVAL_MS);
}

/**
 * Handle incoming log request
 */
function handleLog(basePath: string, payload: string): void {
  if (isClosing) return;

  batchBuffer.push(payload);

  // Flush immediately if batch is full
  if (batchBuffer.length >= BATCH_SIZE) {
    flushBuffer(basePath);
  } else {
    scheduleFlush(basePath);
  }
}

/**
 * Handle flush request - force write pending logs
 */
function handleFlush(basePath: string): void {
  flushBuffer(basePath);

  // Ensure stream is flushed to disk
  if (writeStream) {
    writeStream.write("", () => {
      // fsync would go here if we had fd access
    });
  }
}

/**
 * Handle reload request - close and reopen file (for rotation)
 */
function handleReload(basePath: string): void {
  flushBuffer(basePath);
  openLogFile(basePath);
}

/**
 * Send response back to parent process
 */
function sendResponse(response: Response): void {
  try {
    const buffer = responseEncoder.encode(response);
    process.stdout.write(buffer);
  } catch (err) {
    process.stderr.write(
      `Failed to encode response: ${(err as Error).message}\n`,
    );
  }
}

/**
 * Process a single request
 */
function processRequest(basePath: string, request: Request): void {
  let success = true;

  try {
    switch (request.method) {
      case method.LOG:
        handleLog(basePath, request.payload);
        break;

      case method.FLUSH:
        handleFlush(basePath);
        break;

      case method.RELOAD:
        handleReload(basePath);
        break;

      default:
        success = false;
        process.stderr.write(`Unknown method: ${request.method}\n`);
    }
  } catch (err) {
    success = false;
    process.stderr.write(`Request error: ${(err as Error).message}\n`);
  }

  // Send response back
  sendResponse({
    id: request.id,
    method: request.method,
    level: request.level,
    success,
  });
}

/**
 * Main entry point
 */
async function main() {
  const basePath = process.env["LOG_BASE_PATH"] || process.argv[2] || "./logs";

  openLogFile(basePath);

  // Buffer for accumulating binary data
  let buffer = Buffer.alloc(0);
  const headerSize = RequestEncoder.getRequestSize(); // Request header size

  // Handle stdin data
  process.stdin.on("data", (data: Buffer) => {
    buffer = Buffer.concat([buffer, data]);

    // Process complete requests
    while (buffer.length >= headerSize) {
      try {
        // Try to decode - this validates header and extracts payload length
        const request = requestEncoder.decode(buffer);
        const fullMessageSize =
          headerSize + Buffer.byteLength(request.payload, "utf-8");

        // Remove processed bytes from buffer
        buffer = buffer.subarray(fullMessageSize);

        // Process the request
        processRequest(basePath, request);
      } catch (err) {
        if (err instanceof ProtocolError) {
          // Incomplete data or malformed - wait for more or resync
          if ((err as ProtocolError).message.includes("Buffer too small")) {
            break; // Wait for more data
          }

          // Malformed data - try to resync by removing first byte
          process.stderr.write(`Protocol error: ${(err as Error).message}\n`);
          buffer = buffer.subarray(1);
        } else {
          throw err;
        }
      }
    }
  });

  // Handle cleanup
  process.on("SIGTERM", () => {
    isClosing = true;
    flushBuffer(basePath);
    if (writeStream) {
      writeStream.end(() => {
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  });

  process.on("SIGINT", () => {
    isClosing = true;
    flushBuffer(basePath);
    if (writeStream) {
      writeStream.end(() => {
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  });
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err.message}\n`);
  process.exit(1);
});
