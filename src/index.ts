import child_process = require("node:child_process");
import path = require("node:path");
import fs = require("fs");
import type types = require("./types");

/**
 * Holds default options for the logger
 */
const defaultOptions: types.NodeLoggerOptions = {
  logFilesBasePath: "./logs",
  saveToLogFile: true,
  showLogTime: true,
};

/**
 * Represents a logger used to log to node's stdout console and also save logs to log files.
 * Uses a seperate process that writes to log file while the main logger in your application process is non blocking
 */
class NodeLogger {
  /**
   * Holds the options passed to the logger
   */
  private _options: types.NodeLoggerOptions;

  /**
   * Holds ref to the go binary that we write to the stdin of
   */
  private _spawnRef: child_process.ChildProcessWithoutNullStreams | null = null;

  /**
   * Indicates if flush has been sent
   */
  private _isFlushing = false;

  /**
   * Pass additional options on initialization to change the logger's behaviour
   * @param options Change the behaviour of the logger
   */
  constructor(options: Partial<types.NodeLoggerOptions> = defaultOptions) {
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

    this._options.logFilesBasePath = path.resolve(
      this._options.logFilesBasePath,
    );

    if (options.saveToLogFile) {
      let process_path = this.findNodeProcessFile();
      if (!process_path) {
        throw new Error("Failed ot find node_process file");
      }

      this._spawnRef = child_process.spawn("node", [
        process_path,
        `--basePath=${this._options.logFilesBasePath}`,
      ]); // we are spawing a js file so we use node

      process.on("beforeExit", () => {
        this.flush();
      });

      process.on("SIGINT", () => {
        this.flush();
      });

      process.on("SIGTERM", () => {
        this.flush();
      });

      process.on("uncaughtException", () => {
        this.flush();
      });
    }
  }

  /**
   * Trys to find the `node_process` file which spawn the protcol handler
   * @returns The path to the file or undefined
   */
  private findNodeProcessFile() {
    try {
      const files = fs.readdirSync(__dirname);

      const match = files.find((file) => file === "node_process.js");

      return match ? path.join(__dirname, match) : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Log information
   * @param level The specific level of log message
   * @param content A message or error object or object
   * @param contents Any other messages or error objects
   */
  private log(level: types.LogLevel, content: unknown, ...contents: unknown[]) {
    const now = new Date();
    const logParts: string[] = [];

    if (this._options.showLogTime) {
      const timestamp = now.toUTCString();
      logParts.push(`[${timestamp}]`);
    }

    logParts.push(`[${level}]`);

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
      const data = `${fileTime} ${level} ${message}`;
      this.writeToStdin({
        method: "log",
        data,
        id: 1,
      });
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
   * Used to write any remaning logs to the stdin and close the sidecar logger - NEEDS to be called on app exit or on app cleanup
   */
  public flush() {
    if(this._isFlushing) return;
    this._isFlushing = true

    this.writeToStdin({
      id: 1,
      method: "flush",
      data: null,
    });

    console.log("flush ran");
  }

  /**
   * Write to the stdin of the process in the protocol defined
   * @param request The request payload
   */
  private writeToStdin(request: types.NodeProcessRequest) {
    if (typeof request !== "object" || request === null) {
      throw new TypeError("request must be an object");
    }

    if (!this._spawnRef || !this._spawnRef.stdin.writable) {
      throw new Error("Cannot write to stdin");
    }

    const json = JSON.stringify(request);
    const header = `Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n`;
    const payload = header + json;

    try {
      this._spawnRef.stdin.write(payload);
    } catch (error) {
      console.error("Failed to write to node_process");
      console.error(this.extractErrorInfo(error));
      this._spawnRef.kill();
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
