import nodeFs = require("node:fs");
import path = require("node:path");

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
   * Indicates if it should stack traces i.e the location of where the log was made on what line, useful to quickly navigate to the location using for example
   * text editors like vs code (defaults to `true`)
   */
  showStackTraces: boolean;

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
 * Represents a logger used to log to node's stdout console and also save logs to log files
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
   * Pass addtional options on initialization to change the loggers behaviour
   * @param options Change the behaviour of the logger
   */
  constructor(
    options: NodeLoggerOptions = {
      useColoredOutput: true,
      logFilesBasePath: "./logs",
      saveToLogFile: true,
      logFileRetentionPeriodInDays: 30,
      showStackTraces: true,
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

    if (typeof this._options.showStackTraces !== "boolean") {
      throw new TypeError("showStackTraces must be a boolean");
    }

    if (typeof this._options.useColoredOutput !== "boolean") {
      throw new TypeError("useColoredOutput must be a boolean");
    }

    this._options.logFilesBasePath = path.resolve(
      this._options.logFilesBasePath,
    );

    try {
      this.init();
    } catch (error) {
      console.error(
        `Failed to initlize logger error: ${this.extractErrorInfo(error)}`,
      );

      throw error;
    }
  }

  /**
   * Runs initialization such as making log folders on start and other needed functions
   */
  private init() {
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

    if (this._options.saveToLogFile) {
      this.cleanupOldLogFiles();
      this._todaysLogFilePath = this.createTodaysLogFile();
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

        try {
          const dateString = file.replace(".log", "");
          const fileDateParts = dateString.split("-");

          if (fileDateParts.length !== 3) {
            console.warn(`Skipping file with invalid date format: ${file}`);
            continue;
          }

          const year = parseInt(fileDateParts[0] as any, 10);
          const month = parseInt(fileDateParts[1] as any, 10) - 1; // JS months are 0-indexed
          const day = parseInt(fileDateParts[2] as any, 10);

          if (isNaN(year) || isNaN(month) || isNaN(day)) {
            console.warn(`Skipping file with invalid date values: ${file}`);
            continue;
          }

          const fileDate = new Date(year, month, day);

          if (isNaN(fileDate.getTime())) {
            console.warn(`Skipping file with invalid date: ${file}`);
            continue;
          }

          const fileAgeMs = now.getTime() - fileDate.getTime();

          if (fileAgeMs > retentionMs) {
            const filePath = path.join(this._options.logFilesBasePath, file);
            nodeFs.unlinkSync(filePath);
            console.log(
              `Deleted old log file: ${file} (age: ${Math.floor(fileAgeMs / (24 * 60 * 60 * 1000))} days)`,
            );
          }
        } catch (error) {
          console.error(
            `Failed to process log file ${file}: ${this.extractErrorInfo(error)}`,
          );
          continue;
        }
      }
    } catch (error) {
      console.error(
        `Failed to cleanup old log files: ${this.extractErrorInfo(error)}`,
      );

      throw error;
    }
  }

  /**
   * Creates today's log file if it doesn't already exist
   * @returns The path to today's log file
   */
  private createTodaysLogFile(): string {
    try {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, "0");
      const day = String(today.getDate()).padStart(2, "0");

      const dateString = `${year}-${month}-${day}`;
      const fileName = `${dateString}.log`;
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
        const header = `=== Log file created on ${dateString} ===\n\n`;
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
