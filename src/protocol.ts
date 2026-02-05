/**
 * Contains all methods a request / response can have
 */
export const METHOD = {
  /**
   * Indicates log information
   */
  log: 0x01,

  /**
   * Indicates that it needs flushing i.e write the remaining stuff and close
   */
  flush: 0x02,

  /**
   * Indicates that the stream opened needs to be closed / re opened typically used for file rotation
   */
  reload: 0x03,
} as const;

/**
 * Contains all the levels logs can be indicating there importance
 */
export const LEVEL = {
  /**
   * Used for information
   */
  info: 0x00,

  /**
   * Used for warning
   */
  warn: 0x01,

  /**
   * Used for errors
   */
  error: 0x02,
} as const;

/**
 * What value the method can be for a request
 */
export type MethodType = (typeof METHOD)[keyof typeof METHOD];

/**
 * What type the level can be for a request
 */
export type LevelType = (typeof LEVEL)[keyof typeof LEVEL];

/**
 * Represents a request message object used to send messages to the log stream.
 *
 * This will then be mapped to our binary protocol:
 *
 * Binary Protocol for Log Streaming:
 *
 * ```
 * Format:
 *
 * [0-3]   : ID (uint32, 4 bytes, big-endian)
 * [4]     : Method (1 byte)
 * [5]     : Level (1 byte)
 * [6-7]   : Payload length (uint16, 2 bytes, big-endian)
 * [8...]  : Payload (UTF-8 encoded string)
 * ```
 */
export type Request = {
  /**
   * A way to ID this request
   */
  id: number;

  /**
   * What method this request is
   */
  method: MethodType;

  /**
   * What level of log this is
   */
  level: LevelType;

  /**
   * Any string
   */
  payload: string;
};

/**
 * Used to encode the request messages to the buffer protocol encoding
 */
export class RequestEncoder {
  /**
   * Encode a request message into binary protocol
   * @param request The request message
   */
  encode(request: Request): Buffer {
    const payloadBytes = Buffer.from(request.payload, "utf-8");
    const buffer = Buffer.allocUnsafe(8 + payloadBytes.length);

    // Write ID (uint32, big-endian) at offset 0
    buffer.writeUInt32BE(request.id, 0);

    // Write method at offset 4
    buffer[4] = request.method;

    // Write level at offset 5
    buffer[5] = request.level;

    // Write payload length (uint16, big-endian) at offset 6
    buffer.writeUInt16BE(payloadBytes.length, 6);

    // Copy payload starting at offset 8
    payloadBytes.copy(buffer, 8);

    return buffer;
  }

  /**
   * Decode a request binary protocol back into a request object
   * @param binaryRequest The request which was encoded using the protocol
   */
  decode(binaryRequest: Buffer): Request {
    // Read ID (uint32, big-endian) from offset 0
    const id = binaryRequest.readUInt32BE(0);

    // Read method from offset 4
    const method = binaryRequest[4] as MethodType;

    // Read level from offset 5
    const level = binaryRequest[5] as LevelType;

    // Read payload length (uint16, big-endian) from offset 6
    const payloadLength = binaryRequest.readUInt16BE(6);

    // Extract and decode payload from offset 8
    const payload = binaryRequest.toString("utf-8", 8, 8 + payloadLength);

    return { id, method, level, payload };
  }
}
