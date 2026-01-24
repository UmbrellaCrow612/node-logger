import child_process = require("node:child_process");
import path = require("node:path");

/**
 * Holds default options for the logger
 */
const defaultOptions: NodeLoggerOptions = {
  logFilesBasePath: "./logs",
  saveToLogFile: true,
  showLogTime: true,
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
   * Indicates if stdout console output produced by this logger should be saved to log files (defaults to `true`)
   */
  saveToLogFile: boolean;

  /**
   * The base path / path to the folder to save the log outputs to (defaults to `./logs`) then is converted to an absolute path internally
   */
  logFilesBasePath: string;

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
   * Holds ref to the go binary that we write to the stdin of
   */
  private _spawnRef: child_process.ChildProcessWithoutNullStreams | null = null;

  /**
   * Refrence to the bhinary it spawns
   */
  private readonly goBinaryPath = path.join(
    __dirname,
    `binary-${process.platform}-${process.arch}${process.platform === "win32" ? ".exe" : ""}`,
  );

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

    if (options.saveToLogFile) {
      this._spawnRef = child_process.spawn(this.goBinaryPath, [
        `-base=${this._options.logFilesBasePath}`,
      ]);
    }
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

    const levelStr = level;

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
      const fileTime = this._options.showLogTime ? now.toUTCString() : "";
      console.log(`write:${fileTime} ${level} ${message}\n`)
      this.writeToStdin(`write:${fileTime} ${level} ${message}\n`);
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
   * Runs cleanup logic
   */
  public flush() {
    this.writeToStdin(`exit\n`);
  }

  /**
   * Writes the log message to the stdin of the spawned process
   * @param command The message to add to the log file
   */
  private writeToStdin(command: string) {
    if (typeof command !== "string") {
      throw new TypeError("command must be a string");
    }

    if (!this._spawnRef || !this._spawnRef.stdin.writable) {
      throw new Error("Cannot write to stdin");
    }

    this._spawnRef.stdin.write(command);
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
