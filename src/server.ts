/**
 * This is a self contained script that runs as the server process which accepts the binary protocol and then performs actions
 */

import path from "node:path";
import {
  RequestEncoder,
  METHOD,
  ResponseEncoder,
  Response,
  LogLevelType,
  MethodType,
} from "./protocol";
import fs from "node:fs";

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
 * Holds stdin buffer
 */
let stdinBuffer: Buffer = Buffer.alloc(0);

/**
 * Holds the array of buffer data we will write to the log file
 */
let fileWriteBufferArray: Buffer[] = [];

/**
 * How long we wait until we flush unless the buffer gets full
 */
const FLUSH_MS = 130;

/**
 * How many buffers can accumulate before we have to flush
 */
const FILE_WRITE_BUFFER_FLUSH_COUNT = 100;

/**
 * Holds the timeout for flush
 */
let flushTimeout: NodeJS.Timeout | null = null;

/**
 * Used to encode and decode response binary protocol data
 */
const responseEncoder = new ResponseEncoder();

/**
 * Newline buffer for efficient concatenation
 */
const NEWLINE_BUFFER = Buffer.from("\n");

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
  if (fileWriteBufferArray.length === 0 || !fileStream) {
    return;
  }

  const joinedBuffer = Buffer.concat([
    Buffer.concat(
      fileWriteBufferArray.map((buf, index) =>
        index < fileWriteBufferArray.length - 1
          ? Buffer.concat([buf, NEWLINE_BUFFER])
          : buf,
      ),
    ),
    NEWLINE_BUFFER,
  ]);

  fileStream.write(joinedBuffer, (err) => {
    if (err) {
      console.error(`Write error: ${err.message}`);
    }
  });

  fileWriteBufferArray = [];
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
const sendResponse = (response: Response) => {
  process.stdout.write(responseEncoder.encode(response));
};

/**
 * Handle the request decoded
 * @param request The request that was buffer bytes extracted
 */
const requestHandler = (request: Buffer) => {
  const requestMethod = RequestEncoder.getMethod(request);
  const requestId = RequestEncoder.getId(request);
  const requestLevel = RequestEncoder.getLevel(request) as LogLevelType;

  switch (requestMethod) {
    case METHOD.LOG: {
      const payload = RequestEncoder.getPayloadBuffer(request);

      fileWriteBufferArray.push(payload);

      if (fileWriteBufferArray.length >= FILE_WRITE_BUFFER_FLUSH_COUNT) {
        flush();
      } else {
        startFlush();
      }

      sendResponse({
        id: requestId,
        level: requestLevel,
        method: requestMethod as MethodType,
        success: true,
      });
      break;
    }

    case METHOD.FLUSH:
      flush();

      if (fileStream?.writableNeedDrain) {
        fileStream.once("drain", () => {
          sendResponse({
            id: requestId,
            level: requestLevel,
            method: requestMethod as MethodType,
            success: true,
          });
        });
      } else {
        sendResponse({
          id: requestId,
          level: requestLevel,
          method: requestMethod as MethodType,
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
          id: requestId,
          level: requestLevel,
          method: requestMethod as MethodType,
          success: true,
        });
      });
      return;

    case METHOD.SHUTDOWN:
      flush();

      fileStream?.end(() => {
        sendResponse({
          id: requestId,
          level: requestLevel,
          method: requestMethod as MethodType,
          success: true,
        });

        setImmediate(() => {
          process.exit(EXIT_SUCCESS);
        });
      });
      return;

    default:
      process.stderr.write(`request unhandled method ${requestMethod}`);
      sendResponse({
        id: requestId,
        level: requestLevel,
        method: requestMethod as MethodType,
        success: false,
      });
      break;
  }
};

/**
 * Parses the buffer and moves it along with backpressure handling
 */
function parseBuffer() {
  const HEADER_SIZE = RequestEncoder.getHeaderSize();

  while (stdinBuffer.length >= HEADER_SIZE) {
    const payloadLength = RequestEncoder.getPayloadLength(stdinBuffer);
    const totalMessageSize = HEADER_SIZE + payloadLength;

    if (stdinBuffer.length < totalMessageSize) {
      break;
    }

    const messageBuffer = stdinBuffer.subarray(0, totalMessageSize);
    requestHandler(messageBuffer);

    stdinBuffer = stdinBuffer.subarray(totalMessageSize);
  }

  if (stdinBuffer.length >= RequestEncoder.getHeaderSize()) {
    setImmediate(parseBuffer);
  }
}

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
 * Graceful shutdown handler
 */
const shutdown = () => {
  clearFlushTimeout();
  flush();
  fileStream?.end(() => {
    process.exit(EXIT_SUCCESS);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

/**
 * Main entry point
 */
async function main() {
  basePath = process.env["BASE_PATH"] ? process.env["BASE_PATH"] : "./logs";
  basePath = path.normalize(path.resolve(basePath));

  await fs.promises.mkdir(basePath, { recursive: true });

  createStream();

  process.stdin.on("data", (chunk: Buffer<ArrayBuffer>) => {
    stdinBuffer = Buffer.concat([stdinBuffer, chunk]);
    parseBuffer();
  });

  process.stdin.on("end", () => {
    shutdown();
  });
}

main();
