import nodeFs = require("node:fs");
import path = require("node:path");
import nodeUtil = require("node:util");

/**
 * Holds default options for the logger
 */
const defaultOptions: NodeLoggerOptions = {
  logFileRetentionPeriodInDays: 30,
  logFilesBasePath: "./logs",
  saveToLogFile: true,
  showLogTime: true,
  useColoredOutput: true,
};

/**
 * Holds specific log levels and their colors to be printed in
 */
const colorMap: Record<LogLevel, string> = {
  INFO: "\x1b[34m",
  WARN: "\x1b[33m",
  ERROR: "\x1b[31m",
};

/**
 * Indicates which level of log should be used
 */
type LogLevel = "WARN" | "INFO" | "ERROR";

/**
 * List of options you can pass to change the logger behaviour
 */
type NodeLoggerOptions = {
  /**
   * Indicates if output produced specifically to the stdout console should be colored (defaults to `true`)
   */
  useColoredOutput: boolean;

  /**
   * Indicates if stdout console output produced by this logger should be saved to log files (defaults to `true`)
   */
  saveToLogFile: boolean;

  /**
   * The base path / path to the folder to save the log outputs to (defaults to `./logs`) then is converted to an absolute path internally
   */
  logFilesBasePath: string;

  /**
   * Indicates how long old log files should be kept (defaults to `30` days)
   */
  logFileRetentionPeriodInDays: number;

  /**
   * Indicates if it should add the time of when the log was made for a given log item (defaults to `true`)
   */
  showLogTime: boolean;
};

/**
 * Represents a logger used to log to node's stdout console and also save logs to log files.
 * Uses some blocking at the beginning if you want to save output to log files
 * as it has to ensure it makes the folder and file.
 * Logs themselves are asynchronously added in a queue system then added to log files.
 */
class NodeLogger {
  /**
   * Holds the options passed to the logger
   */
  private _options: NodeLoggerOptions;

  /**
   * Queue for log messages waiting to be written to file
   */
  private _messageQueue: string[] = [];

  /**
   * How many messages we can hold before we start dropping old ones if we cannot write to log file
   */
  private _maxQueueMessages = 500;

  /**
   * Indicates if a write operation is currently in progress
   */
  private _isWriting: boolean = false;

  /**
   * Indicates when the last clean happened; should be every 24 hours.
   * Holds a UTC string of when it last happened.
   */
  private _lastCleanedOldLogsUtc: string | null = null;

  /**
   * Pass additional options on initialization to change the logger's behaviour
   * @param options Change the behaviour of the logger
   */
  constructor(options: Partial<NodeLoggerOptions> = defaultOptions) {
    this._options = { ...defaultOptions, ...options };

    if (typeof this._options !== "object") {
      throw new TypeError(
        "Options passed cannot be null or undefined; it must be an object",
      );
    }

    if (
      typeof this._options.logFileRetentionPeriodInDays !== "number" ||
      (typeof this._options.logFileRetentionPeriodInDays === "number" &&
        this._options.logFileRetentionPeriodInDays <= 0)
    ) {
      throw new TypeError(
        "logFileRetentionPeriodInDays must be a number and greater than 0",
      );
    }

    if (
      typeof this._options.logFilesBasePath !== "string" ||
      (typeof this._options.logFilesBasePath === "string" &&
        this._options.logFilesBasePath.trim() === "")
    ) {
      throw new TypeError("logFilesBasePath must be a non-empty string");
    }

    if (typeof this._options.saveToLogFile !== "boolean") {
      throw new TypeError("saveToLogFile must be a boolean");
    }

    if (typeof this._options.showLogTime !== "boolean") {
      throw new TypeError("showLogTime must be a boolean");
    }

    if (typeof this._options.useColoredOutput !== "boolean") {
      throw new TypeError("useColoredOutput must be a boolean");
    }

    this._options.logFilesBasePath = path.resolve(
      this._options.logFilesBasePath,
    );

    try {
      if (
        this._options.saveToLogFile &&
        !nodeFs.existsSync(this._options.logFilesBasePath)
      ) {
        nodeFs.mkdirSync(this._options.logFilesBasePath, { recursive: true });
      }
    } catch (error) {
      throw new Error(
        `Could not create log directory: ${this.extractErrorInfo(error)}`,
      );
    }

    try {
      if (this._options.saveToLogFile) {
        this.cleanupOldLogFiles();
        this._lastCleanedOldLogsUtc = new Date().toUTCString();
      }
    } catch (error) {
      console.error(
        `Failed to initialize logger error: ${this.extractErrorInfo(error)}`,
      );

      throw error;
    }
  }

  /**
   * Checks if 24 hours have passed since the last log cleanup.
   */
  private shouldCleanOldLogs(): boolean {
    if (!this._lastCleanedOldLogsUtc) {
      return true;
    }

    const lastCleaned = new Date(this._lastCleanedOldLogsUtc).getTime();
    const now = new Date().getTime();

    const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

    return now - lastCleaned >= TWENTY_FOUR_HOURS_MS;
  }

  /**
   * Log information
   * @param level The specific level of log message
   * @param content A message or error object or object
   * @param contents Any other messages or error objects
   */
  private log(level: LogLevel, content: unknown, ...contents: unknown[]) {
    const now = new Date();
    const logParts: string[] = [];

    if (this._options.showLogTime) {
      const timestamp = now.toUTCString();
      logParts.push(`[${timestamp}]`);
    }

    const levelStr = this._options.useColoredOutput
      ? `${colorMap[level]}${level}\x1b[0m`
      : level;

    logParts.push(`[${levelStr}]`);

    let message = `${this.extractErrorInfo(content)}`;
    contents.forEach((m) => {
      message += ` ${this.extractErrorInfo(m)}`;
    });
    logParts.push(message);

    const fullConsoleMessage = logParts.join(" ");

    if (level === "ERROR") console.error(fullConsoleMessage);
    else if (level === "WARN") console.warn(fullConsoleMessage);
    else console.log(fullConsoleMessage);

    if (this._options.saveToLogFile) {
      if (this.shouldCleanOldLogs()) {
        this.cleanupOldLogFiles();
        this._lastCleanedOldLogsUtc = new Date().toUTCString();
      }

      const fileTime = this._options.showLogTime ? now.toUTCString() : "";
      this.enqueMessage(`${fileTime} ${level} ${message}`.trim());
    }
  }

  /**
   * Logs an informational message to the console
   * @param message The message to log
   * @param messages Any other message objects or error objects
   */
  public info(message: unknown, ...messages: unknown[]) {
    this.log("INFO", message, ...messages);
  }

  /**
   * Logs a warning message to the console
   * @param message The message to log
   * @param messages Any other message objects or error objects
   */
  public warn(message: unknown, ...messages: unknown[]) {
    this.log("WARN", message, ...messages);
  }

  /**
   * Logs an error message to the console.
   * It is recommended you pass the actual error object so we can print as much information as possible.
   *
   * For example:
   *
   * ```ts
   * logger.error(new Error(""));
   * ```
   * @param messageOrError The error object or message to log
   * @param messages Any other message objects or error objects
   */
  public error(messageOrError: unknown, ...messages: unknown[]) {
    this.log("ERROR", messageOrError, ...messages);
  }

  /**
   * Gets today's log file path.
   * Because if it runs for 24 hours we need to recompute it each time
   * to make sure we don't write to stale log files.
   * The format is as follows: base path provided, then the filename is `YYYY-MM-DD`
   */
  private getTodaysLogFilePath(): string {
    const date = new Date().toISOString().split("T")[0] as string;

    return path.normalize(
      path.join(this._options.logFilesBasePath, `${date}.log`),
    );
  }

  /**
   * Enqueues the log message to be asynchronously added to the log file
   * @param message The message to add to the log file
   */
  private enqueMessage(message: string) {
    if (this._messageQueue.length >= this._maxQueueMessages) {
      this._messageQueue.shift();
    }
    this._messageQueue.push(message);
    this.processQueue();
  }

  /**
   * Processes the message queue asynchronously
   */
  private async processQueue() {
    if (this._isWriting) return;
    this._isWriting = true;

    while (this._messageQueue.length > 0) {
      const messages = this._messageQueue.splice(0);
      try {
        const content = messages.join("\n") + "\n";
        await nodeFs.promises.appendFile(this.getTodaysLogFilePath(), content, {
          encoding: "utf8",
        });
      } catch (error) {
        console.error(
          `Failed to write logs to file: ${this.extractErrorInfo(error)}`,
        );
        this._messageQueue.unshift(...messages);
        break;
      }
    }

    this._isWriting = false;
  }

  /**
   * Synchronously flushes all remaining logs in the queue to the log file.
   * Used during process exit to ensure no logs are lost.
   */
  public flushLogsSync() {
    if (this._messageQueue.length === 0) {
      return;
    }

    try {
      const content = this._messageQueue.join("\n") + "\n";
      nodeFs.appendFileSync(this.getTodaysLogFilePath(), content, {
        encoding: "utf8",
      });
      this._messageQueue = [];
    } catch (error) {
      console.error(
        `Failed to flush logs on exit: ${this.extractErrorInfo(error)}`,
      );
    }
  }

  /**
   * Removes log files older than the retention period
   */
  private cleanupOldLogFiles() {
    try {
      const files = nodeFs.readdirSync(this._options.logFilesBasePath);
      const now = new Date();
      const retentionMs =
        this._options.logFileRetentionPeriodInDays * 24 * 60 * 60 * 1000;

      for (const file of files) {
        if (!file.endsWith(".log")) continue;

        const dateString = file.replace(".log", "");
        const fileDate = new Date(`${dateString}T00:00:00Z`);

        if (isNaN(fileDate.getTime())) continue;

        const fileAgeMs = now.getTime() - fileDate.getTime();

        if (fileAgeMs > retentionMs) {
          nodeFs.unlinkSync(path.join(this._options.logFilesBasePath, file));
        }
      }
    } catch (error) {
      console.error(`Cleanup failed: ${this.extractErrorInfo(error)}`);
    }
  }

  /**
   * Extracts as much information as possible from an error or object and returns it as a string
   * @param error The error object or any object to extract information from
   * @returns A detailed string representation of the error/object
   */
  private extractErrorInfo(error: unknown): string {
    if (error === null) return "null";
    if (error === undefined) return "undefined";
    if (typeof error !== "object") return String(error);

    return nodeUtil.inspect(error, {
      showHidden: true,
      depth: null,
      colors: false,
      compact: false,
      sorted: true,
      maxArrayLength: 100,
    });
  }
}

export = {
  NodeLogger,
};
