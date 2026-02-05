import fs from "node:fs";
import path from "node:path";
import {
  LOG_LEVEL,
  LogLevelType,
  METHOD,
  MethodType,
  Request,
  RequestEncoder,
  ResponseEncoder,
  Response, // Import Response type
} from "./protocol";
import os from "node:os";
import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";

/**
 * Timestamp format options
 */
export type TimestampType =
  | "iso" // ISO 8601: 2024-01-15T10:30:00.000Z
  | "locale" // Locale string: 1/15/2024, 10:30:00 AM
  | "utc" // UTC string: Mon, 15 Jan 2024 10:30:00 GMT
  | "unix" // Unix timestamp (seconds): 1705317000
  | "unix_ms" // Unix timestamp (milliseconds): 1705317000000
  | "date" // Date only: 2024-01-15
  | "time" // Time only: 10:30:00
  | "datetime" // Date and time: 2024-01-15 10:30:00
  | "short" // Short format: 15/01/2024 10:30
  | "custom"; // Custom format (requires customTimestampFormat)

/**
 * Options to change the logger
 */
export type LoggerOptions = {
  /**
   * Where to store the log files output
   */
  basePath: string;

  /**
   * If this logger should save logs to log files
   */
  saveToLogFiles: boolean;

  /**
   * If this logger log's should be printed to the stdout of the process
   */
  outputToConsole: boolean;

  /**
   * If the output to console should be colored
   */
  useColoredOutput: boolean;

  /**
   * Map of specific log level and what color to use
   */
  colorMap: Record<LogLevelType, string>;

  /**
   * If it should add timestamps to logs
   */
  showTimeStamps: boolean;

  /**
   * Which timestamp format to use (only applies when showTimeStamps is true)
   */
  timestampType: TimestampType;

  /**
   * Custom timestamp format string (only used when timestampType is "custom")
   * Use tokens: YYYY=year, MM=month, DD=day, HH=hour, mm=minute, ss=second, ms=millisecond
   */
  customTimestampFormat?: string;

  /**
   * If it should show log level
   */
  showLogLevel: boolean;

  /**
   * Map a specific log level with a string value use for it
   */
  logLevelMap: Record<LogLevelType, string>;

  /**
   * Minimum log level to process (filters out lower levels)
   */
  minLevel?: LogLevelType;

  /**
   * Maximum log level to process (filters out higher levels)
   */
  maxLevel?: LogLevelType;

  /**
   * Specific levels to include (whitelist)
   */
  includeLevels?: LogLevelType[];

  /**
   * Specific levels to exclude (blacklist)
   */
  excludeLevels?: LogLevelType[];

  /**
   * Filter function to determine if a log should be processed
   */
  filter?: (level: LogLevelType, message: any) => boolean;

  /**
   * Include process ID in logs
   */
  showProcessId?: boolean;

  /**
   * Include hostname in logs
   */
  showHostname?: boolean;

  /**
   * Include environment name (dev/prod) in logs
   */
  environment?: string;

  /**
   * Show where it was called at (file:line:column)
   */
  showCallSite?: boolean;
};

/**
 * Numeric priority for log levels (higher = more severe)
 */
const LogLevelPriority: Record<LogLevelType, number> = {
  [LOG_LEVEL.DEBUG]: 0,
  [LOG_LEVEL.INFO]: 1,
  [LOG_LEVEL.WARN]: 2,
  [LOG_LEVEL.ERROR]: 3,
  [LOG_LEVEL.FATAL]: 4,
};

// ANSI color codes
const Colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
} as const;

const defaultLoggerOptions: LoggerOptions = {
  basePath: "./logs",
  outputToConsole: true,
  saveToLogFiles: false,
  useColoredOutput: true,
  colorMap: {
    [LOG_LEVEL.INFO]: Colors.cyan,
    [LOG_LEVEL.WARN]: Colors.yellow,
    [LOG_LEVEL.ERROR]: Colors.red,
    [LOG_LEVEL.DEBUG]: Colors.gray,
    [LOG_LEVEL.FATAL]: Colors.magenta,
  },
  showTimeStamps: true,
  timestampType: "iso",
  showLogLevel: true,
  logLevelMap: {
    [LOG_LEVEL.INFO]: "INFO",
    [LOG_LEVEL.WARN]: "WARN",
    [LOG_LEVEL.ERROR]: "ERROR",
    [LOG_LEVEL.DEBUG]: "DEBUG",
    [LOG_LEVEL.FATAL]: "FATAL",
  },
};

/**
 * Custom error for logger initialization failures
 */
export class LoggerInitializationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LoggerInitializationError";
  }
}

/**
 * Used to log to console and also the log files
 */
export class Logger {
  /**
   * Local refrence to options passed
   */
  private _options: LoggerOptions;

  /**
   * Spawned side car
   */
  private _process: ChildProcessWithoutNullStreams | null = null;

  /**
   * Queue for pending writes to prevent interleaving
   */
  private _writeQueue: Array<{
    request: Request;
    resolve: () => void;
    reject: (err: Error) => void;
  }> = [];

  /**
   * If it is writing to the process
   */
  private _isWriting = false;

  /**
   * Id tracker
   */
  private _id = 0;

  /**
   * Get the next ID
   * @returns ID
   */
  private _getNextId = () => this._id++;

  /**
   * Maps specific request id's to there promise's made
   */
  private _pending: Map<
    number,
    {
      res: (value: void | PromiseLike<void>) => void;
      rej: (reason?: any) => void;
    }
  > = new Map();

  /**
   * Used to map request to binary protocol
   */
  private _requestEncoder: RequestEncoder = new RequestEncoder();

  /**
   * Used to map responses from binary protocol
   */
  private _responseEncoder: ResponseEncoder = new ResponseEncoder();

  /**
   * Buffer for accumulating response data (handles partial reads)
   */
  private _responseBuffer: Buffer = Buffer.alloc(0);

  constructor(options: Partial<LoggerOptions> = {}) {
    const mergedColorMap = {
      ...defaultLoggerOptions.colorMap,
      ...options.colorMap,
    };

    const mergedLogLevelMap = {
      ...defaultLoggerOptions.logLevelMap,
      ...options.logLevelMap,
    };

    this._options = {
      ...defaultLoggerOptions,
      ...options,
      colorMap: mergedColorMap,
      logLevelMap: mergedLogLevelMap,
    };

    this._validateBasePath();
    this._initializeDirectory();
    this._initializeProcess();
  }

  /**
   * Validates the basePath option
   */
  private _validateBasePath(): void {
    const { basePath } = this._options;

    if (basePath === undefined || basePath === null) {
      throw new LoggerInitializationError(
        "basePath is required and cannot be null or undefined",
      );
    }

    if (typeof basePath !== "string") {
      throw new LoggerInitializationError(
        `basePath must be a string, received ${typeof basePath}`,
      );
    }

    if (basePath.trim().length === 0) {
      throw new LoggerInitializationError("basePath cannot be an empty string");
    }

    this._options.basePath = path.resolve(basePath);
  }

  /**
   * Creates the log directory if file logging is enabled
   */
  private _initializeDirectory(): void {
    if (!this._options.saveToLogFiles) {
      return;
    }

    try {
      fs.mkdirSync(this._options.basePath, { recursive: true });
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;

      throw new LoggerInitializationError(
        `Failed to create log directory at "${this._options.basePath}": ${nodeError.message}`,
      );
    }

    this._verifyWritable();
  }

  /**
   * Spawns the side car process and sets up stdout listener
   */
  private _initializeProcess() {
    if (!this._options.saveToLogFiles) {
      return;
    }

    try {
      const processPath = this._getSideCarProcessPath();

      this._process = spawn("node", [processPath], {
        stdio: ["pipe", "pipe", "pipe"],
        env: { LOG_BASE_PATH: this._options.basePath },
        detached: false,
      });

      // Set up stdout data handler for response decoding
      this._process.stdout?.on("data", (data: Buffer) => {
        this._handleResponseData(data);
      });

      this._process.on("error", (error) => {
        process.stderr.write(
          `Logger sidecar process error: ${error.message}\n`,
        );
        this._process = null;
      });

      this._process.on("exit", (code, signal) => {
        if (code !== 0) {
          process.stderr.write(
            `Logger sidecar process exited with code ${code}, signal ${signal}\n`,
          );
        }
        this._process = null;
      });

      this._process.stderr?.on("data", (data) => {
        process.stderr.write(`Sidecar stderr: ${data}`);
      });
    } catch (error) {
      const nodeError = error as Error;

      throw new LoggerInitializationError(
        `Failed to create side car process: ${nodeError.message}`,
      );
    }
  }

  /**
   * Handle incoming data from sidecar stdout, decode responses and resolve pending requests
   */
  private _handleResponseData(data: Buffer): void {
    // Append new data to buffer
    this._responseBuffer = Buffer.concat([this._responseBuffer, data]);

    const responseSize = ResponseEncoder.getResponseSize();

    // Process complete responses while we have enough data
    while (this._responseBuffer.length >= responseSize) {
      try {
        // Extract exactly one response (first 8 bytes)
        const responseBytes = this._responseBuffer.subarray(0, responseSize);

        // Decode the response
        const response: Response = this._responseEncoder.decode(responseBytes);

        // Remove processed bytes from buffer
        this._responseBuffer = this._responseBuffer.subarray(responseSize);

        // Resolve the corresponding pending request
        this._resolvePendingRequest(response);
      } catch (error) {
        // If decoding fails, log error and clear buffer to prevent infinite loop
        const err = error as Error;
        process.stderr.write(`Failed to decode response: ${err.message}\n`);

        // Remove one byte and try again (resync mechanism)
        this._responseBuffer = this._responseBuffer.subarray(1);
      }
    }
  }

  /**
   * Resolve a pending request based on the decoded response
   */
  private _resolvePendingRequest(response: Response): void {
    const pending = this._pending.get(response.id);

    if (!pending) {
      // No pending request for this ID - might be a late response or unknown ID
      process.stderr.write(
        `recived a response for non pending request ${response.id}`,
      );
      return;
    }

    // Remove from pending map
    this._pending.delete(response.id);

    // Resolve or reject based on success flag
    if (response.success) {
      pending.res();
    } else {
      pending.rej(
        new Error(
          `Request ${response.id} failed (method: ${response.method}, level: ${response.level})`,
        ),
      );
    }
  }

  /**
   * Gets the path to the process file to spawn
   */
  private _getSideCarProcessPath(): string {
    return path.join(__dirname, "process.js");
  }

  /**
   * Extract call site information (file:line:column) from stack trace
   */
  private _getCallSite(): string {
    const originalPrepareStackTrace = Error.prepareStackTrace;

    try {
      Error.prepareStackTrace = (_, stack) => stack;
      const err = new Error();
      const stack = err.stack as unknown as NodeJS.CallSite[];

      // Find the first frame outside of logger.ts (skip internal calls)
      // Stack indices: 0 = _getCallSite, 1 = _formatMessage/log, 2 = actual caller
      let frameIndex = 2;

      // Skip internal logger methods to find actual caller
      while (
        frameIndex < stack.length &&
        stack[frameIndex] &&
        stack[frameIndex]?.getFileName()?.includes(__filename)
      ) {
        frameIndex++;
      }

      const frame = stack[frameIndex];

      if (!frame) {
        return "unknown";
      }

      const fileName = frame.getFileName() || "unknown";
      const lineNumber = frame.getLineNumber() || 0;
      const columnNumber = frame.getColumnNumber() || 0;

      // Get just the filename, not full path (optional - remove path.basename if you want full path)
      const shortFileName = path.basename(fileName);

      return `${shortFileName}:${lineNumber}:${columnNumber}`;
    } catch {
      return "unknown";
    } finally {
      Error.prepareStackTrace = originalPrepareStackTrace;
    }
  }

  /**
   * Check if a log level should be processed based on filtering rules
   */
  private _shouldLog(level: LogLevelType): boolean {
    const { minLevel, maxLevel, includeLevels, excludeLevels, filter } =
      this._options;

    // Check whitelist (if specified, only these levels pass)
    if (includeLevels && includeLevels.length > 0) {
      if (!includeLevels.includes(level)) {
        return false;
      }
    }

    // Check blacklist
    if (excludeLevels && excludeLevels.length > 0) {
      if (excludeLevels.includes(level)) {
        return false;
      }
    }

    // Check min level (filter out lower severity)
    if (minLevel !== undefined) {
      if (LogLevelPriority[level] < LogLevelPriority[minLevel]) {
        return false;
      }
    }

    // Check max level (filter out higher severity)
    if (maxLevel !== undefined) {
      if (LogLevelPriority[level] > LogLevelPriority[maxLevel]) {
        return false;
      }
    }

    // Check custom filter function
    if (filter) {
      // Note: filter function is checked in log() with message available
      return true; // Defer to log() method for filter check
    }

    return true;
  }

  /**
   * Verifies the log directory is writable
   */
  private _verifyWritable(): void {
    try {
      const testFile = path.join(this._options.basePath, ".write-test");
      fs.writeFileSync(testFile, "", { flag: "wx" });
      fs.unlinkSync(testFile);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;

      throw new LoggerInitializationError(
        `Log directory "${this._options.basePath}" is not writable: ${nodeError.message}`,
      );
    }
  }

  /**
   * Get the string representation of a log level
   */
  private _getLevelString(level: LogLevelType): string {
    return this._options.logLevelMap[level] ?? "UNKNOWN";
  }

  /**
   * Format timestamp based on the configured timestampType
   */
  private _formatTimestamp(date: Date): string {
    const { timestampType, customTimestampFormat } = this._options;

    switch (timestampType) {
      case "iso":
        return date.toISOString();

      case "locale":
        return date.toLocaleString();

      case "utc":
        return date.toUTCString();

      case "unix":
        return Math.floor(date.getTime() / 1000).toString();

      case "unix_ms":
        return date.getTime().toString();

      case "date":
        return date.toISOString().split("T")[0] as string;

      case "time":
        return date.toTimeString().split(" ")[0] as string;

      case "datetime":
        return date.toISOString().replace("T", " ").replace("Z", "");

      case "short":
        const d = date;
        const day = d.getDate().toString().padStart(2, "0");
        const month = (d.getMonth() + 1).toString().padStart(2, "0");
        const year = d.getFullYear();
        const hours = d.getHours().toString().padStart(2, "0");
        const minutes = d.getMinutes().toString().padStart(2, "0");
        return `${day}/${month}/${year} ${hours}:${minutes}`;

      case "custom":
        if (!customTimestampFormat) {
          return date.toISOString();
        }
        return this._applyCustomFormat(date, customTimestampFormat);

      default:
        return date.toISOString();
    }
  }

  /**
   * Apply custom format string to date
   * Tokens: YYYY=year, MM=month, DD=day, HH=hour, mm=minute, ss=second, ms=millisecond
   */
  private _applyCustomFormat(date: Date, format: string): string {
    const tokens: Record<string, string> = {
      YYYY: date.getFullYear().toString(),
      MM: (date.getMonth() + 1).toString().padStart(2, "0"),
      DD: date.getDate().toString().padStart(2, "0"),
      HH: date.getHours().toString().padStart(2, "0"),
      mm: date.getMinutes().toString().padStart(2, "0"),
      ss: date.getSeconds().toString().padStart(2, "0"),
      ms: date.getMilliseconds().toString().padStart(3, "0"),
    };

    return format.replace(
      /YYYY|MM|DD|HH|mm|ss|ms/g,
      (match) => tokens[match] || match,
    );
  }

  /**
   * Send a request and await a response
   * @param method The specific method to send
   * @returns Promise that resolves if the request got a response
   */
  private async _sendRequest(
    method: MethodType,
    payload: string,
    level: LogLevelType,
  ): Promise<void> {
    const id = this._getNextId();

    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error("Request timed out"));
      }, 5000);

      this._pending.set(id, {
        res: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        rej: (value) => {
          clearTimeout(timeout);
          reject(value);
        },
      });

      try {
        await this._writeToStdin({ id, level, method, payload });
      } catch (err) {
        clearTimeout(timeout);
        this._pending.delete(id);
        reject(err);
      }
    });
  }

  /**
   * Write to the stdin of the process (serialized)
   */
  private async _writeToStdin(request: Request): Promise<void> {
    const stdin = this._process?.stdin;

    if (!stdin || stdin.destroyed || !this._process) {
      throw new Error("Sidecar process stdin not available");
    }

    return new Promise((resolve, reject) => {
      this._writeQueue.push({ request, resolve, reject });
      this._processQueue();
    });
  }

  /**
   * Process the write queue one at a time
   */
  private async _processQueue(): Promise<void> {
    if (this._isWriting || this._writeQueue.length === 0) {
      return;
    }

    this._isWriting = true;
    const { request, resolve, reject } = this._writeQueue.shift()!;

    try {
      await this._performWrite(request);
      resolve();
    } catch (err) {
      reject(err as Error);
    } finally {
      this._isWriting = false;
      // Process next item if any
      if (this._writeQueue.length > 0) {
        // Use setImmediate to avoid stack overflow with large queues
        setImmediate(() => this._processQueue());
      }
    }
  }

  /**
   * Perform actual write with backpressure handling
   */
  private _performWrite(request: Request): Promise<void> {
    const stdin = this._process!.stdin;
    const protocol = this._requestEncoder.encode(request);

    return new Promise((resolve, reject) => {
      // Clean up function to remove listeners
      const cleanup = () => {
        stdin.removeListener("drain", onDrain);
        stdin.removeListener("error", onError);
      };

      const onDrain = () => {
        cleanup();
        resolve();
      };

      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };

      try {
        const canContinue = stdin.write(protocol, (err) => {
          if (err) {
            cleanup();
            reject(err);
          } else {
            cleanup();
            resolve();
          }
        });

        if (!canContinue) {
          // Only add drain listener if we actually need to wait
          stdin.once("drain", onDrain);
          stdin.once("error", onError);
        }
      } catch (syncErr) {
        cleanup();
        reject(syncErr as Error);
      }
    });
  }

  /**
   * Convert any value to string representation
   */
  private _stringify(value: any): string {
    if (value === null) return "null";
    if (value === undefined) return "undefined";

    // Check if value is an Error instance
    if (value instanceof Error) {
      const errorParts: string[] = [];

      // Always present Error properties
      errorParts.push(`name: ${value.name}`);
      errorParts.push(`message: ${value.message}`);

      if (value.stack) {
        errorParts.push(`stack: ${value.stack}`);
      }

      // Additional common Error properties
      if ("code" in value && value.code !== undefined) {
        errorParts.push(`code: ${value.code}`);
      }

      if ("errno" in value && value.errno !== undefined) {
        errorParts.push(`errno: ${value.errno}`);
      }

      if ("syscall" in value && value.syscall !== undefined) {
        errorParts.push(`syscall: ${value.syscall}`);
      }

      if ("path" in value && value.path !== undefined) {
        errorParts.push(`path: ${value.path}`);
      }

      // Capture any other enumerable or non-enumerable custom properties
      const standardProps = [
        "name",
        "message",
        "stack",
        "code",
        "errno",
        "syscall",
        "path",
      ];
      const allProps = Object.getOwnPropertyNames(value);

      for (const prop of allProps) {
        if (!standardProps.includes(prop)) {
          try {
            const propValue = (value as any)[prop];
            // Avoid circular references by doing a simple type check
            if (typeof propValue === "object" && propValue !== null) {
              errorParts.push(`${prop}: [object]`);
            } else {
              errorParts.push(`${prop}: ${propValue}`);
            }
          } catch {
            errorParts.push(`${prop}: [unreadable]`);
          }
        }
      }

      return `Error { ${errorParts.join(", ")} }`;
    }

    if (typeof value === "object") {
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return "[Circular Object]";
      }
    }
    return String(value);
  }

  /**
   * Format a log message with optional fields
   */
  private _formatMessage(
    level: LogLevelType,
    message: any,
    additionalMessages: any[],
  ): string {
    const parts: string[] = [];

    // Add call site if enabled
    if (this._options.showCallSite) {
      const callSite = this._getCallSite();
      parts.push(`[${callSite}]`);
    }

    // Add environment if enabled
    if (this._options.environment) {
      parts.push(`[${this._options.environment}]`);
    }

    // Add hostname if enabled
    if (this._options.showHostname) {
      parts.push(`[${os.hostname()}]`);
    }

    // Add process ID if enabled
    if (this._options.showProcessId) {
      parts.push(`[${process.pid}]`);
    }

    // Add timestamp if enabled
    if (this._options.showTimeStamps) {
      const timestamp = this._formatTimestamp(new Date());
      parts.push(`[${timestamp}]`);
    }

    // Add log level if enabled
    if (this._options.showLogLevel) {
      const levelStr = this._getLevelString(level);
      parts.push(`[${levelStr}]`);
    }

    // Build the message content
    const mainMessage = this._stringify(message);
    const additionalStr = additionalMessages
      .map((msg) => this._stringify(msg))
      .join(" ");

    const fullMessage = additionalStr
      ? `${mainMessage} ${additionalStr}`
      : mainMessage;

    // Combine parts with message
    if (parts.length > 0) {
      return `${parts.join(" ")}: ${fullMessage}`;
    } else {
      return fullMessage;
    }
  }

  /**
   * Apply color to specific parts of the message if colored output is enabled
   */
  private _colorize(level: LogLevelType, message: string): string {
    if (!this._options.useColoredOutput) {
      return message;
    }

    const color = this._options.colorMap[level] || Colors.reset;

    // If we have prefix components, color only those parts
    const hasPrefix =
      this._options.environment ||
      this._options.showHostname ||
      this._options.showProcessId ||
      this._options.showTimeStamps ||
      this._options.showLogLevel ||
      this._options.showCallSite;

    if (hasPrefix) {
      const separatorIndex = message.indexOf(": ");
      if (separatorIndex !== -1) {
        const prefix = message.slice(0, separatorIndex);
        const content = message.slice(separatorIndex + 2);
        return `${color}${prefix}${Colors.reset}: ${content}`;
      }
    }

    return `${color}${message}${Colors.reset}`;
  }

  /**
   * Log a specific level and content
   * @param level The specific level to log
   * @param message The content of the message
   * @param messages Any addtional messages
   */
  log(level: LogLevelType, message: any, ...messages: any[]): void {
    if (!this._shouldLog(level)) {
      return;
    }

    if (this._options.filter) {
      const fullMessage =
        messages.length > 0
          ? [message, ...messages].map((m) => this._stringify(m)).join(" ")
          : this._stringify(message);

      if (!this._options.filter(level, fullMessage)) {
        return;
      }
    }

    const formattedMessage = this._formatMessage(level, message, messages);

    if (this._options.outputToConsole) {
      const coloredMessage = this._colorize(level, formattedMessage);

      if (level === LOG_LEVEL.ERROR || level === LOG_LEVEL.FATAL) {
        process.stderr.write(coloredMessage + "\n");
      } else {
        process.stdout.write(coloredMessage + "\n");
      }
    }

    if (this._options.saveToLogFiles && this._process) {
      this._writeToStdin({
        id: this._getNextId(),
        level,
        method: METHOD.LOG,
        payload: formattedMessage,
      }).catch((err) => {
        process.stderr.write(
          `Failed to write log to sidecar: ${err.message}\n`,
        );
      });
    }
  }

  /**
   * Convenience method for INFO level
   */
  info(message: any, ...messages: any[]): void {
    this.log(LOG_LEVEL.INFO, message, ...messages);
  }

  /**
   * Convenience method for WARN level
   */
  warn(message: any, ...messages: any[]): void {
    this.log(LOG_LEVEL.WARN, message, ...messages);
  }

  /**
   * Convenience method for ERROR level
   */
  error(message: any, ...messages: any[]): void {
    this.log(LOG_LEVEL.ERROR, message, ...messages);
  }

  /**
   * Convenience method for DEBUG level
   */
  debug(message: any, ...messages: any[]): void {
    this.log(LOG_LEVEL.DEBUG, message, ...messages);
  }

  /**
   * Convenience method for FATAL level
   */
  fatal(message: any, ...messages: any[]): void {
    this.log(LOG_LEVEL.FATAL, message, ...messages);
  }

  /**
   * Flushes the remaining logs and then closes the side car
   */
  async flush(): Promise<void> {
    try {
      return await this._sendRequest(METHOD.FLUSH, "", LOG_LEVEL.INFO);
    } finally {
      this._cleanupProcess();
    }
  }

  /**
   * Clean up the sidecar process
   */
  private _cleanupProcess(): void {
    if (this._process && !this._process.killed) {
      // Remove listeners to prevent memory leaks
      this._process.stdout?.removeAllListeners();
      this._process.stderr?.removeAllListeners();
      this._process.removeAllListeners();

      // Kill the process
      this._process.kill("SIGTERM");
      this._process = null;
    }

    // Clear any pending requests that might be stuck
    for (const [id, pending] of this._pending) {
      pending.rej(new Error("Process closed during flush"));
      this._pending.delete(id);
    }
  }

  /**
   * Get current logger options (read-only copy)
   */
  get options(): Readonly<LoggerOptions> {
    return { ...this._options };
  }
}
