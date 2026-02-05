/**
 * Contains the shared protocol spec
 */

/**
 * Contains all methods a request / response can have
 */
const METHODS = {
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
const LEVELS = {
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
 * Encode a message as a buffer to the spec we defined
 * @param id The message ID
 * @param method - The messages method
 * @param level - The messages log level
 * @param payload - The messages content
 * @returns Buffer
 */
const encode = (
  id: number,
  method: keyof typeof METHODS,
  level: keyof typeof LEVELS,
  payload: string,
): Buffer => {
  const payloadBuf = Buffer.from(payload, "utf-8");
  const header = Buffer.alloc(14);

  header.writeUInt32LE(id, 0);
  header.writeUInt8(METHODS[method], 4);
  header.writeUInt8(LEVELS[level], 5);
  header.writeUInt32LE(Math.floor(Date.now() / 1000), 6);
  header.writeUInt32LE(payloadBuf.length, 10);

  const frameLen = header.length + payloadBuf.length;
  const frame = Buffer.allocUnsafe(4 + frameLen);

  frame.writeUInt32LE(frameLen, 0);
  header.copy(frame, 4);
  payloadBuf.copy(frame, 18);

  return frame;
};

export = {
  METHODS,
  LEVELS,
  encode,
};

declare namespace Protocol {
  /**
   * What value the method can be for a request
   */
  export type MethodType = (typeof METHODS)[keyof typeof METHODS];

  /**
   * What type the level can be for a request
   */
  export type LevelType = (typeof LEVELS)[keyof typeof LEVELS];
}
