import child_process = require("node:child_process");
import path = require("node:path");
import fs = require("fs");
import type types = require("./types");

/**
 * ANSI Escape Codes for terminal colors
 */
const ANSI_RESET = "\x1b[0m";

/**
 * Holds default options for the logger
 */
const defaultOptions: types.NodeLoggerOptions = {
  logFilesBasePath: "./logs",
  saveToLogFile: true,
  showLogTime: true,
  useAnsiColors: true,
  colorMap: {
    INFO: "\x1b[32m", // Green
    WARN: "\x1b[33m", // Yellow
    ERROR: "\x1b[31m", // Red
  },
  showConsoleOutput: true,
  showStackTraceOfLogCalls: false,
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
   * Tracks the UTC date (YYYY-MM-DD) to handle daily file rotation
   */
  private _currentDateStr: string;

  /**
   * Pass additional options on initialization to change the logger's behaviour
   * @param options Change the behaviour of the logger
   */
  constructor(options: Partial<types.NodeLoggerOptions> = defaultOptions) {
    const mergedColorMap = { ...defaultOptions.colorMap, ...options.colorMap };
    this._options = { ...defaultOptions, ...options, colorMap: mergedColorMap };

    this._currentDateStr = this.getUtcDateString(new Date());

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

    if (this._options.saveToLogFile) {
      let process_path = this.findNodeProcessFile();
      if (!process_path) {
        throw new Error("Failed ot find node_process file");
      }

      this._spawnRef = child_process.spawn("node", [
        process_path,
        `--basePath=${this._options.logFilesBasePath}`,
      ]); // we are spawing a js file so we use node

      // this._spawnRef.stdout.on("data", (chunk) => {
      //   console.log(chunk.toString()) // TODO REMOVE
      // })

      // this._spawnRef.stderr.on("data", (chunk) => {
      //   console.log(chunk.toString()) // TODO REMOVE
      // })
    }
  }

  /**
   * Helper to format a date into a UTC YYYY-MM-DD string
   */
  private getUtcDateString(date: Date): string {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const d = String(date.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  /**
   * Checks if the UTC day has changed
   */
  private checkDateRotation() {
    const nowUtcStr = this.getUtcDateString(new Date());

    if (nowUtcStr !== this._currentDateStr) {
      this._currentDateStr = nowUtcStr;

      this.writeToStdin({
        id: Date.now(),
        method: "reload",
        data: null,
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

    if (this._options.saveToLogFile) {
      this.checkDateRotation();
    }

    const callStack = this.getLogCallStack();
    if (callStack) {
      logParts.push(callStack);
    }

    if (this._options.showLogTime) {
      const timestamp = now.toUTCString();
      logParts.push(`[${timestamp}]`);
    }

    logParts.push(`[${level}]`);

    let message = `${this.extractInfo(content)}`;
    contents.forEach((m) => {
      message += ` ${this.extractInfo(m)}`;
    });
    logParts.push(message);

    let fullConsoleMessage = logParts.join(" ");

    if (this._options.useAnsiColors) {
      const colorCode = this._options.colorMap[level];
      if (colorCode) {
        fullConsoleMessage = `${colorCode}${fullConsoleMessage}${ANSI_RESET}`;
      }
    }

    if (this._options.showConsoleOutput) {
      if (level === "ERROR") console.error(fullConsoleMessage);
      else if (level === "WARN") console.warn(fullConsoleMessage);
      else console.log(fullConsoleMessage);
    }

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
   * as if not it will keep the app alive and wait for flush command
   */
  public flush(): Promise<void> {
    if (this._isFlushing || !this._options.saveToLogFile)
      return Promise.resolve();
    this._isFlushing = true;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this._spawnRef?.removeAllListeners("exit");
        reject(
          new Error(
            "Flush timed out after 4 seconds: Child process failed to exit.",
          ),
        );
      }, 4000);

      this._spawnRef?.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });

      try {
        this.writeToStdin({
          id: 1,
          method: "flush",
          data: null,
        });
      } catch (err) {
        clearTimeout(timeout);
        reject(err);
      }
    });
  }

  /**
   * Captures the stack trace of the caller of the logger (not the logger itself)
   */
  private getLogCallStack(): string | null {
    if (!this._options.showStackTraceOfLogCalls) return null;

    const err = new Error();

    if (!err.stack) return null;

    const lines = err.stack.split("\n");

    return lines[4]?.trim() || null;
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
      console.error(
        "Cannot write to stdin process has quit or not yet spawned",
      );
      throw new Error(
        "Cannot write to stdin process has quit or not yet spawned options: " +
          this.extractInfo(this._options),
      );
    }

    const json = JSON.stringify(request);
    const header = `Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n`;
    const payload = header + json;

    try {
      this._spawnRef.stdin.write(payload);
    } catch (error) {
      console.error("Failed to write to node_process");
      console.error(this.extractInfo(error));
      this._spawnRef.kill();
      throw error;
    }
  }

  /**
   * Extracts as much information as possible from an error or object or any other type and returns it as a string, if it has multiple fields to it
   * then they will be serpated by new lines
   * @param object The error object or any object to extract information from
   * @returns A detailed string representation of the error/object
   */
  private extractInfo(object: unknown): string {
    const parts: string[] = [];

    if (object === null) return "null";
    if (object === undefined) return "undefined";
    if (typeof object === "symbol") {
      parts.push(`symbol: ${object.toString()}`);
      parts.push(`description: ${object.description}`);
      return parts.join("\n");
    }
    if (typeof object === "boolean") return `${object}`;
    if (typeof object === "number") return object.toString();
    if (typeof object === "bigint") return object.toString();
    if (typeof object === "string") return object;
    if (typeof object === "function") {
      parts.push(`name: ${object.name || "(anonymous)"}`);
      parts.push(`params (length): ${object.length}`);
      parts.push(`isAsync: ${object.constructor.name === "AsyncFunction"}`);
      parts.push(
        `isGenerator: ${object.constructor.name === "GeneratorFunction"}`,
      );
      parts.push(`isArrowFunction: ${!object.hasOwnProperty("prototype")}`);
      parts.push(`hasPrototype: ${!!object.prototype}`);
      parts.push(`source: ${object.toString()}`);
      if (object.prototype) {
        parts.push(
          `prototype keys: ${Object.keys(object.prototype).join(", ") || "(none)"}`,
        );
      }
      parts.push(`constructor: ${object.constructor.name}`);

      return parts.join("\n");
    }

    if (object instanceof Error) {
      if (object.name) parts.push(`Name: ${object.name}`);
      if (object.message) parts.push(`Message: ${object.message}`);

      if (object.stack) {
        parts.push(`Stack: ${object.stack}`);
      }

      const nodeError = object as any;
      if (nodeError.code) parts.push(`Code: ${nodeError.code}`);
      if (nodeError.errno) parts.push(`Errno: ${nodeError.errno}`);
      if (nodeError.syscall) parts.push(`Syscall: ${nodeError.syscall}`);
      if (nodeError.path) parts.push(`Path: ${nodeError.path}`);
      if (nodeError.port) parts.push(`Port: ${nodeError.port}`);
      if (nodeError.address) parts.push(`Address: ${nodeError.address}`);
      if (nodeError.dest) parts.push(`Dest: ${nodeError.dest}`);

      for (const key of Object.keys(object)) {
        if (
          ![
            "name",
            "message",
            "stack",
            "code",
            "errno",
            "syscall",
            "path",
            "address",
            "port",
            "errors",
          ].includes(key)
        ) {
          parts.push(`${key}: ${(object as any)[key]}`);
        }
      }

      return parts.join("\n");
    }

    if (typeof object === "object") {
      for (const key of Object.keys(object)) {
        parts.push(`${key}: ${(object as any)[key]}`);
      }
    }

    if (parts.length > 0) {
      return parts.join("\n");
    }

    return "unknown";
  }
}

export = {
  NodeLogger,
};
