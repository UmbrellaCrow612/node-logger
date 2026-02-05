/**
 * Contains all methods a request / response can have
 */
export const method = {
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
export const VALID_METHODS: Set<number> = new Set(Object.values(method));

/**
 * Contains all the levels logs can be indicating there importance
 */
export const LogLevel = {
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
export const VALID_LOG_LEVELS: Set<number> = new Set(Object.values(LogLevel));

/**
 * What value the method can be for a request
 */
export type MethodType = (typeof method)[keyof typeof method];

/**
 * What type the level can be for a request
 */
export type LogLevelType = (typeof LogLevel)[keyof typeof LogLevel];

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
 * This will then be mapped to our binary protocol:
 *
 * Binary Protocol for Response (Big-Endian / Network Byte Order):
 *
 * ```
 * Format:
 *
 * [0-3]   : ID (uint32, 4 bytes, big-endian)
 * [4]     : Method (1 byte)
 * [5]     : Level (1 byte)
 * [6]     : Success (1 byte, 0x00 = false, 0x01 = true)
 * [7]     : Reserved (1 byte, padding for alignment)
 * ```
 *
 * Total size: 8 bytes fixed
 */
export type Response = {
  /**
   * The specific request it was for (0 to 4,294,967,295)
   */
  id: number;

  /**
   * What method this request was
   */
  method: MethodType;

  /**
   * What log level it was
   */
  level: LogLevelType;

  /**
   * If the request succeeded or failed
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
   * Encode a request to the binary protocol
   * @param request The JSON request object
   * @returns Binary protocol of the request
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

  static getHeaderSize(): number {
    return RequestEncoder.HEADER_SIZE;
  }
}

/**
 * Used to encode/decode the response messages to/from the buffer protocol encoding
 */
export class ResponseEncoder {
  private static readonly RESPONSE_SIZE = 8;
  private static readonly MAX_ID = 0xffffffff; // uint32 max

  private static readonly VALID_METHODS: Set<number> = new Set([
    method.LOG,
    method.FLUSH,
    method.RELOAD,
  ]);

  private static readonly VALID_LEVELS: Set<number> = new Set([
    LogLevel.INFO,
    LogLevel.WARN,
    LogLevel.ERROR,
    LogLevel.DEBUG,
    LogLevel.FATAL,
  ]);

  /**
   * Encode a response message into binary protocol
   * @param response The response message
   * @throws {ProtocolError} If response is invalid
   */
  encode(response: Response): Buffer {
    if (
      !Number.isInteger(response.id) ||
      response.id < 0 ||
      response.id > ResponseEncoder.MAX_ID
    ) {
      throw new ProtocolError(
        `ID must be an integer between 0 and ${ResponseEncoder.MAX_ID}, got: ${response.id}`,
      );
    }

    if (!ResponseEncoder.VALID_METHODS.has(response.method)) {
      throw new ProtocolError(`Invalid method value: ${response.method}`);
    }

    if (!ResponseEncoder.VALID_LEVELS.has(response.level)) {
      throw new ProtocolError(`Invalid level value: ${response.level}`);
    }

    const buffer = Buffer.allocUnsafe(ResponseEncoder.RESPONSE_SIZE);

    // Write ID (uint32, big-endian) at offset 0
    buffer.writeUInt32BE(response.id, 0);

    // Write method at offset 4
    buffer[4] = response.method;

    // Write level at offset 5
    buffer[5] = response.level;

    // Write success flag at offset 6 (0x01 for true, 0x00 for false)
    buffer[6] = response.success ? 0x01 : 0x00;

    // Reserved byte at offset 7 (zero-filled)
    buffer[7] = 0x00;

    return buffer;
  }

  /**
   * Decode a response binary protocol back into a response object
   * @param binaryResponse The response which was encoded using the protocol
   * @throws {ProtocolError} If buffer is malformed or contains invalid data
   */
  decode(binaryResponse: Buffer): Response {
    if (binaryResponse.length < ResponseEncoder.RESPONSE_SIZE) {
      throw new ProtocolError(
        `Buffer too small: ${binaryResponse.length} bytes (minimum: ${ResponseEncoder.RESPONSE_SIZE})`,
      );
    }

    // Read ID (uint32, big-endian) from offset 0
    const id = binaryResponse.readUInt32BE(0);

    // Read method from offset 4
    const methodValue = binaryResponse[4] as number;
    if (!ResponseEncoder.VALID_METHODS.has(methodValue)) {
      throw new ProtocolError(`Invalid method value in buffer: ${methodValue}`);
    }
    const method = methodValue as MethodType;

    // Read level from offset 5
    const levelValue = binaryResponse[5] as number;
    if (!ResponseEncoder.VALID_LEVELS.has(levelValue)) {
      throw new ProtocolError(`Invalid level value in buffer: ${levelValue}`);
    }
    const level = levelValue as LogLevelType;

    // Read success flag from offset 6
    const successByte = binaryResponse[6] as number;
    if (successByte !== 0x00 && successByte !== 0x01) {
      throw new ProtocolError(
        `Invalid success flag value: ${successByte} (expected 0x00 or 0x01)`,
      );
    }
    const success = successByte === 0x01;

    // Warn if buffer has extra bytes (optional strictness)
    if (binaryResponse.length > ResponseEncoder.RESPONSE_SIZE) {
      // Could throw here if strict mode is desired
      // For now, we'll just ignore trailing bytes
    }

    return { id, method, level, success };
  }

  /**
   * Get the fixed size of a response message
   */
  static getResponseSize(): number {
    return ResponseEncoder.RESPONSE_SIZE;
  }
}
