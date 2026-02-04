/**
 * This is a self contained script that is spawend using the main node logger class as a sidecar to offload the writing logs to a log file to a serpate process
 */

import type types = require("./types");
import fs = require("fs");
import path = require("path");

/**
 * Holds args passed to the CLI
 */
const args = process.argv.slice(2);

/**
 * Options for how the process should act
 */
const options: types.NodeProcessOptions = {
  basePath: "",
  startedUtc: new Date().toUTCString(),
  outputResponse: false,
};

/**
 * Buffer for stdin data
 */
let buffer = Buffer.alloc(0);

/**
 * How much we store beofre we flush
 */
const BATCH_SIZE = 1000;

/**
 * How long we wait and collect logs beofre flushing
 */
const FLUSH_MS = 50;

/**
 * Holds the messages we add to thje log file
 */
let batch: string[] = [];

/**
 * The timer used to run flush batches
 */
let timer: NodeJS.Timeout | null = null;

/**
 * The stream to write to the file
 */
let writeStream: fs.WriteStream | null = null;

/**
 * Write the data to the file stream
 *
 */
function flushBatch() {
  console.log("Flush being ran");
  if (batch.length === 0) return;

  const data = batch.join("\n") + "\n";
  writeStream?.write(data);
  batch = [];

  stopTimer();
}

/** Stop the timer for flush */
function stopTimer() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

/**
 * Starts the flush timer to be called when it's ready
 */
function startTimer() {
  if (timer) return;
  timer = setTimeout(() => {
    flushBatch();
    timer = null;
  }, FLUSH_MS);
}

/**
 * Loops through args and looks for flags and extracts and sets there values
 */
function setOptionValues() {
  for (const arg of args) {
    if (arg.startsWith("--basePath=")) {
      options.basePath = path.resolve(arg.split("=")[1] ?? "");
    }
  }
}

/**
 * Validate the arg values to make sure they are valid
 */
function validateOptions() {
  if (!options.basePath || options.basePath == "") {
    console.error("Error: --basePath is required");
    console.error("Usage: --basePath=/some/path");
    process.exit(1);
  }
}

/**
 * Sync create the base folder path if it does not exit
 */
function createBasePath() {
  try {
    if (!fs.existsSync(options.basePath)) {
      fs.mkdirSync(options.basePath, { recursive: true });
    }
  } catch (error) {
    console.error("Failed to make base dir");
    console.error(error);
    process.exit(1);
  }
}

/**
 * Gets todays log file path in format YYYY-MM-DD and returns a string for example `c:/dev/logs/2026-01.23.log`
 */
function getTodaysLogFile(): string {
  const today = new Date().toISOString().split("T")[0];
  return path.join(options.basePath, `${today}.log`);
}

/**
 * Send response back to stdout
 */
function sendResponse(response: types.NodeProcessResponse) {
  if (options.outputResponse) {
    const json = JSON.stringify(response);
    const header = `Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n`;
    process.stdout.write(header + json);
  }
}

/**
 * Handle a request
 */
function handleRequest(req: types.NodeProcessRequest) {
  try {
    if (!req || typeof req !== "object")
      throw new Error("Invalid request object");

    const { id, method, data } = req;

    if (typeof id !== "number") throw new Error("Invalid or missing id");
    if (typeof method !== "string")
      throw new Error("Invalid or missing method");

    switch (method) {
      case "log":
        const logText = String(data);

        batch.push(logText);

        if (batch.length >= BATCH_SIZE) {
          flushBatch();
        } else {
          startTimer();
        }

        sendResponse({
          id,
          method,
          success: true,
          error: null,
          message: "queued",
        });
        break;

      case "flush":
        flushBatch();
        stopTimer();

        process.stdin.removeAllListeners(); // stops process hanging
        process.stdin.destroy();

        writeStream?.end(); // stops process hanging
        writeStream?.destroy();

        sendResponse({
          id,
          method,
          success: true,
          error: null,
          message: "flushed and closed",
        });

        process.stdout.removeAllListeners(); // stops process hanging
        process.stdout.destroy();
        break;

      case "reload":
        flushBatch();
        writeStream?.end();
        writeStream = fs.createWriteStream(getTodaysLogFile(), { flags: "a" });

        sendResponse({
          id,
          method,
          success: true,
          error: null,
          message: "reloaded",
        });
        break;

      default:
        throw new Error("Unknown method: " + method);
    }
  } catch (err) {
    sendResponse({
      id: (req as any)?.id ?? -1,
      method: (req as any)?.method ?? "unknown",
      success: false,
      error: err instanceof Error ? err.message : String(err),
      message: null,
    });
  }
}

/**
 * Parses the buffer for complete messages
 */
function parseBuffer() {
  while (true) {
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd === -1) break;

    const header = buffer.subarray(0, headerEnd).toString();
    const match = header.match(/Content-Length:\s*(\d+)/i);

    if (!match) {
      buffer = buffer.subarray(headerEnd + 4);
      continue;
    }

    const contentLength = parseInt(match[1] as any, 10);
    const bodyStart = headerEnd + 4;

    if (buffer.length < bodyStart + contentLength) break;

    const body = buffer
      .subarray(bodyStart, bodyStart + contentLength)
      .toString();
    buffer = Buffer.from(buffer.subarray(bodyStart + contentLength));

    try {
      const request = JSON.parse(body);
      handleRequest(request);
    } catch (e) {
      console.error("JSON Parse Error");
    }
  }
}

/**
 * Main entry point
 */
async function main() {
  setOptionValues();
  validateOptions();
  createBasePath();

  writeStream = fs.createWriteStream(getTodaysLogFile(), { flags: "a" });

  process.stdin.on("data", (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    parseBuffer();
  });
}

main();
