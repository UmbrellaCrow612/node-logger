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

    this._options = {
      ...defaultLoggerOptions,
      ...options,
      colorMap: mergedColorMap,
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
    switch (level) {
      case LogLevel.INFO:
        return "INFO";
      case LogLevel.WARN:
        return "WARN";
      case LogLevel.ERROR:
        return "ERROR";
      case LogLevel.DEBUG:
        return "DEBUG";
      case LogLevel.FATAL:
        return "FATAL";
      default:
        return "UNKNOWN";
    }
  }

  /**
   * Format a log message with timestamp and level
   */
  private _formatMessage(
    level: LogLevelType,
    message: any,
    additionalMessages: any[],
  ): string {
    const timestamp = new Date().toISOString();
    const levelStr = this._getLevelString(level);

    const mainMessage =
      typeof message === "object"
        ? JSON.stringify(message, null, 2)
        : String(message);

    const additionalStr = additionalMessages
      .map((msg) =>
        typeof msg === "object" ? JSON.stringify(msg, null, 2) : String(msg),
      )
      .join(" ");

    const fullMessage = additionalStr
      ? `${mainMessage} ${additionalStr}`
      : mainMessage;

    return `[${timestamp}] [${levelStr}]: ${fullMessage}`;
  }

  /**
   * Apply color to a message if colored output is enabled
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
