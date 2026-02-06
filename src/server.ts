/**
 * This is a self contained script that runs as the server process which accepts the binary protocol and then performs actions
 */

import path from "node:path";
import { ProtocolError, RequestEncoder } from "./protocol";
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
 * Used to encode and decode request binary protocol data
 */
const requestEncoder = new RequestEncoder();

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
      const request = requestEncoder.decode(messageBuffer);
      console.log(request);
      //    TODO add handle
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
  fileStream?.end();
  fileStream = null;

  const fileName = getLogFileName();
  const filePath = path.join(basePath, fileName);

  fileStream = fs.createWriteStream(filePath, { flags: "a" });
};

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
}

main();
