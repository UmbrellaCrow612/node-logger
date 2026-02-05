import fs from "node:fs";
import path from "node:path";
import { LogLevel, LogLevelType } from "./protocol";

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
   * If it should show log level
   */
  showLogLevel: boolean;

  /**
   * Map a specific log level with a string value use for it
   */
  logLevelMap: Record<LogLevelType, string>;
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
  saveToLogFiles: true,
  useColoredOutput: true,
  colorMap: {
    [LogLevel.INFO]: Colors.cyan,
    [LogLevel.WARN]: Colors.yellow,
    [LogLevel.ERROR]: Colors.red,
    [LogLevel.DEBUG]: Colors.gray,
    [LogLevel.FATAL]: Colors.magenta,
  },
  showTimeStamps: true,
  showLogLevel: true,
  logLevelMap: {
    [LogLevel.INFO]: "INFO",
    [LogLevel.WARN]: "WARN",
    [LogLevel.ERROR]: "ERROR",
    [LogLevel.DEBUG]: "DEBUG",
    [LogLevel.FATAL]: "FATAL",
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
  private _options: LoggerOptions;

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
   * Format a log message with optional timestamp and level
   */
  private _formatMessage(
    level: LogLevelType,
    message: any,
    additionalMessages: any[],
  ): string {
    const parts: string[] = [];

    // Add timestamp if enabled
    if (this._options.showTimeStamps) {
      const timestamp = new Date().toISOString();
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

    // If we have timestamp/level prefix, color only those parts
    if (this._options.showTimeStamps || this._options.showLogLevel) {
      // Find where the actual message starts (after ": ")
      const separatorIndex = message.indexOf(": ");
      if (separatorIndex !== -1) {
        const prefix = message.slice(0, separatorIndex);
        const content = message.slice(separatorIndex + 2);
        return `${color}${prefix}${Colors.reset}: ${content}`;
      }
    }

    // Otherwise color the whole message
    return `${color}${message}${Colors.reset}`;
  }

  /**
   * Log a specific level and content
   * @param level The specific level to log
   * @param message The content of the message
   * @param messages Any addtional messages
   */
  log(level: LogLevelType, message: any, ...messages: any[]): void {
    const formattedMessage = this._formatMessage(level, message, messages);

    if (this._options.outputToConsole) {
      const coloredMessage = this._colorize(level, formattedMessage);

      if (level === LogLevel.ERROR || level === LogLevel.FATAL) {
        process.stderr.write(coloredMessage + "\n");
      } else {
        process.stdout.write(coloredMessage + "\n");
      }
    }

    if (this._options.saveToLogFiles) {
      // TODO: Implement file logging
    }
  }

  /**
   * Convenience method for INFO level
   */
  info(message: any, ...messages: any[]): void {
    this.log(LogLevel.INFO, message, ...messages);
  }

  /**
   * Convenience method for WARN level
   */
  warn(message: any, ...messages: any[]): void {
    this.log(LogLevel.WARN, message, ...messages);
  }

  /**
   * Convenience method for ERROR level
   */
  error(message: any, ...messages: any[]): void {
    this.log(LogLevel.ERROR, message, ...messages);
  }

  /**
   * Convenience method for DEBUG level
   */
  debug(message: any, ...messages: any[]): void {
    this.log(LogLevel.DEBUG, message, ...messages);
  }

  /**
   * Convenience method for FATAL level
   */
  fatal(message: any, ...messages: any[]): void {
    this.log(LogLevel.FATAL, message, ...messages);
  }

  /**
   * Get current logger options (read-only copy)
   */
  get options(): Readonly<LoggerOptions> {
    return { ...this._options };
  }
}
