import nodeFs = require("node:fs");
import path = require("node:path");

/**
 * Holds specific log levels and there colors to be rpinted in
 */
const colorMap = { INFO: "\x1b[34m", WARN: "\x1b[33m", ERROR: "\x1b[31m" };

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
   * The base path / path to the folder to save the log outputs to (defaults to `./logs`) then is converted to a absoulte path interally
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
 * Represents a logger used to log to node's stdout console and also save logs to log files, uses some blocking at the begining if you want to save output to log files
 * as it has to ensure it makes the folder and file, logs themselves are asynchronously added in queue system.
 */
class NodeLogger {
  /**
   * Holds the options passed to the logger
   */
  private _options: NodeLoggerOptions;

  /**
   * Holds path to todays log file to append new logs to or null if they arent saving logs to files
   */
  private _todaysLogFilePath: string | null = null;

  /**
   * Queue for log messages waiting to be written to file
   */
  private _messageQueue: string[] = [];

  /**
   * How many messages we cna hold beofre we start dropping old ones if we cannot write to log file
   */
  private _maxQueueMessages = 500;

  /**
   * Indicates if a write operation is currently in progress
   */
  private _isWriting: boolean = false;

  /**
   * Pass addtional options on initialization to change the loggers behaviour
   * @param options Change the behaviour of the logger
   */
  constructor(
    options: NodeLoggerOptions = {
      useColoredOutput: true,
      logFilesBasePath: "./logs",
      saveToLogFile: true,
      logFileRetentionPeriodInDays: 30,
      showLogTime: true,
    },
  ) {
    this._options = options;

    if (typeof this._options !== "object") {
      throw new TypeError(
        "Options passed cannot be null or undefined it must be a object",
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
      throw new TypeError("logFilesBasePath must be a non empty string");
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
      if (this._options.saveToLogFile) {
        this.initLogFileAndFolder();
      }
    } catch (error) {
      console.error(
        `Failed to initlize logger error: ${this.extractErrorInfo(error)}`,
      );

      throw error;
    }
  }

  /**
   * Log information
   * @param level The specific level of log message
   * @param message A message or error object or object
   */
  private log(level: LogLevel, content: unknown) {
    const now = new Date();
    const logParts: string[] = [];

    if (this._options.showLogTime) {
      const now = new Date();
      const timestamp = now.toUTCString();
      logParts.push(`[${timestamp}]`);
    }

    const levelStr = this._options.useColoredOutput
      ? `${colorMap[level]}${level}\x1b[0m`
      : level;

    logParts.push(`[${levelStr}]`);

    const message =
      level === "ERROR" ? this.extractErrorInfo(content) : String(content);
    logParts.push(message);

    const fullConsoleMessage = logParts.join(" ");

    if (level === "ERROR") console.error(fullConsoleMessage);
    else if (level === "WARN") console.warn(fullConsoleMessage);
    else console.log(fullConsoleMessage);

    if (this._options.saveToLogFile) {
      const fileTime = this._options.showLogTime ? now.toUTCString() : "";
      this.enqueMessage(`${fileTime} ${level} ${message}`.trim());
    }
  }

  /**
   * Logs an informational message to the console
   * @param message The message to log
   */
  public info(message: string) {
    this.log("INFO", message);
  }

  /**
   * Logs a warning message to the console
   * @param message The message to log
   */
  public warn(message: string) {
    this.log("WARN", message);
  }

  /**
   * Logs an error message to the console - pass any message but it is reccomended you pass the actual error object so we can print as much information for you.
   *
   * For example:
   *
   * ```ts
   * logger.error(new Error(""));
   * ```
   * @param messageOrError The error object or message to log
   */
  public error(messageOrError: unknown) {
    this.log("ERROR", messageOrError);
  }

  /**
   * Enques the log message to be async added to the log file
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
    if (this._isWriting || !this._todaysLogFilePath) {
      return;
    }

    if (this._messageQueue.length === 0) {
      return;
    }

    this._isWriting = true;

    const messages = [...this._messageQueue];
    this._messageQueue = [];

    try {
      const content = messages.join("\n") + "\n";

      await nodeFs.promises.appendFile(this._todaysLogFilePath, content, {
        encoding: "utf8",
      });
    } catch (error) {
      console.error(
        `Failed to write logs to file: ${this.extractErrorInfo(error)}`,
      );
      this._messageQueue.unshift(...messages);
    } finally {
      this._isWriting = false;

      if (this._messageQueue.length > 0) {
        this.processQueue();
      }
    }
  }

  /**
   * Synchronously flushes all remaining logs in the queue to the log file
   * Used during process exit to ensure no logs are lost
   */
  public flushLogsSync() {
    if (!this._todaysLogFilePath || this._messageQueue.length === 0) {
      return;
    }

    try {
      const content = this._messageQueue.join("\n") + "\n";
      nodeFs.appendFileSync(this._todaysLogFilePath, content, {
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
   * Runs initialization such as making log folders on start and other needed functions
   */
  private initLogFileAndFolder() {
    if (nodeFs.existsSync(this._options.logFilesBasePath)) {
      const stats = nodeFs.statSync(this._options.logFilesBasePath);

      if (stats.isFile()) {
        throw new Error(
          `Log files base path '${this._options.logFilesBasePath}' exists but is a file, not a directory`,
        );
      }
    } else {
      try {
        nodeFs.mkdirSync(this._options.logFilesBasePath, { recursive: true });
      } catch (error) {
        throw new Error(
          `Failed to create log directory at '${this._options.logFilesBasePath}': ${this.extractErrorInfo(error)}`,
        );
      }
    }

    this.cleanupOldLogFiles();
    this._todaysLogFilePath = this.createTodaysLogFile();
  }

  /**
   * Removes log files older than the retention period
   */
 private cleanupOldLogFiles() {
    try {
      const files = nodeFs.readdirSync(this._options.logFilesBasePath);
      const now = new Date();
      const retentionMs = this._options.logFileRetentionPeriodInDays * 24 * 60 * 60 * 1000;

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
   * Generates a UTC-based date string (YYYY-MM-DD)
   */
  private getUtcDateString(date: Date): string {
    return date.toISOString().split("T")[0] as string;
  }

  /**
   * Creates today's log file if it doesn't already exist
   * @returns The path to today's log file
   */
  private createTodaysLogFile(): string {
    try {
      const now = new Date();
      const fileName = `${this.getUtcDateString(now)}.log`;
      const filePath = path.join(this._options.logFilesBasePath, fileName);

      if (nodeFs.existsSync(filePath)) {
        const stats = nodeFs.statSync(filePath);

        if (!stats.isFile()) {
          throw new Error(
            `Log file path '${filePath}' exists but is not a file`,
          );
        }

        return filePath;
      }

      try {
        const header = `=== Log file created on ${this.getUtcDateString(now)} ===\n\n`;
        nodeFs.writeFileSync(filePath, header, { encoding: "utf8" });

        console.log(`Created new log file: ${fileName}`);
        return filePath;
      } catch (error) {
        throw new Error(
          `Failed to create log file at '${filePath}': ${this.extractErrorInfo(error)}`,
        );
      }
    } catch (error) {
      console.error(
        `Failed to create today's log file: ${this.extractErrorInfo(error)}`,
      );

      throw error;
    }
  }

  /**
   * Extracts as much information as possible from an error or object and returns it as a string
   * @param error The error object or any object to extract information from
   * @returns A detailed string representation of the error/object
   */
  private extractErrorInfo(error: unknown): string {
    const parts: string[] = [];

    if (error === null) return "null";
    if (error === undefined) return "undefined";

    if (typeof error !== "object") {
      return String(error);
    }

    if (error instanceof Error) {
      if (error.name) parts.push(`Name: ${error.name}`);
      if (error.message) parts.push(`Message: ${error.message}`);

      if (error.stack) {
        parts.push(`Stack: ${error.stack}`);
      }

      const nodeError = error as any;
      if (nodeError.code) parts.push(`Code: ${nodeError.code}`);
      if (nodeError.errno) parts.push(`Errno: ${nodeError.errno}`);
      if (nodeError.syscall) parts.push(`Syscall: ${nodeError.syscall}`);
      if (nodeError.path) parts.push(`Path: ${nodeError.path}`);
      if (nodeError.port) parts.push(`Port: ${nodeError.port}`);
      if (nodeError.address) parts.push(`Address: ${nodeError.address}`);
      if (nodeError.dest) parts.push(`Dest: ${nodeError.dest}`);
    }

    try {
      const obj = error as Record<string, unknown>;
      const keys = Object.keys(obj);

      for (const key of keys) {
        if (
          error instanceof Error &&
          ["name", "message", "stack"].includes(key)
        ) {
          continue;
        }

        try {
          const value = obj[key];

          if (value === null) {
            parts.push(`${key}: null`);
          } else if (value === undefined) {
            parts.push(`${key}: undefined`);
          } else if (typeof value === "function") {
            parts.push(`${key}: [Function]`);
          } else if (typeof value === "object") {
            try {
              const stringified = JSON.stringify(value, null, 2);
              parts.push(`${key}: ${stringified}`);
            } catch {
              parts.push(`${key}: [Object - could not stringify]`);
            }
          } else {
            parts.push(`${key}: ${String(value)}`);
          }
        } catch {
          parts.push(`${key}: [Could not access property]`);
        }
      }
    } catch {}

    if (parts.length > 0) {
      return parts.join("\n");
    }

    try {
      const obj = error as any;

      if (
        typeof obj.toString === "function" &&
        obj.toString !== Object.prototype.toString
      ) {
        return obj.toString();
      }

      if (typeof obj.toJSON === "function") {
        return JSON.stringify(obj.toJSON(), null, 2);
      }

      return JSON.stringify(error, null, 2);
    } catch {
      return "[Unable to extract error information]";
    }
  }
}

export = {
  NodeLogger,
};
