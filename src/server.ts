/**
 * This is a self contained script that runs as the server process which accepts the binary protocol and then performs actions
 */

import path from "node:path";
import {
  ProtocolError,
  RequestEncoder,
  METHOD,
  ResponseEncoder,
  Response,
  LogLevelType,
  MethodType,
} from "./protocol";
import fs from "node:fs";

/**
 * Hols the stream for the log file
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
 * Holds the buffer data we will write to the log file
 */
let fileWriteBuffer = Buffer.alloc(0);

/**
 * How long we wait until we flush unless the buffer gets full
 */
const FLUSH_MS = 130;

/**
 * How large the buffer can get beofre we have to flush
 */
const FILE_WRITE_BUFFER_FLUSH_LENGTH = 16 * 1024; // 16KB

/**
 * Holds the timeout for flush
 */
let flushTimeout: NodeJS.Timeout | null = null;

/**
 * Used to encode and decode request binary protocol data
 */
const requestEncoder = new RequestEncoder();

/**
 * Used to encode and decode response binary protocol data
 */
const responseEncoder = new ResponseEncoder();

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
 * Flushes the buffer to the file and resets it
 */
const flush = () => {
  if (fileWriteBuffer.length === 0 || !fileStream) {
    return;
  }

  fileStream.write(fileWriteBuffer, (err) => {
    if (err) {
      console.error(`Write error: ${err.message}`);
    }
  });

  fileWriteBuffer = Buffer.alloc(0);
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
 * UYsed to send response to the parent
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

      fileWriteBuffer = Buffer.concat([fileWriteBuffer, payload]);

      if (fileWriteBuffer.length >= FILE_WRITE_BUFFER_FLUSH_LENGTH) {
        flush();
      } else {
        startFlush();
      }
      break;
    }

    case METHOD.FLUSH:
      flush();

      fileStream?.once("drain", () => {
        sendResponse({
          id: requestId,
          level: requestLevel,
          method: requestMethod as MethodType,
          success: true,
        });
      });

      if (!fileStream?.writableNeedDrain) {
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
          process.exit(0);
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
 * Parses the buffer and moves it along
 */
function parseBuffer() {
  const HEADER_SIZE = RequestEncoder.getHeaderSize();

  while (stdinBuffer.length >= HEADER_SIZE) {
    const payloadLength = stdinBuffer.readUInt16BE(6);
    const totalMessageSize = HEADER_SIZE + payloadLength;

    if (stdinBuffer.length < totalMessageSize) {
      break;
    }

    const messageBuffer = stdinBuffer.subarray(0, totalMessageSize);

    try {
      if (requestEncoder.isValidInstance(messageBuffer)) {
        requestHandler(messageBuffer);
      } else {
        throw new Error("Parsed message buffer invalid");
      }
    } catch (error) {
      if (error instanceof ProtocolError) {
        console.error(`Protocol error: ${error.message}`);
      } else {
        console.error(`Unexpected error: ${error}`);
      }
    }

    stdinBuffer = stdinBuffer.subarray(totalMessageSize);
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
    process.exit(0);
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
