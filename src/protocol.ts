/**
 * Contains all methods a request / response can have
 */
export const METHOD = {
  /**
   * Indicates log information
   */
  LOG: 0x01,

  /**
   * Indicates that it needs flushing i.e write the remaining stuff
   */
  FLUSH: 0x02,

  /**
   * Indicates that the stream opened needs to be closed / re opened typically used for file rotation
   */
  RELOAD: 0x03,

  /**
   * Close the child process
   */
  SHUTDOWN: 0x04,
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
 */
export type RequestLog = {
  /**
   * Request identifier 
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
   * Message payload.
   */
  payload: string;
};

/**
 * Represents a response message object used to send responses from the log stream.
 */
export type LogResponse = {
  /**
   * Request identifier
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

