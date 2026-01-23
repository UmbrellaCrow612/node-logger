import nodeFs = require("node:fs");
import path = require("node:path");

type NodeLoggerOptions = {
  useColoredOutput: boolean;
  saveToLogFile: boolean;
  logFilesBasePath: string;
  logFileRetentionPeriodInDays: number;
  showLogTime: boolean;
};

type LogLevel = "INFO" | "WARN" | "ERROR";

class NodeLogger {
  private _options: NodeLoggerOptions;
  private _todaysLogFilePath: string | null = null;
  private _messageQueue: string[] = [];
  private _isWriting: boolean = false;

  private static _listenersAttached = false;
  private static _instances: NodeLogger[] = [];

  private readonly MAX_QUEUE_SIZE = 10000;

  constructor(
    options: NodeLoggerOptions = {
      useColoredOutput: true,
      logFilesBasePath: "./logs",
      saveToLogFile: true,
      logFileRetentionPeriodInDays: 30,
      showLogTime: true,
    },
  ) {
    this.validateOptions(options);
    this._options = options;
    this._options.logFilesBasePath = path.resolve(
      this._options.logFilesBasePath,
    );

    if (this._options.saveToLogFile) {
      try {
        this.initLogFileAndFolder();
        NodeLogger._instances.push(this);
        this.attachProcessListeners();
      } catch (error) {
        console.error(
          `Failed to initialize logger: ${this.extractErrorInfo(error)}`,
        );
        throw error;
      }
    }
  }

  private validateOptions(options: NodeLoggerOptions) {
    if (!options || typeof options !== "object")
      throw new TypeError("Options must be an object");
    if (
      typeof options.logFileRetentionPeriodInDays !== "number" ||
      options.logFileRetentionPeriodInDays <= 0
    ) {
      throw new TypeError("logFileRetentionPeriodInDays must be a number > 0");
    }
    if (
      typeof options.logFilesBasePath !== "string" ||
      options.logFilesBasePath.trim() === ""
    ) {
      throw new TypeError("logFilesBasePath must be a non-empty string");
    }
    if (typeof options.saveToLogFile !== "boolean")
      throw new TypeError("saveToLogFile must be a boolean");
    if (typeof options.showLogTime !== "boolean")
      throw new TypeError("showLogTime must be a boolean");
    if (typeof options.useColoredOutput !== "boolean")
      throw new TypeError("useColoredOutput must be a boolean");
  }

  public info(message: string) {
    this.log("INFO", message);
  }
  public warn(message: string) {
    this.log("WARN", message);
  }
  public error(messageOrError: unknown) {
    this.log("ERROR", messageOrError);
  }

  private log(level: LogLevel, content: unknown) {
    const now = new Date();
    const isoTime = now.toISOString();
    const logParts: string[] = [];

    if (this._options.showLogTime) {
      logParts.push(`[${isoTime}]`);
    }

    const colorMap = { INFO: "\x1b[34m", WARN: "\x1b[33m", ERROR: "\x1b[31m" };
    const levelStr = this._options.useColoredOutput
      ? `${colorMap[level]}${level}\x1b[0m`
      : level;

    logParts.push(`[${levelStr}]`);

    const message =
      level === "ERROR" ? this.extractErrorInfo(content) : String(content);
    logParts.push(message);

    const fullConsoleMessage = logParts.join(" ");

    // Direct to correct console stream
    if (level === "ERROR") console.error(fullConsoleMessage);
    else if (level === "WARN") console.warn(fullConsoleMessage);
    else console.log(fullConsoleMessage);

    if (this._options.saveToLogFile) {
      const fileTime = this._options.showLogTime ? isoTime : "";
      this.enqueMessage(`${fileTime} ${level} ${message}`.trim());
    }
  }

  private enqueMessage(message: string) {
    if (this._messageQueue.length >= this.MAX_QUEUE_SIZE) {
      this._messageQueue.shift();
    }
    this._messageQueue.push(message);
    this.processQueue();
  }

  private async processQueue() {
    if (
      this._isWriting ||
      !this._todaysLogFilePath ||
      this._messageQueue.length === 0
    )
      return;

    this._isWriting = true;
    const messages = [...this._messageQueue];
    this._messageQueue = [];

    try {
      await nodeFs.promises.appendFile(
        this._todaysLogFilePath,
        messages.join("\n") + "\n",
        { encoding: "utf8" },
      );
    } catch (error) {
      console.error(`Failed to write logs: ${this.extractErrorInfo(error)}`);
      this._messageQueue.unshift(...messages);
    } finally {
      this._isWriting = false;
      if (this._messageQueue.length > 0) this.processQueue();
    }
  }

  private flushLogsSync() {
    if (!this._todaysLogFilePath || this._messageQueue.length === 0) return;
    try {
      nodeFs.appendFileSync(
        this._todaysLogFilePath,
        this._messageQueue.join("\n") + "\n",
        { encoding: "utf8" },
      );
      this._messageQueue = [];
    } catch (error) {
      console.error(`Failed to flush logs: ${this.extractErrorInfo(error)}`);
    }
  }

  private initLogFileAndFolder() {
    if (!nodeFs.existsSync(this._options.logFilesBasePath)) {
      nodeFs.mkdirSync(this._options.logFilesBasePath, { recursive: true });
    } else if (nodeFs.statSync(this._options.logFilesBasePath).isFile()) {
      throw new Error(
        `Path '${this._options.logFilesBasePath}' is a file, not a directory.`,
      );
    }

    this.cleanupOldLogFiles();
    this._todaysLogFilePath = this.createTodaysLogFile();
  }

  private cleanupOldLogFiles() {
    const files = nodeFs.readdirSync(this._options.logFilesBasePath);
    const now = Date.now();
    const retentionMs =
      this._options.logFileRetentionPeriodInDays * 24 * 60 * 60 * 1000;
    const logFileRegex = /^(\d{4})-(\d{2})-(\d{2})\.log$/;

    for (const file of files) {
      const match = file.match(logFileRegex);
      if (!match) continue;

      const fileDate = Date.UTC(
        parseInt(match[1] as any, 10),
        parseInt(match[2] as any, 10) - 1,
        parseInt(match[3] as any, 10),
      );

      if (now - fileDate > retentionMs) {
        nodeFs.unlinkSync(path.join(this._options.logFilesBasePath, file));
      }
    }
  }

  private createTodaysLogFile(): string {
    const today = new Date();
    const dateString = today.toISOString().split("T")[0];
    const filePath = path.join(
      this._options.logFilesBasePath,
      `${dateString}.log`,
    );

    if (!nodeFs.existsSync(filePath)) {
      nodeFs.writeFileSync(
        filePath,
        `=== Log created on ${dateString} (UTC) ===\n\n`,
        { encoding: "utf8" },
      );
    }
    return filePath;
  }

  private attachProcessListeners() {
    if (NodeLogger._listenersAttached) return;
    NodeLogger._listenersAttached = true;

    const finalFlush = () => {
      NodeLogger._instances.forEach((inst) => inst.flushLogsSync());
    };

    process.on("exit", finalFlush);
    process.on("SIGINT", () => {
      finalFlush();
      process.exit(0);
    });
    process.on("SIGTERM", () => {
      finalFlush();
      process.exit(0);
    });
    process.on("uncaughtException", (err) => {
      console.error("Fatal Error:", err);
      finalFlush();
      process.exit(1);
    });
  }

  private extractErrorInfo(error: unknown): string {
    if (error === null) return "null";
    if (error === undefined) return "undefined";
    if (error instanceof Error) {
      return `[${error.name}] ${error.message}${error.stack ? `\nStack: ${error.stack}` : ""}`;
    }
    if (typeof error === "object") {
      try {
        return JSON.stringify(error, null, 2);
      } catch {
        return "[Unserializable Object]";
      }
    }
    return String(error);
  }

  public destroy() {
    const index = NodeLogger._instances.indexOf(this);
    if (index !== -1) {
      NodeLogger._instances.splice(index, 1);
    }
  }
}

export = { NodeLogger };
