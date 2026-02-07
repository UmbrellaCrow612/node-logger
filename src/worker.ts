/**
 * This is a worker file which will be spawned
 */

import path from "node:path";
import {
  METHOD,
  LogResponse,
  RequestLog,
} from "./protocol";
import fs from "node:fs";
import { parentPort } from "worker_threads";

/**
 * Used for sucess exits
 */
const EXIT_SUCCESS = 0;

/**
 * Holds the stream for the log file
 */
let fileStream: fs.WriteStream | null = null;

/**
 * Holds the base path of where to save the log files
 */
let basePath = "./logs";

/**
 * Holds the array of buffer data we will write to the log file
 */
let fileWriteArray: RequestLog[] = [];

/**
 * How long we wait until we flush unless the buffer gets full
 */
const FLUSH_MS = 130;

/**
 * How many buffers can accumulate before we have to flush
 */
const FILE_WRITE_FLUSH_COUNT = 100;

/**
 * Holds the timeout for flush
 */
let flushTimeout: NodeJS.Timeout | null = null;

/**
 * Clears the pending flush timeout
 */
const clearFlushTimeout = () => {
  if (flushTimeout) {
    clearTimeout(flushTimeout);
    flushTimeout = null;
  }
};

/**
 * Flushes the buffer array to the file and resets it
 */
const flush = () => {
  if (fileWriteArray.length === 0 || !fileStream) return;

  const payload = fileWriteArray.map(x => x.payload).join('\n') + '\n';
  
  fileStream.write(payload, (err) => {
    if (err) console.error(`Write error: ${err.message}`);
  });

  fileWriteArray = [];
  clearFlushTimeout();
};

/**
 * Starts the delayed flush timer if not already running
 */
const startFlush = () => {
  if (flushTimeout !== null) {
    return;
  }

  flushTimeout = setTimeout(() => {
    flush();
  }, FLUSH_MS);
};

/**
 * Used to send response to the parent
 * @param response The response
 */
const sendResponse = (response: LogResponse) => {
  parentPort?.postMessage(response);
};

/**
 * Handle the request decoded
 */
const requestHandler = (request: RequestLog) => {
  switch (request.method) {
    case METHOD.LOG: {
      fileWriteArray.push(request);

      if (fileWriteArray.length >= FILE_WRITE_FLUSH_COUNT) {
        flush();
      } else {
        startFlush();
      }

      sendResponse({
        id: request.id,
        level: request.level,
        method: request.method,
        success: true,
      });
      break;
    }

    case METHOD.FLUSH:
      flush();

      if (fileStream?.writableNeedDrain) {
        fileStream.once("drain", () => {
          sendResponse({
            id: request.id,
            level: request.level,
            method: request.method,
            success: true,
          });
        });
      } else {
        sendResponse({
          id: request.id,
          level: request.level,
          method: request.method,
          success: true,
        });
      }
      break;

    case METHOD.RELOAD:
      flush();

      fileStream?.end(() => {
        fileStream = null;
        createStream();

        sendResponse({
          id: request.id,
          level: request.level,
          method: request.method,
          success: true,
        });
      });
      return;

    case METHOD.SHUTDOWN:
      flush();

      fileStream?.end(() => {
        sendResponse({
          id: request.id,
          level: request.level,
          method: request.method,
          success: true,
        });

        setImmediate(() => {
          process.exit(EXIT_SUCCESS);
        });
      });
      return;

    default:
      process.stderr.write(`request unhandled method ${request.method}`);
      sendResponse({
        id: request.id,
        level: request.level,
        method: request.method,
        success: false,
      });
      break;
  }
};

/**
 * Generates a log filename based on current date
 * @returns Filename in format YYYY-MM-DD.log
 */
const getLogFileName = (): string => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}.log`;
};

/**
 * Creates a stream to the file in append mode for today's log file.
 * Closes existing stream if one is already open.
 */
const createStream = () => {
  fileStream = null;

  const fileName = getLogFileName();
  const filePath = path.join(basePath, fileName);

  fileStream = fs.createWriteStream(filePath, { flags: "a" });

  fileStream.on("error", (err) => {
    console.error(`Stream error: ${err.message}`);
  });
};

/**
 * Main entry point
 */
async function main() {
  basePath = process.env["BASE_PATH"] ? process.env["BASE_PATH"] : "./logs";
  basePath = path.normalize(path.resolve(basePath));

  await fs.promises.mkdir(basePath, { recursive: true });

  createStream();

  parentPort?.on("message", (request: RequestLog) => {
    requestHandler(request);
  });
}

main();
