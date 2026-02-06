/**
 * Contains all methods a request / response can have
 */
export const METHOD = {
  /**
   * Indicates log information
   */
  LOG: 0x01,

  /**
   * Indicates that it needs flushing i.e write the remaining stuff and close
   */
  FLUSH: 0x02,

  /**
   * Indicates that the stream opened needs to be closed / re opened typically used for file rotation
   */
  RELOAD: 0x03,
} as const;

/**
 * Contains a set of valid methods
 */
export const VALID_METHODS: Set<number> = new Set(Object.values(METHOD));

/**
 * What value the method can be for a request
 */
export type MethodType = (typeof METHOD)[keyof typeof METHOD];

/**
 * Contains all the levels logs can be indicating there importance
 */
export const LOG_LEVEL = {
  /**
   * Used for information
   */
  INFO: 0x01,

  /**
   * Used for warning
   */
  WARN: 0x02,

  /**
   * Used for errors
   */
  ERROR: 0x03,

  /**
   * Used for debug
   */
  DEBUG: 0x04,

  /**
   * Used for fatal
   */
  FATAL: 0x05,
} as const;

/**
 * Contains a set of valid log levels
 */
export const VALID_LOG_LEVELS: Set<number> = new Set(Object.values(LOG_LEVEL));

/**
 * What type the level can be for a request
 */
export type LogLevelType = (typeof LOG_LEVEL)[keyof typeof LOG_LEVEL];

/**
 * Represents a request message object used to send messages to the log stream.
 *
 * Serialized to the following binary protocol (Big-Endian / Network Byte Order):
 *
 * ```
 * | Offset | Size   | Field          | Description                    |
 * |--------|--------|----------------|--------------------------------|
 * | 0-3    | 4 bytes| id             | uint32, 0 to 4,294,967,295     |
 * | 4      | 1 byte | method         | uint8, enum value              |
 * | 5      | 1 byte | level          | uint8, enum value              |
 * | 6-7    | 2 bytes| payload_length | uint16, 0 to 65,535            |
 * | 8+     | N bytes| payload        | UTF-8 encoded string data      |
 *
 * Total header: 8 bytes
 * Maximum total size: 65,543 bytes (8 + 65,535)
 * ```
 */
export type Request = {
  /**
   * Request identifier (0 to 4,294,967,295)
   */
  id: number;

  /**
   * Operation method (e.g., LOG, FLUSH, RELOAD)
   */
  method: MethodType;

  /**
   * Log severity level (e.g., INFO, WARN, ERROR)
   */
  level: LogLevelType;

  /**
   * Message payload. Max 65,535 bytes when UTF-8 encoded.
   * Multi-byte characters (emoji, non-ASCII) count as multiple bytes.
   */
  payload: string;
};

/**
 * Represents a response message object used to send responses from the log stream.
 *
 * Serialized to the following binary protocol (Big-Endian / Network Byte Order):
 *
 * ```
 * | Offset | Size   | Field   | Description                    |
 * |--------|--------|---------|--------------------------------|
 * | 0-3    | 4 bytes| id      | uint32, 0 to 4,294,967,295     |
 * | 4      | 1 byte | method  | uint8, enum value              |
 * | 5      | 1 byte | level   | uint8, enum value              |
 * | 6      | 1 byte | success | uint8, 0 = false, 1 = true     |
 * | 7      | 1 byte | reserved| padding (set to 0x00)          |
 *
 * Total size: 8 bytes fixed
 * ```
 */
export type Response = {
  /**
   * Request identifier (0 to 4,294,967,295)
   */
  id: number;

  /**
   * Operation method (e.g., LOG, FLUSH, RELOAD)
   */
  method: MethodType;

  /**
   * Log severity level (e.g., INFO, WARN, ERROR)
   */
  level: LogLevelType;

  /**
   * Whether the request succeeded (true) or failed (false)
   */
  success: boolean;
};

/**
 * Error thrown when encoding/decoding fails
 */
export class ProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProtocolError";
  }
}

/**
 * Used to encode the request messages to the buffer protocol encoding
 */
export class RequestEncoder {
  private static readonly HEADER_SIZE = 8;
  private static readonly MAX_ID = 0xffffffff;
  private static readonly MAX_PAYLOAD_LENGTH = 0xffff;
  private validMethods: Set<number>;
  private validLevels: Set<number>;

  constructor(
    validMethods: Set<number> = VALID_METHODS,
    validLevels: Set<number> = VALID_LOG_LEVELS,
  ) {
    this.validMethods = validMethods;
    this.validLevels = validLevels;
  }

  /**
   * Get the ID from a buffer (4 bytes, uint32 at offset 0)
   */
  static getId(buffer: Buffer): number {
    return buffer.readUInt32BE(0);
  }

  /**
   * Get the method from a buffer (1 byte at offset 4)
   */
  static getMethod(buffer: Buffer): number | undefined {
    return buffer[4];
  }

  /**
   * Get the level from a buffer (1 byte at offset 5)
   */
  static getLevel(buffer: Buffer): number | undefined {
    return buffer[5];
  }

  /**
   * Get the payload length from a buffer (2 bytes, uint16 at offset 6)
   */
  static getPayloadLength(buffer: Buffer): number {
    return buffer.readUInt16BE(6);
  }

  /**
   * Get the payload as a Buffer from a buffer (starting at offset 8)
   */
  static getPayloadBuffer(buffer: Buffer): Buffer {
    const payloadLength = RequestEncoder.getPayloadLength(buffer);
    return buffer.subarray(8, 8 + payloadLength);
  }

  /**
   * Get the payload as a UTF-8 string from a buffer
   */
  static getPayloadString(buffer: Buffer): string {
    return RequestEncoder.getPayloadBuffer(buffer).toString("utf-8");
  }

  /**
   * Check if buffer has complete header (8 bytes)
   */
  static hasCompleteHeader(buffer: Buffer): boolean {
    return buffer.length >= RequestEncoder.HEADER_SIZE;
  }

  /**
   * Check if buffer has complete message (header + payload)
   */
  static hasCompleteMessage(buffer: Buffer): boolean {
    if (!RequestEncoder.hasCompleteHeader(buffer)) return false;
    const payloadLength = RequestEncoder.getPayloadLength(buffer);
    return buffer.length >= RequestEncoder.HEADER_SIZE + payloadLength;
  }

  /**
   * Get total message size (header + payload)
   */
  static getTotalMessageSize(buffer: Buffer): number {
    if (!RequestEncoder.hasCompleteHeader(buffer))
      return RequestEncoder.HEADER_SIZE;
    return RequestEncoder.HEADER_SIZE + RequestEncoder.getPayloadLength(buffer);
  }

  /**
   * Encode a request to the binary protocol
   */
  encode(request: Request): Buffer {
    if (
      !Number.isInteger(request.id) ||
      request.id < 0 ||
      request.id > RequestEncoder.MAX_ID
    ) {
      throw new ProtocolError(`Invalid ID: ${request.id}`);
    }
    if (!this.validMethods.has(request.method)) {
      throw new ProtocolError(`Invalid method: ${request.method}`);
    }
    if (!this.validLevels.has(request.level)) {
      throw new ProtocolError(`Invalid level: ${request.level}`);
    }

    const payloadBytes = Buffer.from(request.payload, "utf-8");
    if (payloadBytes.length > RequestEncoder.MAX_PAYLOAD_LENGTH) {
      throw new ProtocolError(
        `Payload too large: ${payloadBytes.length} bytes`,
      );
    }

    const buffer = Buffer.allocUnsafe(
      RequestEncoder.HEADER_SIZE + payloadBytes.length,
    );

    buffer.writeUInt32BE(request.id, 0);
    buffer[4] = request.method;
    buffer[5] = request.level;
    buffer.writeUInt16BE(payloadBytes.length, 6);
    payloadBytes.copy(buffer, 8);

    return buffer;
  }

  /**
   * Decode a binary protocol buffer to a request object
   */
  decode(buffer: Buffer): Request {
    if (!RequestEncoder.hasCompleteHeader(buffer)) {
      throw new ProtocolError(
        `Buffer too small: ${buffer.length} bytes, minimum ${RequestEncoder.HEADER_SIZE} bytes required`,
      );
    }

    const id = RequestEncoder.getId(buffer);
    const method = RequestEncoder.getMethod(buffer) as number;
    const level = RequestEncoder.getLevel(buffer) as number;
    const payloadLength = RequestEncoder.getPayloadLength(buffer);

    if (buffer.length !== RequestEncoder.HEADER_SIZE + payloadLength) {
      throw new ProtocolError(
        `Buffer size mismatch: expected ${RequestEncoder.HEADER_SIZE + payloadLength} bytes, got ${buffer.length} bytes`,
      );
    }

    if (!this.validMethods.has(method)) {
      throw new ProtocolError(`Invalid method: ${method}`);
    }
    if (!this.validLevels.has(level)) {
      throw new ProtocolError(`Invalid level: ${level}`);
    }

    const payload = RequestEncoder.getPayloadString(buffer);

    return {
      id,
      method: method as MethodType,
      level: level as LogLevelType,
      payload,
    };
  }

  static getHeaderSize(): number {
    return RequestEncoder.HEADER_SIZE;
  }
}

/**
 * Used to encode the response messages to the buffer protocol encoding
 */
export class ResponseEncoder {
  private static readonly HEADER_SIZE = 8;
  private static readonly MAX_ID = 0xffffffff;
  private validMethods: Set<number>;
  private validLevels: Set<number>;

  constructor(
    validMethods: Set<number> = VALID_METHODS,
    validLevels: Set<number> = VALID_LOG_LEVELS,
  ) {
    this.validMethods = validMethods;
    this.validLevels = validLevels;
  }

  /**
   * Encode a response to the binary protocol
   * @param response The JSON response object
   * @returns Binary protocol buffer (exactly 8 bytes)
   */
  encode(response: Response): Buffer {
    if (
      !Number.isInteger(response.id) ||
      response.id < 0 ||
      response.id > ResponseEncoder.MAX_ID
    ) {
      throw new ProtocolError(`Invalid ID: ${response.id}`);
    }
    if (!this.validMethods.has(response.method)) {
      throw new ProtocolError(`Invalid method: ${response.method}`);
    }
    if (!this.validLevels.has(response.level)) {
      throw new ProtocolError(`Invalid level: ${response.level}`);
    }

    const buffer = Buffer.allocUnsafe(ResponseEncoder.HEADER_SIZE);

    buffer.writeUInt32BE(response.id, 0);
    buffer[4] = response.method;
    buffer[5] = response.level;
    buffer[6] = response.success ? 1 : 0;
    buffer[7] = 0x00; // reserved padding

    return buffer;
  }

  /**
   * Decode a binary protocol buffer to a response object
   * @param buffer The binary protocol buffer
   * @returns The decoded response object
   */
  decode(buffer: Buffer): Response {
    if (buffer.length !== ResponseEncoder.HEADER_SIZE) {
      throw new ProtocolError(
        `Invalid buffer size: expected ${ResponseEncoder.HEADER_SIZE} bytes, got ${buffer.length} bytes`,
      );
    }

    const id = buffer.readUInt32BE(0);
    const method = buffer[4] as number;
    const level = buffer[5] as number;
    const success = buffer[6] === 1;

    if (buffer[7] !== 0x00) {
      throw new ProtocolError(
        `Invalid reserved byte: expected 0x00, got 0x${buffer[7]?.toString(16).padStart(2, "0")}`,
      );
    }

    if (!this.validMethods.has(method)) {
      throw new ProtocolError(`Invalid method: ${method}`);
    }
    if (!this.validLevels.has(level)) {
      throw new ProtocolError(`Invalid level: ${level}`);
    }

    return {
      id,
      method: method as MethodType,
      level: level as LogLevelType,
      success,
    };
  }

  static getHeaderSize(): number {
    return ResponseEncoder.HEADER_SIZE;
  }
}
