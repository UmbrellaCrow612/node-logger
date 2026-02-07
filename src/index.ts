import fs from "node:fs";
import path from "node:path";
import {
  LOG_LEVEL,
  LogLevelType,
  RequestLog,
  LogResponse,
  METHOD,
} from "./protocol";
import os from "node:os";
import { Worker } from "node:worker_threads";

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
   * If this logger's logs should be printed to the stdout of the process
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
  showTimestamps: boolean;

  /**
   * Which timestamp format to use (only applies when showTimestamps is true)
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
   * Map a specific log level with a string value used for it
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
  showTimestamps: true,
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
   * Local reference to options passed
   */
  private _options: LoggerOptions;

  /**
   * Holds the worker thread
   */
  private _worker: Worker | null = null;

  /**
   * A request's id
   */
  private _id = 1;

  /**
   * Gets the next ID; if it exceeds 1 million then rolls back to zero
   */
  private _getNextId = () => {
    if (this._id > 1000000) {
      this._id = 1;
    }

    return this._id++;
  };

  /**
   * Holds batch of LOG requests only (fire-and-forget)
   */
  private _logBatch: RequestLog[] = [];

  /**
   * How long it will wait until it flushes / sends the logs to the worker
   */
  private _logRequestFlushMs = 100;

  /**
   * Holds the timeout for log batch flushing
   */
  private _logBatchTimeout: NodeJS.Timeout | null = null;

  /**
   * How large we want the batch array to get before we send it
   */
  private _logBatchMaxSize = 250;

  /**
   * Holds pending requests that expect a response (FLUSH, RELOAD, SHUTDOWN)
   */
  private _pending: Map<
    number,
    {
      resolve: (value: void | PromiseLike<void>) => void;
      reject: (reason?: any) => void;
    }
  > = new Map();

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
    this._initWorker();
  }

  /**
   * Get the path to the worker
   * @returns Path to the worker
   */
  private _getWorkerPath(): string {
    return path.join(__dirname, "worker.js");
  }

  /**
   * Inits the worker thread
   */
  private _initWorker() {
    if (!this._options.saveToLogFiles) return;

    try {
      const workerPath = this._getWorkerPath();

      this._worker = new Worker(workerPath);

      this._worker.on("message", (response: LogResponse) => {
        this._handleResponse(response);
      });

      this._worker.stderr.on("data", (chunk) => {
        process.stderr.write(`Sidecar error: ${chunk.toString()}`);
      });

      this._worker.on("error", (err) => {
        this._clearPending();
        process.stderr.write(`Sidecar error: ${this._stringify(err)}`);
      });

      this._worker.on("exit", () => {
        this._clearPending();
        this._worker = null;
      });
    } catch (error) {
      process.stderr.write(
        `Failed to spawn sidecar: ${this._stringify(error)}`,
      );
    }
  }

  /**
   * Flush the current log batch to worker immediately
   */
  private _flushLogBatch(): void {
    if (!this._worker || this._logBatch.length === 0) {
      return;
    }

    this._worker.postMessage(this._logBatch);
    this._logBatch = [];
    this._stopLogBatchTimer();
  }

  /**
   * Starts the timer to flush log batch after delay
   */
  private _startLogBatchTimer() {
    if (this._logBatchTimeout) return;

    this._logBatchTimeout = setTimeout(() => {
      this._flushLogBatch();
    }, this._logRequestFlushMs);
  }

  /**
   * Stops the log batch flush timer
   */
  private _stopLogBatchTimer() {
    if (this._logBatchTimeout) {
      clearTimeout(this._logBatchTimeout);
      this._logBatchTimeout = null;
    }
  }

  /**
   * Adds a LOG request to the batch (fire-and-forget)
   */
  private _addToLogBatch(request: RequestLog) {
    this._logBatch.push(request);

    if (this._logBatch.length >= this._logBatchMaxSize) {
      this._flushLogBatch();
    } else {
      this._startLogBatchTimer();
    }
  }

  /**
   * Clears pending requests on process exit/error
   */
  private _clearPending(): void {
    const error = new Error("Sidecar process terminated");
    for (const [_, { reject }] of this._pending) {
      reject(error);
    }
    this._pending.clear();
  }

  /**
   * Handle a decoded response from worker
   */
  private _handleResponse(response: LogResponse): void {
    this._resolvePending(response);

    if (!response.success) {
      process.stderr.write(
        `Log operation failed: id=${response.id}, method=${response.method}, level=${response.level}\n`,
      );
    }
  }

  /**
   * Resolve any pending requests that expected a response
   */
  private _resolvePending(response: LogResponse) {
    const pending = this._pending.get(response.id);
    if (!pending) return;

    if (response.success) {
      pending.resolve();
    } else {
      pending.reject(new Error("Request failed"));
    }
    this._pending.delete(response.id);
  }

  /**
   * Send a request that expects a response (FLUSH, RELOAD, SHUTDOWN)
   * These are sent immediately, not batched
   */
  private _sendControlRequest(request: RequestLog): Promise<void> {
    const id = request.id;
    if(!id) throw new Error("Request must contain and ID")

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this._pending.has(id)) {
          this._pending
            .get(id)
            ?.reject(
              new Error(`Request timed out: ${this._stringify(request)}`),
            );
          this._pending.delete(id);
        }
      }, 4000);

      this._pending.set(id, {
        reject: (reason) => {
          clearTimeout(timeout);
          reject(reason);
        },
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
      });

      this._worker?.postMessage([request]);
    });
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
   * Convert any value to string representation
   */
  private _stringify(value: any): string {
    const valueType = typeof value;

    if (value === null) return "null";
    if (value === undefined) return "undefined";
    if (valueType === "string") return value;
    if (valueType === "number") return String(value);
    if (valueType === "boolean") return String(value);
    if (valueType === "bigint") return `${value}n`;
    if (valueType === "symbol") return value.toString();
    if (valueType === "function")
      return `[Function: ${value.name || "anonymous"}]`;

    // Check if value is an Error instance (must be object, so check after primitives)
    if (value instanceof Error) {
      const errorParts: string[] = [
        `name: ${value.name}`,
        `message: ${value.message}`,
      ];

      if (value.stack) errorParts.push(`stack: ${value.stack}`);
      if ("code" in value && value.code !== undefined)
        errorParts.push(`code: ${value.code}`);
      if ("errno" in value && value.errno !== undefined)
        errorParts.push(`errno: ${value.errno}`);
      if ("syscall" in value && value.syscall !== undefined)
        errorParts.push(`syscall: ${value.syscall}`);
      if ("path" in value && value.path !== undefined)
        errorParts.push(`path: ${value.path}`);

      // Capture custom properties
      const standardProps = new Set([
        "name",
        "message",
        "stack",
        "code",
        "errno",
        "syscall",
        "path",
      ]);
      for (const prop of Object.getOwnPropertyNames(value)) {
        if (standardProps.has(prop)) continue;
        try {
          const propValue = (value as any)[prop];
          errorParts.push(
            `${prop}: ${typeof propValue === "object" && propValue !== null ? "[object]" : propValue}`,
          );
        } catch {
          errorParts.push(`${prop}: [unreadable]`);
        }
      }

      return `Error { ${errorParts.join(", ")} }`;
    }

    if (valueType === "object") {
      const keys = Object.keys(value);
      if (keys.length === 0) return "{}";

      const entries = keys.map((key) => {
        try {
          const val = value[key];
          // Show type for nested objects/arrays, value for primitives
          const display =
            val === null
              ? "null"
              : Array.isArray(val)
                ? "[Array]"
                : typeof val === "object"
                  ? "[Object]"
                  : typeof val === "function"
                    ? "[Function]"
                    : typeof val === "symbol"
                      ? "[Symbol]"
                      : String(val);
          return `${key}: ${display}`;
        } catch {
          return `${key}: [unreadable]`;
        }
      });

      return `{ ${entries.join(", ")} }`;
    }

    // Fallback (shouldn't reach here with standard JS types)
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
    if (this._options.showTimestamps) {
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
   * Apply color to the entire message if colored output is enabled
   */
  private _colorize(level: LogLevelType, message: string): string {
    if (!this._options.useColoredOutput) {
      return message;
    }

    const color = this._options.colorMap[level] || Colors.reset;
    return `${color}${message}${Colors.reset}`;
  }

  /**
   * Log a specific level and content
   * @param level The specific level to log
   * @param message The content of the message
   * @param messages Any additional messages
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

    if (this._options.saveToLogFiles) {
      this._addToLogBatch({ // we don't need ID and level
        method: METHOD.LOG,
        payload: formattedMessage,
      });
    }

    if (this._options.outputToConsole) {
      const coloredMessage = this._colorize(level, formattedMessage);

      if (level === LOG_LEVEL.ERROR || level === LOG_LEVEL.FATAL) {
        process.stderr.write(coloredMessage + "\n");
      } else {
        process.stdout.write(coloredMessage + "\n");
      }
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
   * Flush remaining buffer to log files
   */
  flush(): Promise<void> {
    this._flushLogBatch();

    return this._sendControlRequest({
      id: this._getNextId(),
      level: LOG_LEVEL.INFO,
      method: METHOD.FLUSH,
      payload: "",
    });
  }

  /**
   * Used to reload / refresh the process
   */
  reload(): Promise<void> {
    this._flushLogBatch();

    return this._sendControlRequest({
      id: this._getNextId(),
      level: LOG_LEVEL.INFO,
      method: METHOD.RELOAD,
      payload: "",
    });
  }

  /**
   * Used to shut down the child process and clean up
   */
  shutdown(): Promise<void> {
    this._flushLogBatch();

    return this._sendControlRequest({
      id: this._getNextId(),
      level: LOG_LEVEL.INFO,
      method: METHOD.SHUTDOWN,
      payload: "",
    });
  }

  /**
   * Get current logger options (read-only copy)
   */
  get options(): Readonly<LoggerOptions> {
    return { ...this._options };
  }
}
