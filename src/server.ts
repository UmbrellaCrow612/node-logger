import { ProtocolError, RequestEncoder } from "./protocol";

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
 * Main entry point
 */
async function main() {
  process.stdin.on("data", (chunk: Buffer<ArrayBuffer>) => {
    stdinBuffer = Buffer.concat([stdinBuffer, chunk]);
    parseBuffer();
  });
}

main();
